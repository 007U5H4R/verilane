/**
 * Recommend agent (TKT-75.03, F15/R5). Pure: no I/O, no provider. Proposes
 * from verified facts only — each fact traces to a source record, following
 * `draft.ts`'s `factsFor()` pattern (R5). Produces read-only output; nothing
 * here is persisted (the Policy agent in `policy.ts` is what writes).
 *
 * Candidate matching is not reimplemented here: `exception.candidate_invoice_ids`
 * is already computed by `paymentExceptionsFor()` (EXE124), so Recommend
 * trusts it and derives confidence from how many candidates it holds:
 *   0 candidates → cannot recommend, with a reason (F13)
 *   1 candidate  → high confidence (exact, unambiguous match)
 *   2+ candidates → low confidence (ambiguous; cites every candidate)
 */
import { addPaise, formatInr, subPaise, ZERO_PAISE, type Paise } from "./money";
import { outstandingOf } from "./priority";
import { type Rejected, err, ok, type Result } from "./result";
import {
  isPaymentExceptionKind,
  type Customer,
  type Exception,
  type Invoice,
  type Payment,
  type VerifiedFact,
  type VerifiedFactKind,
} from "./schema";

export type RecommendConfidence = "high" | "low";

export interface RecommendedFacts {
  exception_id: string;
  /** Every claim this recommendation may state, each traced to a source (R5). */
  facts: VerifiedFact[];
  recommendation_text: string;
  confidence: RecommendConfidence;
  candidate_invoice_ids: string[];
  /** Overpayment only (FS15, EXE162): the matched portion proposed for allocation. */
  proposed_allocation_paise?: Paise;
  /** Overpayment only (FS15, EXE162): the excess held as unapplied cash. */
  unapplied_excess_paise?: Paise;
  generated_at: string;
}

/**
 * Recommends from verified facts only, for a payment exception. Returns
 * `Result<false>` (never a recommendation) when a claim can't be verified
 * against a source record, so an unverifiable claim never reaches Policy.
 */
export function recommendForException(
  exception: Exception,
  payments: readonly Payment[],
  invoices: readonly Invoice[],
  customer: Customer | undefined,
  now: () => string = () => new Date().toISOString(),
): Result<RecommendedFacts, Rejected> {
  if (!isPaymentExceptionKind(exception.kind)) {
    return err(`Recommend agent only supports payment exceptions, not "${exception.kind}".`);
  }
  const payment =
    exception.payment_id !== undefined ? payments.find((p) => p.payment_id === exception.payment_id) : undefined;
  if (!payment) {
    return err("Cannot recommend: the bank line for this exception is no longer on the ledger.");
  }

  const facts: VerifiedFact[] = [];
  const add = (kind: VerifiedFactKind, value: string, evidenceId: string) =>
    facts.push({ claimId: `${exception.review_id}:${kind}`, kind, value, evidenceId });
  add("amount", formatInr(payment.amount_paise), `${payment.payment_id}:payments.csv:amount_paise`);

  // FS16 (EXE162): a cited reference is evidence, kept verbatim. It is only
  // ever compared for exact equality — never matched by similarity.
  const ref = payment.remittance_reference;
  if (ref !== undefined) add("remittance_reference", ref, `${payment.payment_id}:payments.csv:remittance_reference`);

  const candidateIds = exception.candidate_invoice_ids ?? [];
  if (candidateIds.length === 0) {
    const overpayment = proposeOverpayment(payment, payments, invoices, add);
    if (overpayment) {
      return ok({ exception_id: exception.review_id, facts, ...overpayment, confidence: "low", generated_at: now() });
    }
    return err(
      ref === undefined
        ? "Cannot recommend: no open invoice matches this payment's amount."
        : `Cannot recommend: no open invoice matches this payment's amount, and the cited reference "${ref}" matches no invoice number.`,
    );
  }

  const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]));
  // Every candidate must still be on the ledger: dropping a missing one would
  // shrink an ambiguous match to a single "high-confidence" one (m4), so the
  // whole recommendation is unverifiable instead.
  const missing = candidateIds.filter((id) => !invoiceById.has(id));
  if (missing.length === candidateIds.length) {
    return err("Cannot recommend: the candidate invoices are no longer on the ledger.");
  }
  if (missing.length > 0) {
    return err(`Cannot recommend: candidate invoice ${missing.join(", ")} is no longer on the ledger.`);
  }
  const candidateInvoices: Invoice[] = [];
  for (const id of candidateIds) {
    const invoice = invoiceById.get(id)!;
    candidateInvoices.push(invoice);
    if (invoice.invoice_number) add("invoice_number", invoice.invoice_number, `${id}:invoices.csv:invoice_number`);
  }
  if (customer) add("customer_name", customer.name, `${customer.customer_id}:customers.csv:name`);

  // A reference that names none of the candidates contradicts the amount
  // match, so the match is never upgraded to a confident pick (FS16, EXE162).
  const refUnmatched =
    ref !== undefined && !candidateInvoices.some((i) => i.invoice_number === ref || i.invoice_id === ref);
  const confidence: RecommendConfidence = candidateInvoices.length === 1 && !refUnmatched ? "high" : "low";
  const recommendation_text = refUnmatched
    ? `Remittance cites "${ref}", which matches no invoice number; it is not matched by similarity. Requires review.`
    : confidence === "high"
      ? `${formatInr(payment.amount_paise)} matches ${candidateInvoices[0]!.invoice_number ?? candidateInvoices[0]!.invoice_id} exactly.`
      : "Cannot determine which invoice; requires review.";

  return ok({
    exception_id: exception.review_id,
    facts,
    recommendation_text,
    confidence,
    candidate_invoice_ids: candidateIds,
    generated_at: now(),
  });
}

