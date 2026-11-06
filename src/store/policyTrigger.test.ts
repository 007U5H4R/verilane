/**
 * TKT-75.03 fix round 1 (M2, m2): the detail page's Policy trigger helpers.
 * `policyInputsFor` decides whether Policy applies and with which inputs;
 * `ensurePolicyEvaluated` turns a missing bank line or a rejected
 * evaluation into an err (an error state), never an `amount ?? 0` verdict.
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { paise } from "@/domain/money";
import { POLICY_CONFIG_VERSION, policyInputFingerprint } from "@/domain/policy";
import { ok } from "@/domain/result";
import type { Exception } from "@/domain/schema";
import { openDb, type VerilaneDb } from "./db";
import { ensurePolicyEvaluated, policyInputsFor, type ExceptionDetail } from "./hooks";

const exception: Exception = {
  review_id: "RV-PAY-P-012",
  kind: "unallocated_payment",
  payment_id: "P-012",
  candidate_invoice_ids: ["INV-F"],
  linked_review_ids: [],
  recommendation: "",
  evidence_ids: [],
  validation_status: "verified",
  escalation_reason: "",
  requires_role: "analyst",
  status: "open",
};

const recommendation = ok({
  exception_id: "RV-PAY-P-012",
  facts: [{ claimId: "a", kind: "amount" as const, value: "₹25,000.00", evidenceId: "P-012:payments.csv:amount_paise" }],
  recommendation_text: "x",
  confidence: "high" as const,
  candidate_invoice_ids: ["INV-F"],
  generated_at: "2026-11-05T00:00:00.000Z",
});

const detail = (over: Partial<ExceptionDetail> = {}): ExceptionDetail => ({
  exception,
  payment: { payment_id: "P-012", invoice_id: null, paid_on: "2026-10-28", amount_paise: paise(2_500_000) },
  candidates: [],
  audit: [],
  unappliedCashPaise: paise(2_500_000),
  unappliedCount: 1,
  recommendation,
  ...over,
});

describe("policyInputsFor", () => {
  it("an open payment exception: amount, Recommend's confidence and the matching fingerprint", () => {
    const r = policyInputsFor(detail());
    expect(r.ok).toBe(true);
    if (!r.ok || !r.value) throw new Error("expected inputs");
    expect(r.value.amountPaise).toBe(2_500_000);
    expect(r.value.confidence).toBe("high");
    expect(r.value.fingerprint).toBe(
      policyInputFingerprint({ exception, amountPaise: 2_500_000, confidence: "high" }, POLICY_CONFIG_VERSION),
    );
  });

  it("a closed exception: null — closed exceptions intentionally get no new decision", () => {
    const r = policyInputsFor(detail({ exception: { ...exception, status: "actioned" } }));
    expect(r).toEqual({ ok: true, value: null });
  });

  it("the bank line is missing: err, never an amount of 0", () => {
    const r = policyInputsFor(detail({ payment: undefined }));
    expect(r.ok).toBe(false);
  });
});

describe("ensurePolicyEvaluated", () => {
  let db: VerilaneDb | undefined;
  afterEach(async () => {
    if (db) {
      const name = db.name;
      db.close();
      await Dexie.delete(name);
      db = undefined;
    }
  });

  it("evaluates and persists once, citing Recommend's evidence on its audit event", async () => {
    db = (await openDb("policy-trigger-ok")).db;
    const r = await ensurePolicyEvaluated(db, detail());
    expect(r.ok && r.value?.verdict).toBe("auto_permitted");
    const rec = await db.audit.where("action").equals("recommend_generated").first();
    expect(rec?.evidence_ids).toEqual(["P-012:payments.csv:amount_paise"]);
  });

  it("missing payment: err and nothing persisted (m2)", async () => {
    db = (await openDb("policy-trigger-missing")).db;
    const r = await ensurePolicyEvaluated(db, detail({ payment: undefined }));
    expect(r.ok).toBe(false);
    expect(await db.policyDecisions.count()).toBe(0);
    expect(await db.audit.count()).toBe(0);
  });

  it("a thrown persistence failure surfaces as err, not an unhandled rejection", async () => {
    db = (await openDb("policy-trigger-throw")).db;
    db.audit.hook("creating", () => {
      throw new Error("disk full");
    });
    const r = await ensurePolicyEvaluated(db, detail());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/disk full/);
  });

  it("closed exception: ok(null), nothing persisted", async () => {
    db = (await openDb("policy-trigger-closed")).db;
    const r = await ensurePolicyEvaluated(db, detail({ exception: { ...exception, status: "actioned" } }));
    expect(r).toEqual({ ok: true, value: null });
    expect(await db.policyDecisions.count()).toBe(0);
  });
});
