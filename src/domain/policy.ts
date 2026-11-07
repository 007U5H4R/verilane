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
 * `.add()`s — `policyDecisions` is append-only (R7), enforced in `db.ts`.
 */
import { MANAGER_APPROVAL_THRESHOLD } from "./permissions";
import { type Rejected, err, ok, type Result } from "./result";
import { isPaymentExceptionKind, type Exception, type PaymentExceptionKind } from "./schema";
import type { RecommendConfidence, RecommendedFacts } from "./recommend";
import type { VerilaneDb } from "@/store/db";
import type { PolicyDecisionRow } from "@/store/db";

export const POLICY_VERDICTS = ["auto_permitted", "needs_analyst", "needs_manager", "blocked"] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

/** Bumped only when the gate table itself changes (R7). */
export const POLICY_CONFIG_VERSION = "policy-v1";

/**
 * The config versions this build can actually run. A row's `config_version`
 * must name the rules that produced it, so an unknown version is rejected
 * rather than silently evaluated under v1 rules (EXE131).
 */
export const KNOWN_POLICY_CONFIG_VERSIONS: readonly string[] = [POLICY_CONFIG_VERSION];

function isKnownConfigVersion(v: string): boolean {
  return KNOWN_POLICY_CONFIG_VERSIONS.includes(v);
}

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
 *   G0: malformed amount or unknown config_version -> rejected, never persisted
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
  if (!isKnownConfigVersion(configVersion)) {
    return err(`Policy agent has no rules for config_version "${configVersion}"; rejected, not persisted.`);
  }
  if (!Number.isInteger(ctx.amountPaise) || ctx.amountPaise <= 0) {
    return err(`Policy agent received a malformed amount (${ctx.amountPaise}paise); rejected, not persisted.`);
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

/**
 * The last check before a gate decision is persisted (AC2/M3): whatever
 * produced it, an out-of-enum verdict, a blank gate_id or an unknown
 * config_version never reaches `policyDecisions`.
 */
export function validatePolicyGate(
  gate: PolicyGateDecision,
  configVersion: string,
): Result<PolicyGateDecision, Rejected> {
  if (!(POLICY_VERDICTS as readonly string[]).includes(gate.verdict)) {
    return err(`Policy agent produced an out-of-enum verdict ("${String(gate.verdict)}"); rejected, not persisted.`);
  }
  if (typeof gate.gate_id !== "string" || gate.gate_id.trim() === "") {
    return err("Policy agent produced a decision with no gate_id; rejected, not persisted.");
  }
  if (!isKnownConfigVersion(configVersion)) {
    return err(`Policy agent has no rules for config_version "${configVersion}"; rejected, not persisted.`);
  }
  return ok(gate);
}

export interface PolicyFingerprintInput {
  exception: Pick<Exception, "kind" | "candidate_invoice_ids">;
  amountPaise: number;
  confidence: RecommendConfidence | undefined;
}

/**
 * Everything a verdict depends on, as a stable string (M2). Stored on each
 * row; when the current inputs no longer match the latest row's fingerprint
 * (e.g. a CSV import added a second candidate invoice), the verdict is stale
 * and a new row is appended. Candidate order is irrelevant.
 */
export function policyInputFingerprint(input: PolicyFingerprintInput, configVersion: string): string {
  return JSON.stringify({
    config_version: configVersion,
    kind: input.exception.kind,
    amount_paise: input.amountPaise,
    candidate_invoice_ids: [...(input.exception.candidate_invoice_ids ?? [])].sort(),
    confidence: input.confidence ?? null,
  });
}

export interface EvaluatePolicyDeps {
  now?: () => string;
  configVersion?: string;
  /** Recommend's output, cited as evidence on the Recommend audit event. */
  recommendation?: RecommendedFacts;
  /** Test seam: replaces the gate table. Its output is still validated (M3). */
  decide?: (ctx: PolicyContext, configVersion: string) => Result<PolicyGateDecision, Rejected>;
}

function decisionSeq(decisionId: string): number {
  const n = Number(decisionId.slice(decisionId.lastIndexOf("-") + 1));
  return Number.isInteger(n) ? n : 0;
}

/** Evaluation order: `evaluated_at`, then the decision sequence on a tie. */
export function byEvaluation(a: PolicyDecisionRow, b: PolicyDecisionRow): number {
  return a.evaluated_at.localeCompare(b.evaluated_at) || decisionSeq(a.decision_id) - decisionSeq(b.decision_id);
}

/**
 * Evaluates and persists a PolicyDecision for `exception`. Append-only: when
 * the inputs differ from the latest row's fingerprint, a new row with a fresh
 * `decision_id` is added; unchanged inputs return the latest row and write
 * nothing. The read, the decision and both audit events (Recommend, then
 * Policy, each by a system agent) commit in one transaction (M5), so two
 * concurrent evaluations can't both append and a failed audit write leaves no
 * orphan decision. Audit rows are tagged `subject: review:{review_id}` so they
 * surface in the `/exceptions/[id]` trail (AC6, Design §10).
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
  const decide = deps.decide ?? decidePolicyVerdict;
  const decided = decide({ kind: exception.kind, amountPaise, confidence }, configVersion);
  if (!decided.ok) return decided;
  const gate = validatePolicyGate(decided.value, configVersion);
  if (!gate.ok) return gate;

  const fingerprint = policyInputFingerprint({ exception, amountPaise, confidence }, configVersion);
  const now = deps.now ?? (() => new Date().toISOString());

  return db.transaction("rw", db.policyDecisions, db.audit, async () => {
    const prior = (await db.policyDecisions.where("exception_id").equals(exception.review_id).toArray()).sort(
      byEvaluation,
    );
    const latest = prior.at(-1);
    if (latest && latest.input_fingerprint === fingerprint) return ok(latest);

    const evaluated_at = now();
    const nextSeq = prior.reduce((max, r) => Math.max(max, decisionSeq(r.decision_id)), 0) + 1;
    const row: PolicyDecisionRow = {
      decision_id: `POL-${exception.review_id}-${nextSeq}`,
      exception_id: exception.review_id,
      evaluated_at,
      config_version: configVersion,
      gate_id: gate.value.gate_id,
      verdict: gate.value.verdict,
      reason: gate.value.reason,
      confidence: confidence ?? null,
      amount_paise: amountPaise,
      model_policy_conflict: gate.value.conflict,
      input_fingerprint: fingerprint,
    };
    await db.policyDecisions.add(row);
    const subject = {
      subject: `review:${exception.review_id}`,
      subject_kind: "review",
      subject_id: exception.review_id,
      at: evaluated_at,
      actor_role: "system",
    };
    await db.audit.add({
      action: "recommend_generated",
      ...subject,
      actor_label: "Recommend Agent",
      summary: "Recommend Agent generated facts",
      evidence_ids: deps.recommendation?.facts.map((f) => f.evidenceId) ?? [],
    });
    await db.audit.add({
      action: "policy_evaluated",
      ...subject,
      actor_label: "Policy Agent",
      summary: gate.value.conflict
        ? `Policy Agent evaluated exception (verdict: ${gate.value.verdict}) — conflicts with Recommend's high-confidence match`
        : `Policy Agent evaluated exception (verdict: ${gate.value.verdict})`,
      evidence_ids: [row.decision_id],
    });
    return ok(row);
  });
}

/** Every PolicyDecision ever recorded for `exceptionId`, oldest first (R7). */
export async function policyDecisionsForException(
  db: VerilaneDb,
  exceptionId: string,
): Promise<PolicyDecisionRow[]> {
  const rows = await db.policyDecisions.where("exception_id").equals(exceptionId).toArray();
  return rows.sort(byEvaluation);
}

/** The most recent PolicyDecision for `exceptionId`, or `undefined` if none yet. */
export async function latestPolicyDecisionForException(
  db: VerilaneDb,
  exceptionId: string,
): Promise<PolicyDecisionRow | undefined> {
  const rows = await policyDecisionsForException(db, exceptionId);
  return rows.at(-1);
}
