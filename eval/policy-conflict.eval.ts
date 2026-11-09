/**
 * TKT-75.04 · TC-75.25 — eval gate `policy-conflict-executed = 0`.
 *
 * A policy conflict executed = the Execute agent wrote an allocation that the
 * persisted PolicyDecision did not permit. Every seeded exception is driven
 * through Execute under each forced verdict, plus the two cross-ticket traps:
 * a stale latest decision (risk a) and a Manager-reversed allocation (risk b).
 * Any allocation written in a case whose verdict is not a fresh
 * `auto_permitted` counts. A positive control proves the gate is not vacuous:
 * a fresh `auto_permitted` must execute.
 *
 * Red proof (not shipped): with runExecuteAgent temporarily patched to skip
 * the verdict check, this gate fails (.scratch/task75/79.4/red-tc-75.25.log).
 */
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ok } from "@/domain/result";
import {
  evaluatePolicyForException,
  POLICY_CONFIG_VERSION,
  POLICY_VERDICTS,
  policyInputFingerprint,
  type PolicyVerdict,
} from "@/domain/policy";
import type { Exception } from "@/domain/schema";
import { type AuditEventRow, VerilaneDb } from "@/store/db";
import { ensureSeeded, type Fetcher } from "@/store/loader";
import { executeAgent } from "@/store/tx";

