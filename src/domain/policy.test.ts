/**
 * TC-008/TC-009/TC-010/TC-011 (docs/test-cases.md; TKT-75.03 brief calls
 * these TC-75.17ff — see decisions.md EXE130 for the numbering divergence).
 * Policy agent: pure gated rule table (R6), append-only PolicyDecision (R7).
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { actorType } from "./audit/classify";
import {
  decidePolicyVerdict,
  evaluatePolicyForException,
  KNOWN_POLICY_CONFIG_VERSIONS,
  latestPolicyDecisionForException,
  policyDecisionsForException,
  policyInputFingerprint,
  POLICY_CONFIG_VERSION,
  validatePolicyGate,
  type PolicyContext,
  type PolicyGateDecision,
  type PolicyVerdict,
} from "./policy";
import { ok } from "./result";
import {
  ExceptionKindSchema,
  isPaymentExceptionKind,
  PAYMENT_EXCEPTION_KINDS,
  type Exception,
  type PaymentExceptionKind,
} from "./schema";
import { openDb, type VerilaneDb } from "@/store/db";

const THRESHOLD = 50_000_000; // ₹5,00,000 in paise

function exception(overrides: Partial<Exception> = {}): Exception {
  return {
    review_id: "RV-PAY-P-012",
    kind: "unallocated_payment",
    linked_review_ids: [],
    recommendation: "",
    evidence_ids: [],
    validation_status: "verified",
    escalation_reason: "",
    requires_role: "analyst",
    status: "open",
    payment_id: "P-012",
    candidate_invoice_ids: ["INV-001"],
    ...overrides,
  };
}

describe("decidePolicyVerdict — TC-008 auto_permitted boundary", () => {
  it("exactly ₹5,00,000 and unambiguous: auto_permitted", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: THRESHOLD, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("auto_permitted");
    expect(result.value.conflict).toBe(false);
  });

  it("one paisa under the threshold and unambiguous: auto_permitted", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: THRESHOLD - 1, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("auto_permitted");
  });
});

describe("decidePolicyVerdict — TC-009 needs_manager boundary (amount)", () => {
  it("one paisa over the threshold and unambiguous: needs_manager, flagged as a conflict", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: THRESHOLD + 1, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("needs_manager");
    expect(result.value.conflict).toBe(true);
  });
});

describe("decidePolicyVerdict — TC-010 needs_manager (ambiguous match)", () => {
  it("low confidence, well within the threshold: needs_manager, no conflict", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 1_000, confidence: "low" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("needs_manager");
    expect(result.value.conflict).toBe(false);
  });

  it("low confidence AND over the threshold: still needs_manager (not double-escalated)", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: THRESHOLD + 1, confidence: "low" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("needs_manager");
  });
});

describe("decidePolicyVerdict — TC-011 blocked / malformed", () => {
  it("no recommendation to evaluate: blocked", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 1_000, confidence: undefined };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("blocked");
  });

  it("zero amount: rejected via Result<T,E>, never a verdict", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 0, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(false);
  });

  it("negative amount: rejected via Result<T,E>, never a verdict", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: -500, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(false);
  });

  it("non-integer (fractional-paise) amount: rejected via Result<T,E>, never a verdict", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 100.5, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(false);
  });
});

describe("decidePolicyVerdict — each kind (table-driven, m6)", () => {
  const cases: Array<[PaymentExceptionKind, PolicyVerdict, string]> = [
    ["unallocated_payment", "auto_permitted", "G5"],
    ["short_payment_pattern", "needs_analyst", "G1"],
    ["short_payment", "needs_analyst", "G1"],
  ];
  it.each(cases)("%s (₹10, high confidence) -> %s via %s", (kind, verdict, gate) => {
    const result = decidePolicyVerdict({ kind, amountPaise: 1_000, confidence: "high" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe(verdict);
    expect(result.value.gate_id).toBe(gate);
  });

  it("covers every payment exception kind", () => {
    expect(cases.map(([k]) => k).sort()).toEqual([...PAYMENT_EXCEPTION_KINDS].sort());
  });
});

describe("decidePolicyVerdict — config_version (m3)", () => {
  it("rejects an unknown config_version instead of running v1 rules under its name", () => {
    const result = decidePolicyVerdict({ kind: "unallocated_payment", amountPaise: 1_000, confidence: "high" }, "policy-v2");
    expect(result.ok).toBe(false);
  });

  it("accepts every known config_version", () => {
    for (const v of KNOWN_POLICY_CONFIG_VERSIONS) {
      expect(decidePolicyVerdict({ kind: "unallocated_payment", amountPaise: 1_000, confidence: "high" }, v).ok).toBe(true);
    }
  });
});

describe("decidePolicyVerdict — determinism (m7)", () => {
  it("two calls with identical input produce byte-identical output", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 12_345, confidence: "high" };
    const a = decidePolicyVerdict(ctx);
    const b = decidePolicyVerdict({ ...ctx });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("validatePolicyGate — M3 validate before persist", () => {
  const good: PolicyGateDecision = { gate_id: "G5", verdict: "auto_permitted", reason: "ok", conflict: false };

  it("accepts a well-formed gate decision", () => {
    expect(validatePolicyGate(good, POLICY_CONFIG_VERSION).ok).toBe(true);
  });

  it("rejects an out-of-enum verdict", () => {
    const bad = { ...good, verdict: "auto_approved" } as unknown as PolicyGateDecision;
    expect(validatePolicyGate(bad, POLICY_CONFIG_VERSION).ok).toBe(false);
  });

  it("rejects an empty gate_id", () => {
    expect(validatePolicyGate({ ...good, gate_id: "  " }, POLICY_CONFIG_VERSION).ok).toBe(false);
  });

  it("rejects an unknown config_version", () => {
    expect(validatePolicyGate(good, "policy-v9").ok).toBe(false);
  });
});

describe("evaluatePolicyForException — append-only persistence (R7)", () => {
  let db: VerilaneDb | undefined;
  const now = () => "2026-11-05T00:00:00.000Z";

  afterEach(async () => {
    if (db) {
      const name = db.name;
      db.close();
      await Dexie.delete(name);
      db = undefined;
    }
  });

  async function open(name: string): Promise<VerilaneDb> {
    const opened = await openDb(name);
    db = opened.db;
    return db;
  }

  it("persists a PolicyDecision row, queryable by exception_id, with its input fingerprint", async () => {
    const d = await open("policy-test-persist");
    const result = await evaluatePolicyForException(d, exception(), 1_000, "high", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("auto_permitted");
    expect(result.value.config_version).toBe(POLICY_CONFIG_VERSION);
    expect(result.value.input_fingerprint).toBe(
      policyInputFingerprint({ exception: exception(), amountPaise: 1_000, confidence: "high" }, POLICY_CONFIG_VERSION),
    );

    const rows = await policyDecisionsForException(d, "RV-PAY-P-012");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.decision_id).toBe("POL-RV-PAY-P-012-1");
  });

  it("is idempotent for unchanged inputs: a second call returns the latest row and appends nothing", async () => {
    const d = await open("policy-test-idempotent");
    const first = await evaluatePolicyForException(d, exception(), 1_000, "high", { now });
    const second = await evaluatePolicyForException(d, exception(), 1_000, "high", { now });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.decision_id).toBe(first.value.decision_id);
    expect(await d.policyDecisions.count()).toBe(1);
    expect(await d.audit.count()).toBe(2);
  });

  it("concurrent evaluations of the same inputs persist exactly one row (M5)", async () => {
    const d = await open("policy-test-concurrent");
    await Promise.all([
      evaluatePolicyForException(d, exception(), 1_000, "high", { now }),
      evaluatePolicyForException(d, exception(), 1_000, "high", { now }),
    ]);
    expect(await d.policyDecisions.count()).toBe(1);
  });

  it("re-evaluation on changed inputs appends a new row rather than updating the old one", async () => {
    const d = await open("policy-test-append");
    await evaluatePolicyForException(d, exception(), 1_000, "high", { now });
    await evaluatePolicyForException(d, exception(), 1_000, "low", { now });

    const rows = await policyDecisionsForException(d, "RV-PAY-P-012");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.verdict).toBe("auto_permitted");
    expect(rows[1]!.verdict).toBe("needs_manager");
    expect(rows[0]!.decision_id).not.toBe(rows[1]!.decision_id);

    const latest = await latestPolicyDecisionForException(d, "RV-PAY-P-012");
    expect(latest?.decision_id).toBe(rows[1]!.decision_id);
  });

  it("M2: a CSV import that adds a second candidate invalidates a stale auto_permitted verdict", async () => {
    const d = await open("policy-test-csv-import");
    const before = exception({ candidate_invoice_ids: ["INV-001"] });
    const first = await evaluatePolicyForException(d, before, 1_000, "high", { now });
    expect(first.ok && first.value.verdict).toBe("auto_permitted");

    // The import recomputes candidates: two invoices now match, Recommend drops to low.
    const after = exception({ candidate_invoice_ids: ["INV-002", "INV-001"] });
    const fp = policyInputFingerprint({ exception: after, amountPaise: 1_000, confidence: "low" }, POLICY_CONFIG_VERSION);
    expect(fp).not.toBe(first.ok ? first.value.input_fingerprint : "");

    const second = await evaluatePolicyForException(d, after, 1_000, "low", { now });
    expect(second.ok && second.value.verdict).toBe("needs_manager");
    const latest = await latestPolicyDecisionForException(d, "RV-PAY-P-012");
    expect(latest?.verdict).toBe("needs_manager");
    expect(latest?.input_fingerprint).toBe(fp);
    expect(await d.policyDecisions.count()).toBe(2);
  });

  it("the fingerprint ignores candidate order and covers amount, candidates, confidence and config_version", () => {
    const base = { exception: exception({ candidate_invoice_ids: ["INV-001", "INV-002"] }), amountPaise: 1_000, confidence: "high" as const };
    const fp = policyInputFingerprint(base, POLICY_CONFIG_VERSION);
    expect(policyInputFingerprint({ ...base, exception: exception({ candidate_invoice_ids: ["INV-002", "INV-001"] }) }, POLICY_CONFIG_VERSION)).toBe(fp);
    expect(policyInputFingerprint({ ...base, amountPaise: 1_001 }, POLICY_CONFIG_VERSION)).not.toBe(fp);
    expect(policyInputFingerprint({ ...base, confidence: "low" }, POLICY_CONFIG_VERSION)).not.toBe(fp);
    expect(policyInputFingerprint({ ...base, exception: exception({ candidate_invoice_ids: ["INV-001"] }) }, POLICY_CONFIG_VERSION)).not.toBe(fp);
    expect(policyInputFingerprint(base, "policy-v0")).not.toBe(fp);
  });

  it("orders by evaluated_at, then numeric decision suffix (m5: POL-x-10 sorts after POL-x-2)", async () => {
    const d = await open("policy-test-order");
    for (let i = 1; i <= 11; i++) {
      await evaluatePolicyForException(d, exception(), 1_000 + i, "high", { now });
    }
    const rows = await policyDecisionsForException(d, "RV-PAY-P-012");
    expect(rows.map((r) => r.decision_id).at(-1)).toBe("POL-RV-PAY-P-012-11");
    expect(rows.map((r) => r.amount_paise)).toEqual(Array.from({ length: 11 }, (_, i) => 1_001 + i));
    const latest = await latestPolicyDecisionForException(d, "RV-PAY-P-012");
    expect(latest?.decision_id).toBe("POL-RV-PAY-P-012-11");
  });

  it("writes Recommend then Policy audit events under review:{id}, both by a system agent (M1, m1)", async () => {
    const d = await open("policy-test-audit");
    await evaluatePolicyForException(d, exception(), 1_000, "high", { now });

    const events = await d.audit.where("subject").equals("review:RV-PAY-P-012").sortBy("event_id");
    expect(events.map((e) => e.action)).toEqual(["recommend_generated", "policy_evaluated"]);
    expect(events[0]!.summary).toBe("Recommend Agent generated facts");
    expect(events[1]!.summary).toBe("Policy Agent evaluated exception (verdict: auto_permitted)");
    for (const e of events) {
      expect(e.actor_role).toBe("system");
      expect(actorType(e)).toBe("system");
    }
    expect(events.map((e) => e.actor_label)).toEqual(["Recommend Agent", "Policy Agent"]);
  });

  it("M5: the decision and both audit events commit atomically — an audit failure persists nothing", async () => {
    const d = await open("policy-test-atomic");
    d.audit.hook("creating", () => {
      throw new Error("audit write failed");
    });
    await expect(evaluatePolicyForException(d, exception(), 1_000, "high", { now })).rejects.toThrow(/audit write failed/);
    expect(await d.policyDecisions.count()).toBe(0);
  });

  it("TC-75.16 (M3): an out-of-enum verdict injected through the decide seam is rejected, 0 rows persisted", async () => {
    const d = await open("policy-test-inject");
    const decide = () => ok({ gate_id: "G5", verdict: "auto_approved", reason: "x", conflict: false } as unknown as PolicyGateDecision);
    const result = await evaluatePolicyForException(d, exception(), 1_000, "high", { now, decide });
    expect(result.ok).toBe(false);
    expect(await d.policyDecisions.count()).toBe(0);
    expect(await d.audit.count()).toBe(0);
  });

  it("an empty gate_id injected through the decide seam is rejected, 0 rows persisted", async () => {
    const d = await open("policy-test-inject-gate");
    const decide = () => ok({ gate_id: "", verdict: "blocked", reason: "x", conflict: false } as PolicyGateDecision);
    const result = await evaluatePolicyForException(d, exception(), 1_000, "high", { now, decide });
    expect(result.ok).toBe(false);
    expect(await d.policyDecisions.count()).toBe(0);
  });

  it("an unknown configVersion is rejected, 0 rows persisted (m3)", async () => {
    const d = await open("policy-test-unknown-version");
    const result = await evaluatePolicyForException(d, exception(), 1_000, "high", { now, configVersion: "policy-v2" });
    expect(result.ok).toBe(false);
    expect(await d.policyDecisions.count()).toBe(0);
  });

  it("a malformed context is rejected and never persisted", async () => {
    const d = await open("policy-test-malformed");
    const result = await evaluatePolicyForException(d, exception(), -1, "high");
    expect(result.ok).toBe(false);
    expect(await policyDecisionsForException(d, "RV-PAY-P-012")).toHaveLength(0);
  });

  it.each(ExceptionKindSchema.options.filter((k) => !isPaymentExceptionKind(k)))(
    "m6: a non-payment kind (%s) is rejected without persisting",
    async (kind) => {
      const d = await open(`policy-test-kind-${kind}`);
      const result = await evaluatePolicyForException(d, exception({ kind }), 1_000, "high", { now });
      expect(result.ok).toBe(false);
      expect(await d.policyDecisions.count()).toBe(0);
      expect(await d.audit.count()).toBe(0);
    },
  );

  it.each(["analyst", "manager"] as const)(
    "m6: the verdict is actor-independent — requires_role %s yields the same persisted verdict",
    async (role) => {
      const d = await open(`policy-test-role-${role}`);
      const over = await evaluatePolicyForException(d, exception({ requires_role: role }), THRESHOLD + 1, "high", { now });
      expect(over.ok && over.value.verdict).toBe("needs_manager");
      const d2 = await openDb(`policy-test-role-${role}-2`);
      try {
        const under = await evaluatePolicyForException(d2.db, exception({ requires_role: role }), 1_000, "high", { now });
        expect(under.ok && under.value.verdict).toBe("auto_permitted");
      } finally {
        d2.db.close();
        await Dexie.delete(d2.db.name);
      }
    },
  );
});
