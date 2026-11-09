/**
 * TKT-75.04 (TASK-79.4) Execute agent on the real seed (fake-indexeddb):
 * TC-75.21 reads the persisted verdict only — an in-memory value is ignored.
 * TC-75.22 auto_permitted → allocate_payment via commands.ts, actor = Execute
 *          agent, audit cites the PolicyDecision id + config_version.
 * TC-75.23 needs_analyst / needs_manager / blocked → no write, handed off.
 * TC-75.24 (unit half) the policy-gated human submit + FS21 audited refusal.
 * Risk (a) a stale latest decision is never acted on.
 * Risk (b) a reversed allocation is never silently re-applied (EXE181).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describe as describeEvent } from "@/domain/audit/classify";
import { EXECUTE_LABEL } from "@/domain/commands";
import { PermissionDenied } from "@/domain/commandConstants";
import { ok } from "@/domain/result";
import {
  evaluatePolicyForException,
  POLICY_CONFIG_VERSION,
  policyDecisionsForException,
  policyInputFingerprint,
  type PolicyGateDecision,
} from "@/domain/policy";
import type { RecommendConfidence, RecommendedFacts } from "@/domain/recommend";
import type { Exception, Payment } from "@/domain/schema";
import { type AuditEventRow, VerilaneDb } from "./db";
import { execute, executeAgent, submitAllocationGated } from "./tx";
import { runExecuteAgentFor } from "./executeAgent";
import type { ExceptionDetail } from "./hooks";
import { ensureSeeded, type Fetcher } from "./loader";

const EXC = "RV-PAY-P-012";
const subject = { kind: "review" as const, id: EXC };

function seedFetcher(): Fetcher {
  const dir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = Object.fromEntries(names.map((n) => [`/seed/${n}`, readFileSync(join(dir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-execute-${Math.random()}`);
  await ensureSeeded(db, seedFetcher());
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function exception(): Promise<Exception> {
  return (await db.exceptions.get(EXC)) as Exception;
}
async function payment(): Promise<Payment> {
  return (await db.payments.get("P-012"))!;
}
async function allocations(): Promise<AuditEventRow[]> {
  return db.audit.where("action").equals("allocate_payment").toArray();
}

/** Persists a decision for P-012 as the Policy agent would, and returns the
 * fingerprint the caller (the detail page) would compute for these inputs. */
async function decide(confidence: RecommendConfidence | undefined, gate?: PolicyGateDecision) {
  const x = await exception();
  const amount = (await payment()).amount_paise;
  const r = await evaluatePolicyForException(db, x, amount, confidence, gate ? { decide: () => ok(gate) } : {});
  if (!r.ok) throw new Error(r.error.reason);
  const fingerprint = policyInputFingerprint({ exception: x, amountPaise: amount, confidence }, POLICY_CONFIG_VERSION);
  return { decision: r.value, fingerprint };
}

async function detail(confidence: RecommendConfidence | undefined): Promise<ExceptionDetail> {
  const recommendation =
    confidence === undefined ? undefined : ok({ confidence, exception_id: EXC, facts: [] } as unknown as RecommendedFacts);
  return {
    exception: await exception(),
    payment: await payment(),
    candidates: [],
    audit: [],
    unappliedCashPaise: (await payment()).amount_paise,
    unappliedCount: 1,
    recommendation,
    shortPaymentInstances: [],
    creditNotes: [],
  };
}

