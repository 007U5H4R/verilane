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
import { formatInr } from "./money";
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

  const candidateIds = exception.candidate_invoice_ids ?? [];
  if (candidateIds.length === 0) {
    return err("Cannot recommend: no open invoice matches this payment's amount.");
  }

  const invoiceById = new Map(invoices.map((i) => [i.invoice_id, i]));
  const candidateInvoices: Invoice[] = [];
  for (const id of candidateIds) {
    const invoice = invoiceById.get(id);
    if (!invoice) continue;
    candidateInvoices.push(invoice);
    if (invoice.invoice_number) add("invoice_number", invoice.invoice_number, `${id}:invoices.csv:invoice_number`);
  }
  if (candidateInvoices.length === 0) {
    return err("Cannot recommend: the candidate invoices are no longer on the ledger.");
  }
  if (customer) add("customer_name", customer.name, `${customer.customer_id}:customers.csv:name`);

  const confidence: RecommendConfidence = candidateInvoices.length === 1 ? "high" : "low";
  const recommendation_text =
    confidence === "high"
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