/**
 * FS15 (EXE162): a bank line from a named payer that exceeds the payer's whole
 * open balance. Proposes allocating only the open balance across the payer's
 * open invoices and holding the excess as unapplied cash — always for review,
 * never a confident pick. Returns undefined when it is not an overpayment.
 */
function proposeOverpayment(
  payment: Payment,
  payments: readonly Payment[],
  invoices: readonly Invoice[],
  add: (kind: VerifiedFactKind, value: string, evidenceId: string) => void,
):
  | Pick<RecommendedFacts, "recommendation_text" | "candidate_invoice_ids" | "proposed_allocation_paise" | "unapplied_excess_paise">
  | undefined {
  const payer = payment.payer_customer_id;
  if (payer === undefined) return undefined;
  // The bank line itself carries no invoice_id, so it reduces no balance here.
  const ctx = { payments: [...payments] };
  const open = invoices.filter(
    (i) => i.customer_id === payer && i.status !== "paid" && i.status !== "written_off" && outstandingOf(i, ctx) > 0,
  );
  const balance = open.reduce<Paise>((sum, i) => addPaise(sum, outstandingOf(i, ctx)), ZERO_PAISE);
  if (balance <= 0 || payment.amount_paise <= balance) return undefined;
  const excess = subPaise(payment.amount_paise, balance);
  const numbers = open.map((i) => i.invoice_number ?? i.invoice_id);
  for (const i of open) {
    if (i.invoice_number) add("invoice_number", i.invoice_number, `${i.invoice_id}:invoices.csv:invoice_number`);
  }
  return {
    recommendation_text: `${formatInr(payment.amount_paise)} exceeds ${payer}'s open balance of ${formatInr(balance)}: propose allocating ${formatInr(balance)} across ${numbers.join(", ")} and holding ${formatInr(excess)} as unapplied cash. Requires review.`,
    candidate_invoice_ids: open.map((i) => i.invoice_id),
    proposed_allocation_paise: balance,
    unapplied_excess_paise: excess,
  };
}