describe("TC-75.21 Execute reads the persisted verdict only", () => {
  it("a persisted needs_manager wins over an in-memory auto_permitted: no write", async () => {
    const { fingerprint } = await decide("low"); // G3 needs_manager
    const auditBefore = await db.audit.count();
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint, observed: { verdict: "auto_permitted" } });
    expect(out.kind).toBe("handed_off");
    expect((await payment()).invoice_id).toBeNull();
    expect((await exception()).status).toBe("open");
    expect(await allocations()).toHaveLength(0);
    expect(await db.audit.count()).toBe(auditBefore);
  });

  it("a persisted auto_permitted wins over an in-memory blocked: executes", async () => {
    const { fingerprint } = await decide("high"); // G5 auto_permitted
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint, observed: { verdict: "blocked" } });
    expect(out.kind).toBe("executed");
  });

  it("no persisted decision: refuses, never infers a verdict", async () => {
    const x = await exception();
    const fingerprint = policyInputFingerprint(
      { exception: x, amountPaise: (await payment()).amount_paise, confidence: "high" },
      POLICY_CONFIG_VERSION,
    );
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint, observed: { verdict: "auto_permitted" } });
    expect(out.kind).toBe("refused");
    expect(await allocations()).toHaveLength(0);
  });
});

describe("TC-75.22 auto_permitted executes through commands.ts as the Execute agent", () => {
  it("allocates P-012 to INV-F with one audit event citing the PolicyDecision", async () => {
    const { decision, fingerprint } = await decide("high");
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(out.kind).toBe("executed");
    expect((await payment()).invoice_id).toBe("INV-F");
    expect((await exception()).status).toBe("actioned");
    const events = await allocations();
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.actor_label).toBe(EXECUTE_LABEL);
    expect(e.subject).toBe(`review:${EXC}`);
    expect(e.evidence_ids).toContain(decision.decision_id);
    expect(e.after).toMatchObject({
      invoice_id: "INV-F",
      policy_decision_id: decision.decision_id,
      config_version: POLICY_CONFIG_VERSION,
    });
    expect(e.summary).toContain(decision.decision_id);
    // The trail shows it as the agent's (system) action, not a person's click.
    expect(describeEvent(e)).toMatchObject({ actor: "system", label: "Execute Agent allocated payment" });
  });

  it("running twice writes once (the second sees a closed item)", async () => {
    const { fingerprint } = await decide("high");
    await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    const again = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(again.kind).toBe("not_applicable");
    expect(await allocations()).toHaveLength(1);
  });
});

describe("TC-75.23 a non-permitted verdict writes nothing and hands off", () => {
  const cases: Array<[string, RecommendConfidence | undefined, PolicyGateDecision | undefined, string]> = [
    ["needs_analyst", "high", { gate_id: "GX", verdict: "needs_analyst", reason: "Analyst review needed.", conflict: false }, "analyst"],
    ["needs_manager", "low", undefined, "manager"],
    ["blocked", undefined, undefined, "blocked"],
  ];
  for (const [verdict, confidence, gate, queue] of cases) {
    it(`${verdict} → ${queue} queue with the policy reason, no write`, async () => {
      const { decision, fingerprint } = await decide(confidence, gate);
      expect(decision.verdict).toBe(verdict);
      const before = { audit: await db.audit.count(), payments: await db.payments.toArray() };
      const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
      expect(out).toMatchObject({ kind: "handed_off", verdict, queue, reason: decision.reason });
      expect(await db.audit.count()).toBe(before.audit);
      expect(await db.payments.toArray()).toEqual(before.payments);
      expect((await exception()).status).toBe("open");
    });
  }
});

describe("TC-75.30 (TKT-75.05) Execute never auto-writes a credit note for a short-payment kind", () => {
  // G1 (TKT-75.03) already gives any non-unallocated_payment kind needs_analyst,
  // so this is never auto_permitted; here it's not even a policy question —
  // currentDecision's own kind check (TKT-75.04) makes it not_applicable before
  // any verdict is consulted, for a standalone instance or a whole pattern.
  const cases: Array<[string, string]> = [
    ["a standalone short_payment instance", "RV-SP-INV-004"],
    ["a short_payment_pattern", "RV-SPP-C-001"],
  ];
  for (const [label, id] of cases) {
    it(`${label}: not_applicable, no credit note, no audit, no allocation`, async () => {
      const before = { audit: await db.audit.count(), creditNotes: await db.creditNotes.toArray() };
      const out = await executeAgent(db, { subject: { kind: "review", id }, expected_fingerprint: "irrelevant" });
      expect(out).toMatchObject({ kind: "not_applicable", reason: "Only an unallocated payment can be allocated." });
      expect(await db.audit.count()).toBe(before.audit);
      expect(await db.creditNotes.toArray()).toEqual(before.creditNotes);
      expect((await db.exceptions.get(id))?.status).toBe("open");
    });
  }
});