function seedFetcher(): Fetcher {
  const dir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = Object.fromEntries(names.map((n) => [`/seed/${n}`, readFileSync(join(dir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

type Trap = "none" | "stale" | "reversed";
interface Case {
  exception_id: string;
  kind: string;
  verdict: PolicyVerdict | "none";
  trap: Trap;
}
interface CaseResult extends Case {
  outcome: string;
  allocations_written: number;
  /** The exception's own candidate count. Execute allocates only a single-candidate match. */
  candidates: number;
  permitted: boolean;
}

async function freshDb(): Promise<VerilaneDb> {
  const db = new VerilaneDb(`verilane-policy-conflict-${Math.random()}`);
  await ensureSeeded(db, seedFetcher());
  return db;
}

const REASON: Record<PolicyVerdict, string> = {
  auto_permitted: "forced auto_permitted",
  needs_analyst: "forced needs_analyst",
  needs_manager: "forced needs_manager",
  blocked: "forced blocked",
};

async function runCase(c: Case): Promise<CaseResult> {
  const db = await freshDb();
  try {
    const x = (await db.exceptions.get(c.exception_id)) as Exception;
    const paymentId = typeof x.payment_id === "string" ? x.payment_id : undefined;
    const pay = paymentId ? await db.payments.get(paymentId) : undefined;
    const amount = pay ? Number(pay.amount_paise) : 1;
    const confidence = "high" as const;
    let fingerprint = policyInputFingerprint({ exception: x, amountPaise: amount, confidence }, POLICY_CONFIG_VERSION);

    if (c.verdict !== "none" && x.kind === "unallocated_payment") {
      const verdict = c.verdict;
      const r = await evaluatePolicyForException(db, x, amount, confidence, {
        decide: () => ok({ gate_id: "G-EVAL", verdict, reason: REASON[verdict], conflict: false }),
      });
      if (!r.ok) throw new Error(r.error.reason);
    }

    if (c.trap === "stale") {
      // Inputs change after the decision (an import adds a candidate); the
      // caller sees the new inputs, the latest row still has the old ones.
      const changed = { ...x, candidate_invoice_ids: [...((x.candidate_invoice_ids as string[]) ?? []), "INV-A"] };
      await db.exceptions.put(changed);
      fingerprint = policyInputFingerprint(
        { exception: changed, amountPaise: amount, confidence: "low" },
        POLICY_CONFIG_VERSION,
      );
    }
    if (c.trap === "reversed") {
      const base = {
        at: new Date().toISOString(),
        actor_role: "manager",
        actor_label: "Manager",
        subject: `review:${c.exception_id}`,
        subject_kind: "review",
        subject_id: c.exception_id,
        evidence_ids: [],
      };
      const allocated = await db.audit.add({
        ...base,
        action: "allocate_payment",
        summary: "Allocated (fixture)",
        after: { status: "actioned" },
      } as unknown as AuditEventRow);
      await db.audit.add({
        ...base,
        action: "reverse_allocation",
        summary: "Reversed (fixture)",
        after: { status: "open", reverses_event_id: allocated },
      } as unknown as AuditEventRow);
    }

    const before = await db.audit.where("action").equals("allocate_payment").count();
    let outcome: string;
    try {
      const out = await executeAgent(db, {
        subject: { kind: "review", id: c.exception_id },
        expected_fingerprint: fingerprint,
        observed: { verdict: "auto_permitted" }, // in-memory; must be ignored (R6)
      });
      outcome = out.kind;
    } catch (e) {
      outcome = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    const written = (await db.audit.where("action").equals("allocate_payment").count()) - before;
    const candidates = ((x.candidate_invoice_ids as string[] | undefined) ?? []).length;
    // A fresh auto_permitted is expected to execute only for a single-candidate
    // match; a tie (FS14) or a no-candidate line (FS15, FS17) must be refused.
    const permitted =
      c.verdict === "auto_permitted" && c.trap === "none" && x.kind === "unallocated_payment" && candidates === 1;
    return { ...c, outcome, allocations_written: written, candidates, permitted };
  } finally {
    db.close();
    await db.delete();
  }
}

let results: CaseResult[] = [];

beforeAll(async () => {
  const seed = await freshDb();
  const exceptions = await seed.exceptions.toArray();
  seed.close();
  await seed.delete();

  const cases: Case[] = [];
  for (const x of exceptions) {
    for (const verdict of [...POLICY_VERDICTS, "none"] as const) {
      cases.push({ exception_id: x.review_id, kind: x.kind, verdict, trap: "none" });
    }
    if (x.kind === "unallocated_payment") {
      cases.push({ exception_id: x.review_id, kind: x.kind, verdict: "auto_permitted", trap: "stale" });
      cases.push({ exception_id: x.review_id, kind: x.kind, verdict: "auto_permitted", trap: "reversed" });
    }
  }
  for (const c of cases) results.push(await runCase(c));
});

afterAll(() => {
  results = [];
});

test("policy-conflict-executed = 0 (TC-75.25)", () => {
  const conflicts = results.filter((r) => !r.permitted && r.allocations_written > 0);
  expect(conflicts, JSON.stringify(conflicts, null, 2)).toEqual([]);
});

test("control: every fresh auto_permitted payment exception executes exactly once", () => {
  const permitted = results.filter((r) => r.permitted);
  expect(permitted.length).toBeGreaterThan(0);
  for (const r of permitted) {
    expect(r.outcome, r.exception_id).toBe("executed");
    expect(r.allocations_written, r.exception_id).toBe(1);
  }
});

test("control: a forced auto_permitted on a multi- or zero-candidate payment exception is refused and writes nothing", () => {
  const forced = results.filter(
    (r) => r.verdict === "auto_permitted" && r.trap === "none" && r.kind === "unallocated_payment" && r.candidates !== 1,
  );
  // The seed's FS14 (two candidates) and FS15/FS17 (none) must be in this set.
  expect(forced.some((r) => r.candidates > 1)).toBe(true);
  expect(forced.some((r) => r.candidates === 0)).toBe(true);
  for (const r of forced) {
    expect(r.outcome, r.exception_id).toBe("refused");
    expect(r.allocations_written, r.exception_id).toBe(0);
  }
});

test("coverage: every seeded exception × every verdict, plus the stale and reversed traps", () => {
  const traps = new Set(results.map((r) => r.trap));
  expect([...traps].sort()).toEqual(["none", "reversed", "stale"]);
  const verdicts = new Set(results.map((r) => r.verdict));
  for (const v of POLICY_VERDICTS) expect(verdicts.has(v)).toBe(true);
});
