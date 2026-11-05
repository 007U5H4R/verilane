/**
 * Policy agent (TKT-75.03, F15/R6-R7/S40-S41). A pure, deterministic gated
 * rule table over `(Exception, Recommend's confidence, config_version)`.
 * Decides what is *allowed*, never what a given actor's role lets them
 * click — that remains `permissions.ts`'s job (EXE130: the verdict is
 * actor-independent, since an append-only, versioned decision shouldn't
 * change meaning depending on who is currently logged in).
 *
 * `decidePolicyVerdict` has no I/O: same input -> same output, always.
 * `evaluatePolicyForException` is the only persistence path, and only ever
 * `.add()`s — never `.put()`/updates/deletes `policyDecisions` (R7).
 */
import { MANAGER_APPROVAL_THRESHOLD } from "./permissions";
import { type Rejected, err, ok, type Result } from "./result";
import { isPaymentExceptionKind, type Exception, type PaymentExceptionKind } from "./schema";
import type { RecommendConfidence } from "./recommend";
import type { VerilaneDb } from "@/store/db";
import type { PolicyDecisionRow } from "@/store/db";

export const POLICY_VERDICTS = ["auto_permitted", "needs_analyst", "needs_manager", "blocked"] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

/** Bumped only when the gate table itself changes (R7). */
export const POLICY_CONFIG_VERSION = "policy-v1";

export interface PolicyContext {
  kind: PaymentExceptionKind;
  amountPaise: number;
  /** `undefined` when Recommend produced no recommendation at all (F13). */
  confidence: RecommendConfidence | undefined;
}

export interface PolicyGateDecision {
  gate_id: string;
  verdict: PolicyVerdict;
  reason: string;
  /** FS22: Recommend's own high-confidence read disagreed with this verdict. */
  conflict: boolean;
}

/**
 * The gate table (§7). Order matters — first match wins:
 *   G0: malformed amount -> rejected, never persisted
 *   G1: a kind this table has no rule for yet -> needs_analyst (safe default)
 *   G2: no recommendation to evaluate -> blocked
 *   G3: ambiguous match (low confidence) -> needs_manager
 *   G4: amount exceeds the manager-approval threshold -> needs_manager
 *       (conflict: Recommend was confident, Policy still escalates)
 *   G5: <= threshold and unambiguous -> auto_permitted
 */
export function decidePolicyVerdict(
  ctx: PolicyContext,
  configVersion: string = POLICY_CONFIG_VERSION,
): Result<PolicyGateDecision, Rejected> {
  void configVersion; // reserved: a future config_version may alter gate order/thresholds
  if (!Number.isInteger(ctx.amountPaise) || ctx.amountPaise <= 0) {
    return err(`Policy agent received a malformed amount (${ctx.amountPaise}paise); rejected, not persisted.`);
  }
  if (!POLICY_VERDICTS.includes("auto_permitted")) {
    // Defensive: the enum itself must be intact. Unreachable in practice,
    // but AC2 requires out-of-enum verdicts to be rejected via Result<T,E>.
    return err("Policy agent verdict enum is corrupt; rejected, not persisted.");
  }

  if (ctx.kind !== "unallocated_payment") {
    return ok({
      gate_id: "G1",
      verdict: "needs_analyst",
      reason: `Policy rules for "${ctx.kind}" are not yet defined; routed to Analyst review.`,
      conflict: false,
    });
  }

  if (ctx.confidence === undefined) {
    return ok({
      gate_id: "G2",
      verdict: "blocked",
      reason: "No safe recommendation to evaluate.",
      conflict: false,
    });
  }

  if (ctx.confidence === "low") {
    return ok({
      gate_id: "G3",
      verdict: "needs_manager",
      reason: "Ambiguous match requires Manager review.",
      conflict: false,
    });
  }

  if (ctx.amountPaise > MANAGER_APPROVAL_THRESHOLD) {
    return ok({
      gate_id: "G4",
      verdict: "needs_manager",
      reason: "Amount exceeds ₹5,00,000; Manager approval required.",
      conflict: true,
    });
  }

  return ok({
    gate_id: "G5",
    verdict: "auto_permitted",
    reason: "Amount is ≤ ₹5,00,000 and the match is unambiguous.",
    conflict: false,
  });
}

export interface EvaluatePolicyDeps {
  now?: () => string;
  configVersion?: string;
}

/**
 * Evaluates and persists a PolicyDecision for `exception`. Append-only: a
 * re-evaluation (e.g. after a config bump) calls this again and gets a new
 * row with a fresh `decision_id`; nothing is ever updated or deleted (R7).
 * Also writes a companion audit event, tagged `subject: review:{review_id}`
 * so it surfaces in the existing `/exceptions/[id]` audit trail with no
 * change to `useException()` (EXE130) — this bypasses `commands.ts`'s
 * closed `AuditAction` union on purpose: `recomputeCore()` already writes
 * directly to other tables the same way, and Recommend/Policy are not
 * user-initiated commands.
 */
export async function evaluatePolicyForException(
  db: VerilaneDb,
  exception: Exception,
  amountPaise: number,
  confidence: RecommendConfidence | undefined,
  deps: EvaluatePolicyDeps = {},
): Promise<Result<PolicyDecisionRow, Rejected>> {
  if (!isPaymentExceptionKind(exception.kind)) {
    return err(`Policy agent only evaluates payment exceptions, not "${exception.kind}".`);
  }
  const configVersion = deps.configVersion ?? POLICY_CONFIG_VERSION;
  const gate = decidePolicyVerdict({ kind: exception.kind, amountPaise, confidence }, configVersion);
  if (!gate.ok) return gate;

  const now = deps.now ?? (() => new Date().toISOString());
  const evaluated_at = now();
  const priorCount = await db.policyDecisions.where("exception_id").equals(exception.review_id).count();
  const decision_id = `POL-${exception.review_id}-${priorCount + 1}`;

  const row: PolicyDecisionRow = {
    decision_id,
    exception_id: exception.review_id,
    evaluated_at,
    config_version: configVersion,
    gate_id: gate.value.gate_id,
    verdict: gate.value.verdict,
    reason: gate.value.reason,
    confidence: confidence ?? null,
    amount_paise: amountPaise,
    model_policy_conflict: gate.value.conflict,
  };
  await db.policyDecisions.add(row);
  await db.audit.add({
    action: "policy_evaluated",
    subject: `review:${exception.review_id}`,
    subject_kind: "review",
    subject_id: exception.review_id,
    at: evaluated_at,
    actor_role: "manager",
    actor_label: "Policy Agent",
    summary: gate.value.conflict
      ? `Policy Agent evaluated exception (verdict: ${gate.value.verdict}) — conflicts with Recommend's high-confidence match`
      : `Policy Agent evaluated exception (verdict: ${gate.value.verdict})`,
    evidence_ids: [],
  });
  return ok(row);
}

/** Every PolicyDecision ever recorded for `exceptionId`, oldest first (R7). */
export async function policyDecisionsForException(
  db: VerilaneDb,
  exceptionId: string,
): Promise<PolicyDecisionRow[]> {
  const rows = await db.policyDecisions.where("exception_id").equals(exceptionId).toArray();
  return rows.sort((a, b) => a.evaluated_at.localeCompare(b.evaluated_at));
}

/** The most recent PolicyDecision for `exceptionId`, or `undefined` if none yet. */
export async function latestPolicyDecisionForException(
  db: VerilaneDb,
  exceptionId: string,
): Promise<PolicyDecisionRow | undefined> {
  const rows = await policyDecisionsForException(db, exceptionId);
  return rows.at(-1);
}