describe("risk (a): a stale latest decision is never acted on", () => {
  it("inputs mutated after an auto_permitted decision: the old verdict is refused", async () => {
    const { fingerprint } = await decide("high");
    const p = await payment();
    await db.payments.put({ ...p, amount_paise: 60_000_000 as Payment["amount_paise"] }); // > ₹5,00,000
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(out.kind).toBe("refused");
    expect(await allocations()).toHaveLength(0);
  });

  it("the caller's inputs changed (confidence): refused on fingerprint mismatch", async () => {
    await decide("high");
    const x = await exception();
    const lowFp = policyInputFingerprint(
      { exception: x, amountPaise: (await payment()).amount_paise, confidence: "low" },
      POLICY_CONFIG_VERSION,
    );
    const out = await executeAgent(db, { subject, expected_fingerprint: lowFp });
    expect(out.kind).toBe("refused");
    expect(await allocations()).toHaveLength(0);
  });

  it("runExecuteAgentFor re-evaluates first and acts on the fresh row", async () => {
    await decide("high"); // auto_permitted at ₹25,000
    const p = await payment();
    await db.payments.put({ ...p, amount_paise: 60_000_000 as Payment["amount_paise"] });
    const r = await runExecuteAgentFor(db, await detail("high"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ kind: "handed_off", verdict: "needs_manager", queue: "manager" });
    expect(await policyDecisionsForException(db, EXC)).toHaveLength(2);
    expect(await allocations()).toHaveLength(0);
  });
});

describe("risk (b): a reversed allocation is not re-applied", () => {
  async function addAllocationAndReversal(pointAtAllocation: boolean) {
    const base = {
      at: new Date().toISOString(),
      actor_role: "manager",
      actor_label: "Manager",
      subject: `review:${EXC}`,
      subject_kind: "review",
      subject_id: EXC,
      evidence_ids: [],
    };
    const allocationId = await db.audit.add({
      ...base,
      action: "allocate_payment",
      summary: "Allocated payment P-012 to INV-F",
      after: { status: "actioned", invoice_id: "INV-F" },
    } as unknown as AuditEventRow);
    await db.audit.add({
      ...base,
      action: "reverse_allocation",
      summary: "Reversed allocation",
      after: { status: "open", invoice_id: null, reverses_event_id: pointAtAllocation ? allocationId : 999_999 },
    } as unknown as AuditEventRow);
  }

  it("an allocation event + an event whose reverses_event_id points at it: refused", async () => {
    const { fingerprint } = await decide("high");
    await addAllocationAndReversal(true);
    const before = await allocations();
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(out.kind).toBe("refused");
    expect((await payment()).invoice_id).toBeNull();
    expect(await allocations()).toHaveLength(before.length);
  });

  it("pairs by reverses_event_id: a reversal pointing elsewhere does not block", async () => {
    const { fingerprint } = await decide("high");
    await addAllocationAndReversal(false);
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(out.kind).toBe("executed");
  });

  it("a sticky reversed flag alone is not the pairing signal", async () => {
    const { fingerprint } = await decide("high");
    await db.exceptions.put({ ...(await exception()), reversed: true } as unknown as Exception);
    const out = await executeAgent(db, { subject, expected_fingerprint: fingerprint });
    expect(out.kind).toBe("executed");
  });
});

