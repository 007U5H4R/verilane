/**
 * TC-008/TC-009/TC-010/TC-011 (docs/test-cases.md; TKT-75.03 brief calls
 * these TC-75.17ff — see decisions.md EXE130 for the numbering divergence).
 * Policy agent: pure gated rule table (R6), append-only PolicyDecision (R7).
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { can, type Subject } from "./permissions";
import {
  decidePolicyVerdict,
  evaluatePolicyForException,
  latestPolicyDecisionForException,
  policyDecisionsForException,
  POLICY_CONFIG_VERSION,
  type PolicyContext,
} from "./policy";
import type { Exception } from "./schema";
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

describe("decidePolicyVerdict — each kind", () => {
  it("a kind with no rule yet (short_payment_pattern, reserved for 79.5): needs_analyst", () => {
    const ctx: PolicyContext = { kind: "short_payment_pattern", amountPaise: 1_000, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("needs_analyst");
  });

  it("unallocated_payment is fully gated (contrast with the kind above)", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 1_000, confidence: "high" };
    const result = decidePolicyVerdict(ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("auto_permitted");
  });
});

describe("decidePolicyVerdict — each role (integration with permissions.ts's requires_role gate)", () => {
  function subjectFor(exc: Exception): Subject {
    return { kind: "review", id: exc.review_id, requires_role: exc.requires_role };
  }

  it("needs_manager verdict: an Analyst is denied allocate_payment once requires_role is manager", () => {
    const verdict = decidePolicyVerdict({ kind: "unallocated_payment", amountPaise: THRESHOLD + 1, confidence: "high" });
    expect(verdict.ok && verdict.value.verdict).toBe("needs_manager");
    const subject = subjectFor(exception({ requires_role: "manager" }));
    expect(can("analyst", "allocate_payment", subject).allowed).toBe(false);
    expect(can("manager", "allocate_payment", subject).allowed).toBe(true);
  });

  it("auto_permitted verdict: both roles are allowed once requires_role stays analyst", () => {
    const verdict = decidePolicyVerdict({ kind: "unallocated_payment", amountPaise: 1_000, confidence: "high" });
    expect(verdict.ok && verdict.value.verdict).toBe("auto_permitted");
    const subject = subjectFor(exception({ requires_role: "analyst" }));
    expect(can("analyst", "allocate_payment", subject).allowed).toBe(true);
    expect(can("manager", "allocate_payment", subject).allowed).toBe(true);
  });
});

describe("decidePolicyVerdict — determinism", () => {
  it("two calls with identical input produce byte-identical output", () => {
    const ctx: PolicyContext = { kind: "unallocated_payment", amountPaise: 12_345, confidence: "high" };
    const a = decidePolicyVerdict(ctx);
    const b = decidePolicyVerdict({ ...ctx });
    expect(a).toEqual(b);
  });
});

describe("evaluatePolicyForException — append-only persistence (R7)", () => {
  let db: VerilaneDb | undefined;

  afterEach(async () => {
    if (db) {
      const name = db.name;
      db.close();
      await Dexie.delete(name);
      db = undefined;
    }
  });

  it("persists a PolicyDecision row, queryable by exception_id", async () => {
    const opened = await openDb("policy-test-persist");
    db = opened.db;
    const now = () => "2026-11-05T00:00:00.000Z";
    const result = await evaluatePolicyForException(db, exception(), 1_000, "high", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("auto_permitted");
    expect(result.value.config_version).toBe(POLICY_CONFIG_VERSION);

    const rows = await policyDecisionsForException(db, "RV-PAY-P-012");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.decision_id).toBe("POL-RV-PAY-P-012-1");
  });

  it("re-evaluation appends a new row rather than updating the old one", async () => {
    const opened = await openDb("policy-test-append");
    db = opened.db;
    const now = () => "2026-11-05T00:00:00.000Z";
    await evaluatePolicyForException(db, exception(), 1_000, "high", { now });
    await evaluatePolicyForException(db, exception(), 1_000, "low", { now, configVersion: "policy-v2" });

    const rows = await policyDecisionsForException(db, "RV-PAY-P-012");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.verdict).toBe("auto_permitted");
    expect(rows[1]!.verdict).toBe("needs_manager");
    expect(rows[0]!.decision_id).not.toBe(rows[1]!.decision_id);

    const latest = await latestPolicyDecisionForException(db, "RV-PAY-P-012");
    expect(latest?.decision_id).toBe(rows[1]!.decision_id);
  });

  it("writes a companion audit event, surfacing under subject review:{id}", async () => {
    const opened = await openDb("policy-test-audit");
    db = opened.db;
    await evaluatePolicyForException(db, exception(), 1_000, "high");

    const events = await db.audit.where("subject").equals("review:RV-PAY-P-012").toArray();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("policy_evaluated");
  });

  it("a malformed context is rejected and never persisted", async () => {
    const opened = await openDb("policy-test-malformed");
    db = opened.db;
    const result = await evaluatePolicyForException(db, exception(), -1, "high");
    expect(result.ok).toBe(false);

    const rows = await policyDecisionsForException(db, "RV-PAY-P-012");
    expect(rows).toHaveLength(0);
  });
});
