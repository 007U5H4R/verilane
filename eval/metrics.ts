/**
 * Eval metrics (TASK-21.1, AI-Evaluation.md §3).
 *
 * `computeMetrics` scores one set's pipeline output against its hand-written
 * labels. It never reads the labels to produce output, only to score it.
 * Six metrics are gated; the rest are reported for context.
 */
import { DISPUTE_TYPES, EMAIL_CLASSES, type ThreadLabel } from "./schema";

/** What the pipeline produced for one thread (one message per thread). */
export interface ThreadResult {
  thread_id: string;
  extraction_status: "valid" | "rejected";
  email_class: string;
  dispute_type: string | null;
  amounts: number[];
  invoice_refs: string[];
  commitment_date: string | null;
  match_outcome: string;
  customer_id: string | null;
  invoice_id: string | null;
}

/** One `approve_draft` attempt run through the real command code. */
export interface ApprovalAttempt {
  id: string;
  invoice_id: string;
  role: "analyst" | "manager";
  /** Why the oracle says this approval must not go through; empty = it may. */
  block_reasons: string[];
  /** The draft did not reach `sent_simulated`. */
  blocked: boolean;
  /** Final status, or the error that stopped the approval. */
  outcome: string;
}

/** A draft whose final text the checks passed (or that was sent). */
export interface DraftOutcome {
  id: string;
  /** No check failed, so the system would let it through. */
  approvable: boolean;
  /** Factual tokens in the final body outside every footnote span. */
  unverified_tokens: string[];
  /** The label says check 9 must fail (an unfootnoted fact was added). */
  label_expects_unsupported: boolean;
}

export interface SetResults {
  threads: ThreadResult[];
  drafts: DraftOutcome[];
  attempts: ApprovalAttempt[];
}

export interface Ratio {
  numerator: number;
  denominator: number;
  /** numerator / denominator, 1 when the denominator is 0. */
  value: number;
  /** Ids of the items that counted against the metric. */
  failures: string[];
}