describe("risk (b) end to end with 79.6's real reversal (no fixtures)", () => {
  it("Execute allocates, a Manager reverses via reverse_allocation, Execute then refuses and writes nothing", async () => {
    // 1. Execute auto-allocates the seeded auto_permitted P-012.
    const first = await runExecuteAgentFor(db, await detail("high"));
    expect(first.ok && first.value?.kind).toBe("executed");
    expect(await allocations()).toHaveLength(1);

    // 2. A Manager reverses it through the 79.6 command (the control's write path).
    await db.meta.put({ key: "role", value: "manager" });
    await execute(db, { type: "reverse_allocation", subject });
    expect((await exception()).status).toBe("open");
    expect((await payment()).invoice_id).toBeNull();

    // 3. The reopened item is still auto_permitted; Execute must refuse, not re-apply.
    const again = await runExecuteAgentFor(db, await detail("high"));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value).toMatchObject({ kind: "refused" });
    expect(await allocations()).toHaveLength(1);
    expect((await payment()).invoice_id).toBeNull();
    expect((await exception()).status).toBe("open");
  });
});

describe("TC-75.24 (unit) the human submit is gated by the persisted verdict", () => {
  const submit = (expected_fingerprint: string) =>
    submitAllocationGated(db, { type: "allocate_payment", subject, payload: { invoice_id: "INV-F" } }, expected_fingerprint);

  it("needs_manager + Analyst: refused 'Manager approval required', audited (FS21), no write", async () => {
    const { decision, fingerprint } = await decide("low");
    await expect(submit(fingerprint)).rejects.toThrow(PermissionDenied);
    await expect(submit(fingerprint)).rejects.toThrow("Manager approval required");
    expect((await payment()).invoice_id).toBeNull();
    const refusals = await db.audit.where("action").equals("permission_denied").toArray();
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toMatchObject({
      actor_role: "analyst",
      subject: `review:${EXC}`,
      // One FS21 format with 79.6's reverse_allocation refusal (recordRefusal).
      summary: `Refused allocate payment on ${EXC}: Manager approval required`,
      invoice_id: "INV-F",
      after: {
        refused_action: "allocate_payment",
        reason: "Manager approval required",
        policy_decision_id: decision.decision_id,
      },
    });
    expect(refusals[0]!.evidence_ids).toEqual([decision.decision_id]);
  });

  it("needs_manager + Manager: allocates", async () => {
    const { fingerprint } = await decide("low");
    await db.meta.put({ key: "role", value: "manager" });
    const e = await submit(fingerprint);
    expect(e.actor_role).toBe("manager");
    expect((await payment()).invoice_id).toBe("INV-F");
  });

  it("needs_analyst + Analyst: allocates", async () => {
    const { fingerprint } = await decide("high", {
      gate_id: "GX",
      verdict: "needs_analyst",
      reason: "Analyst review needed.",
      conflict: false,
    });
    await submit(fingerprint);
    expect((await payment()).invoice_id).toBe("INV-F");
  });

  it("blocked: refused with the policy reason for every role, audited", async () => {
    const { decision, fingerprint } = await decide(undefined);
    await db.meta.put({ key: "role", value: "manager" });
    await expect(submit(fingerprint)).rejects.toThrow(decision.reason);
    expect((await payment()).invoice_id).toBeNull();
    const refusals = await db.audit.where("action").equals("permission_denied").toArray();
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({
      actor_role: "manager",
      summary: `Refused allocate payment on ${EXC}: ${decision.reason}`,
      invoice_id: "INV-F",
      after: { refused_action: "allocate_payment", policy_decision_id: decision.decision_id },
    });
    expect(refusals[0]!.evidence_ids).toEqual([decision.decision_id]);
  });

  it("a stale decision: refused, nothing written", async () => {
    const { fingerprint } = await decide("high");
    const p = await payment();
    await db.payments.put({ ...p, amount_paise: 60_000_000 as Payment["amount_paise"] });
    await expect(submit(fingerprint)).rejects.toThrow();
    expect((await payment()).invoice_id).toBeNull();
  });
});