export interface ClassScore {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface Metrics {
  threads: number;
  amount_exact_match: Ratio;
  invoice_ref_exact_match: Ratio;
  /** A count, not a ratio: approvable drafts carrying an unsupported fact. */
  unsupported_financial_claims: { count: number; drafts: number; failures: string[] };
  unambiguous_matching: Ratio;
  dispute_recall: Ratio;
  approval_enforcement: Ratio;
  /** Reported only. */
  ambiguous_escalation: Ratio;
  false_blocks: Ratio;
  field_exact_match: Record<"email_class" | "dispute_type" | "commitment_date" | "customer_id", Ratio>;
  per_class: Record<string, ClassScore>;
  per_dispute_type: Record<string, ClassScore>;
}

function ratio(numerator: number, denominator: number, failures: string[]): Ratio {
  return { numerator, denominator, value: denominator === 0 ? 1 : numerator / denominator, failures };
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function score(tp: number, fp: number, tn: number, fn: number): ClassScore {
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = safeDiv(2 * precision * recall, precision + recall);
  return { tp, fp, tn, fn, precision, recall, f1 };
}

function confusion(
  pairs: { truth: string | null; got: string | null }[],
  classes: readonly string[],
): Record<string, ClassScore> {
  const out: Record<string, ClassScore> = {};
  for (const c of classes) {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    for (const p of pairs) {
      const t = p.truth === c;
      const g = p.got === c;
      if (t && g) tp++;
      else if (!t && g) fp++;
      else if (t && !g) fn++;
      else tn++;
    }
    out[c] = score(tp, fp, tn, fn);
  }
  return out;
}

/** A labelled field scored over every thread. */
function fieldMatch(
  pairs: { id: string; ok: boolean }[],
): Ratio {
  const failures = pairs.filter((p) => !p.ok).map((p) => p.id);
  return ratio(pairs.length - failures.length, pairs.length, failures);
}

const DISPUTE_CLASSES = new Set(["dispute", "duplicate"]);

export function computeMetrics(results: SetResults, labels: ThreadLabel[]): Metrics {
  const byThread = new Map(results.threads.map((r) => [r.thread_id, r]));
  const scored = labels.map((label) => {
    const got = byThread.get(label.thread_id);
    if (!got) throw new Error(`no pipeline result for labelled thread ${label.thread_id}`);
    return { label, got };
  });

  // Gate 1 / 2: set equality over threads that state an amount / cite a ref.
  const withAmounts = scored.filter((s) => s.label.amounts.length > 0);
  const amountMisses = withAmounts.filter((s) => !sameSet(s.got.amounts, s.label.amounts)).map((s) => s.label.thread_id);
  const withRefs = scored.filter((s) => s.label.invoice_refs.length > 0);
  const refMisses = withRefs.filter((s) => !sameSet(s.got.invoice_refs, s.label.invoice_refs)).map((s) => s.label.thread_id);

  // Gate 3: an approvable draft must carry no fact outside a footnote.
  const unsupported = results.drafts
    .filter((d) => d.approvable && (d.unverified_tokens.length > 0 || d.label_expects_unsupported))
    .map((d) => d.id);

  // Gate 4: every unambiguous thread gets the labelled outcome (and invoice).
  const unambiguous = scored.filter((s) => !s.label.ambiguous);
  const matchMisses = unambiguous
    .filter(
      (s) =>
        s.got.match_outcome !== s.label.match_outcome ||
        (s.label.match_outcome === "matched" && s.got.invoice_id !== s.label.invoice_id),
    )
    .map((s) => s.label.thread_id);

  // Gate 5: a dispute or duplicate thread must be raised as one.
  const disputes = scored.filter((s) => DISPUTE_CLASSES.has(s.label.email_class));
  const recallMisses = disputes.filter((s) => !DISPUTE_CLASSES.has(s.got.email_class)).map((s) => s.label.thread_id);

  // Gate 6: every approval that should be blocked is blocked.
  const mustBlock = results.attempts.filter((a) => a.block_reasons.length > 0);
  const leaks = mustBlock.filter((a) => !a.blocked).map((a) => a.id);

  // Reported: an ambiguous thread escalates instead of auto-matching.
  const ambiguous = scored.filter((s) => s.label.ambiguous);
  const autoMatched = ambiguous.filter((s) => s.got.match_outcome === "matched").map((s) => s.label.thread_id);

  const mayPass = results.attempts.filter((a) => a.block_reasons.length === 0);
  const falseBlocks = mayPass.filter((a) => a.blocked).map((a) => a.id);

  return {
    threads: scored.length,
    amount_exact_match: ratio(withAmounts.length - amountMisses.length, withAmounts.length, amountMisses),
    invoice_ref_exact_match: ratio(withRefs.length - refMisses.length, withRefs.length, refMisses),
    unsupported_financial_claims: { count: unsupported.length, drafts: results.drafts.length, failures: unsupported },
    unambiguous_matching: ratio(unambiguous.length - matchMisses.length, unambiguous.length, matchMisses),
    dispute_recall: ratio(disputes.length - recallMisses.length, disputes.length, recallMisses),
    approval_enforcement: ratio(mustBlock.length - leaks.length, mustBlock.length, leaks),
    ambiguous_escalation: ratio(ambiguous.length - autoMatched.length, ambiguous.length, autoMatched),
    false_blocks: ratio(falseBlocks.length, mayPass.length, falseBlocks),
    field_exact_match: {
      email_class: fieldMatch(scored.map((s) => ({ id: s.label.thread_id, ok: s.got.email_class === s.label.email_class }))),
      dispute_type: fieldMatch(
        scored.map((s) => ({ id: s.label.thread_id, ok: s.got.dispute_type === (s.label.dispute_type ?? null) })),
      ),
      commitment_date: fieldMatch(
        scored.map((s) => ({
          id: s.label.thread_id,
          ok: s.got.commitment_date === (s.label.commitment_date ?? null),
        })),
      ),
      customer_id: fieldMatch(
        scored.map((s) => ({ id: s.label.thread_id, ok: s.got.customer_id === s.label.customer_id })),
      ),
    },
    per_class: confusion(
      scored.map((s) => ({ truth: s.label.email_class, got: s.got.email_class })),
      EMAIL_CLASSES,
    ),
    per_dispute_type: confusion(
      scored.map((s) => ({ truth: s.label.dispute_type ?? null, got: s.got.dispute_type })),
      DISPUTE_TYPES,
    ),
  };
}
