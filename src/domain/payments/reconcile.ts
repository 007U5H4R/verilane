/**
 * Payments & Reconciliation (TASK-38): the one pure module that turns review
 * items, emails and the ledger into reconciliation cases — their state, the
 * ledger entries a person may match them to, and the page's KPIs.
 *
 * A claim is not proof. Nothing here writes, links or marks anything: it
 * only says what the data shows and what a person may choose. Rules:
 *  - amount alone never matches a ledger entry;
 *  - a ledger entry from another customer is never a candidate;
 *  - several candidates are never auto-linked (nothing is auto-linked);
 *  - dates and UTRs are only ever quoted from the email, never inferred.
 */
import { daysBetween } from "../clock";
import { extractTokens } from "../extract";
import { paise, parseInr, type Paise } from "../money";
import type { Customer, EmailMessage, Extraction, Invoice, Match, Payment, ReviewItem } from "../schema";

/** The four strings a missing value may read as (truth rules). */
export const MISSING = {
  customer: "Not provided by customer.",
  na: "Not available.",
  evidence: "Supporting evidence not available.",
  review: "Insufficient evidence — human review required.",
} as const;

/** How many days either side of a quoted payment date a ledger entry may sit. */
export const DATE_WINDOW_DAYS = 3;

// --- Workflow fields kept on the review item row ---------------------------

export const WORKFLOW_STATES = [
  "awaiting_evidence",
  "bank_verification",
  "manager_review",
  "verified",
  "rejected",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** What the reconcile commands store on a review item (all optional). */
export interface Workflow {
  workflow_state?: WorkflowState;
  workflow_note?: string;
  assignee?: "analyst" | "manager";
  verified_payment_id?: string;
  verified_reference?: string;
  requested_partial_paise?: number;
  proposed_invoice_id?: string;
}

/** A review item as stored: the schema fields plus any workflow fields. */
export type StoredReviewItem = ReviewItem & Workflow;

const isWorkflowState = (v: unknown): v is WorkflowState =>
  (WORKFLOW_STATES as readonly unknown[]).includes(v);

/** Reads the workflow fields off a raw row, ignoring anything malformed. */
export function workflowOf(row: Record<string, unknown>): Workflow {
  const w: Workflow = {};
  if (isWorkflowState(row.workflow_state)) w.workflow_state = row.workflow_state;
  if (typeof row.workflow_note === "string") w.workflow_note = row.workflow_note;
  if (row.assignee === "analyst" || row.assignee === "manager") w.assignee = row.assignee;
  if (typeof row.verified_payment_id === "string") w.verified_payment_id = row.verified_payment_id;
  if (typeof row.verified_reference === "string") w.verified_reference = row.verified_reference;
  if (typeof row.requested_partial_paise === "number") w.requested_partial_paise = row.requested_partial_paise;
  if (typeof row.proposed_invoice_id === "string") w.proposed_invoice_id = row.proposed_invoice_id;
  return w;
}

// --- Literal claim extraction ------------------------------------------------

/** One claimed fact: its value (or a missing string) and the words it came from. */
export interface ClaimField {
  value: string;
  /** The email text the value was read from; absent when it was not stated. */
  quote?: string;
  /** False when the value is a missing-value string. */
  provided: boolean;
}

export interface Claim {
  amount: ClaimField;
  amount_paise?: Paise;
  date: ClaimField;
  /** ISO day, only when the email wrote an absolute date. */
  date_iso?: string;
  method: ClaimField;
  utr: ClaimField;
  invoice: ClaimField;
  customer: ClaimField;
}

const METHOD = /\b(NEFT|RTGS|IMPS|UPI|cheque|bank transfer|wire transfer)\b/i;
const UTR = /\bUTR\b(?:\s*(?:reference|ref\.?|no\.?|number))?\s*[:#-]?\s*([A-Z0-9]{6,22})\b/i;
const RUPEES = /₹\s?\d[\d,]*(?:\.\d+)?/g;

const missing = (value: string): ClaimField => ({ value, provided: false });
const given = (value: string, quote: string): ClaimField => ({ value, quote, provided: true });

/**
 * The sentence-ish span around `index`, for quoting a value in context.
 * Bounded by line breaks and sentence ends; never longer than the line.
 */
export function quoteAround(body: string, index: number, length: number): string {
  const startLine = body.lastIndexOf("\n", index) + 1;
  const endLineRaw = body.indexOf("\n", index + length);
  const endLine = endLineRaw === -1 ? body.length : endLineRaw;
  const line = body.slice(startLine, endLine);
  const rel = index - startLine;
  // Sentence bounds inside the line ('. ' — keeps "27/10/2026." intact).
  const before = line.lastIndexOf(". ", rel);
  const start = before === -1 ? 0 : before + 2;
  const afterRaw = line.indexOf(". ", rel + length);
  const end = afterRaw === -1 ? line.length : afterRaw + 1;
  return line.slice(start, end).trim();
}

/**
 * What the email itself says about a payment — only what is written.
 * A relative date ("yesterday") is quoted but never turned into a date; a
 * UTR is read only when the text labels it as one.
 */
export function claimFrom(input: {
  email: EmailMessage | undefined;
  extraction: Extraction | undefined;
  item: ReviewItem | undefined;
  customerName: string | undefined;
}): Claim {
  const { email, extraction, item, customerName } = input;
  const body = email?.body ?? "";
  const tokens = email ? extractTokens({ body, sent_at: email.sent_at }) : undefined;

  // Amount: the extracted claim amount, quoted from the ₹ figure that says it.
  const amountPaise = extraction?.payment_claim?.amount_paise ?? item?.email_amount_paise;
  let amount = missing(MISSING.customer);
  if (amountPaise !== undefined) {
    for (const m of body.matchAll(RUPEES)) {
      if (parseInr(m[0]) === amountPaise) {
        amount = given(m[0].replace(/\s/g, ""), quoteAround(body, m.index ?? 0, m[0].length));
        break;
      }
    }
  }

  // Date: absolute dates only. A relative phrase is quoted, not resolved.
  let date = missing(MISSING.customer);
  let dateIso: string | undefined;
  const literal = tokens?.dates[0];
  if (literal) {
    date = given(literal.text, quoteAround(body, literal.index, literal.text.length));
    dateIso = literal.iso;
  } else if (tokens?.relativeDates[0]) {
    const rel = tokens.relativeDates[0];
    date = { value: MISSING.customer, quote: quoteAround(body, rel.index, rel.text.length), provided: false };
  }

  const methodHit = METHOD.exec(body);
  const methodWord = methodHit?.[1];
  const method =
    methodHit && methodWord
      ? given(
          methodWord.toUpperCase() === methodWord ? methodWord : methodWord.toLowerCase(),
          quoteAround(body, methodHit.index, methodHit[0].length),
        )
      : missing(MISSING.customer);

  const utrHit = UTR.exec(body);
  const utrWord = utrHit?.[1];
  const utr =
    utrHit && utrWord && /\d/.test(utrWord)
      ? given(utrWord, quoteAround(body, utrHit.index, utrHit[0].length))
      : missing(MISSING.customer);

  const refs = tokens?.refs ?? [];
  const firstRef = refs[0];
  const refIndex = firstRef ? body.search(new RegExp(firstRef.replace("-", "\\s*-?\\s*"), "i")) : -1;
  const invoice = firstRef && refIndex >= 0 ? given(refs.join(", "), quoteAround(body, refIndex, firstRef.length)) : missing(MISSING.customer);

  const customer = customerName && email ? given(customerName, email.from_address) : missing(MISSING.na);

  const claim: Claim = { amount, date, method, utr, invoice, customer };
  if (amountPaise !== undefined) claim.amount_paise = paise(amountPaise);
  if (dateIso !== undefined) claim.date_iso = dateIso;
  return claim;
}

// --- Cases --------------------------------------------------------------------

export type CaseKind = "payment_claim" | "duplicate_invoice";

/** One email that needs reconciling, with every review item it raised. */
export interface ReconCase {
  /** The email's message id — one case per email. */
  id: string;
  kind: CaseKind;
  items: StoredReviewItem[];
  invoiceIds: string[];
  customerId?: string;
}

/**
 * Groups reconciliation items by the email that raised them: a duplicate
 * pair (two items, one email) is one case, never two (no double counting).
 */
export function buildCases(items: StoredReviewItem[], matches: Map<string, Match>, invoices: Map<string, Invoice>): ReconCase[] {
  const byMessage = new Map<string, StoredReviewItem[]>();
  for (const item of items) {
    if (item.kind !== "reconciliation") continue;
    const list = byMessage.get(item.message_id) ?? [];
    list.push(item);
    byMessage.set(item.message_id, list);
  }
  const cases: ReconCase[] = [];
  for (const [id, list] of byMessage) {
    list.sort((a, b) => a.review_id.localeCompare(b.review_id));
    const invoiceIds = [...new Set(list.flatMap((r) => (r.invoice_id ? [r.invoice_id] : [])))];
    const linked = list.some((r) => r.linked_review_ids.length > 0) || invoiceIds.length > 1;
    const customerId = matches.get(id)?.customer_id ?? (invoiceIds[0] ? invoices.get(invoiceIds[0])?.customer_id : undefined);
    const c: ReconCase = { id, kind: linked ? "duplicate_invoice" : "payment_claim", items: list, invoiceIds };
    if (customerId !== undefined) c.customerId = customerId;
    cases.push(c);
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

// --- Matching hierarchy -------------------------------------------------------

export type CandidateTier = "exact" | "same_invoice_amount_differs" | "different_invoice";

/** A ledger entry worth a person's look, and how far up the hierarchy it got. */
export interface Candidate {
  payment: Payment;
  tier: CandidateTier;
  /** Only same-invoice, same-customer entries may be chosen in the match dialog. */
  linkable: boolean;
  checks: {
    invoice: boolean;
    customer: boolean;
    /** The ledger stores no reference, so UTR can never be compared. */
    utr: "not_available";
    amount: boolean;
    /** null when the email gives no absolute date to compare with. */
    dateWindow: boolean | null;
  };
}

/**
 * Ledger entries a claim might correspond to, best first. Hierarchy: exact
 * invoice → customer → UTR → amount → date window.
 *  - Customer is a hard gate: another customer's payment is never listed.
 *  - Same invoice is required to be linkable.
 *  - A same-customer entry on a different invoice is listed only when the
 *    amount is equal ("possibly recorded against the wrong invoice") and is
 *    never linkable — amount alone never matches.
 */
export function candidatesFor(
  c: { invoiceId?: string; customerId?: string; amount?: Paise; dateIso?: string },
  payments: Payment[],
  invoices: Map<string, Invoice>,
): Candidate[] {
  if (!c.customerId) return [];
  const out: Candidate[] = [];
  for (const p of payments) {
    const inv = invoices.get(p.invoice_id);
    if (!inv || inv.customer_id !== c.customerId) continue; // never across customers
    const sameInvoice = c.invoiceId !== undefined && p.invoice_id === c.invoiceId;
    const amount = c.amount !== undefined && p.amount_paise === c.amount;
    const dateWindow = c.dateIso ? Math.abs(daysBetween(c.dateIso, p.paid_on)) <= DATE_WINDOW_DAYS : null;
    let tier: CandidateTier;
    if (sameInvoice) tier = amount ? "exact" : "same_invoice_amount_differs";
    else if (amount) tier = "different_invoice";
    else continue;
    out.push({
      payment: p,
      tier,
      linkable: sameInvoice,
      checks: { invoice: sameInvoice, customer: true, utr: "not_available", amount, dateWindow },
    });
  }
  const rank: Record<CandidateTier, number> = { exact: 0, same_invoice_amount_differs: 1, different_invoice: 2 };
  return out.sort(
    (a, b) =>
      rank[a.tier] - rank[b.tier] ||
      Number(b.checks.dateWindow === true) - Number(a.checks.dateWindow === true) ||
      b.payment.paid_on.localeCompare(a.payment.paid_on),
  );
}

// --- State mapping ------------------------------------------------------------

export const CASE_STATES = [
  "exact_match_candidate",
  "amount_mismatch",
  "no_ledger_entry",
  "ambiguous_invoice",
  "awaiting_evidence",
  "bank_verification",
  "manager_review",
  "verified",
  "rejected",
] as const;
export type CaseState = (typeof CASE_STATES)[number];

export type Tone = "verified" | "pending" | "mismatch" | "ambiguous" | "unknown" | "info";

export const STATE_META: Record<CaseState, { label: string; heading: string; tone: Tone }> = {
  exact_match_candidate: { label: "Match candidate", heading: "Ledger entry found — confirm the match", tone: "info" },
  amount_mismatch: { label: "Amount mismatch", heading: "Claimed amount differs from the ledger", tone: "mismatch" },
  no_ledger_entry: { label: "Not in ledger", heading: "Claimed payment is not in the ledger", tone: "mismatch" },
  ambiguous_invoice: { label: "Ambiguous invoice", heading: "Customer says an invoice is a duplicate", tone: "ambiguous" },
  awaiting_evidence: { label: "Awaiting proof", heading: "Waiting for payment proof", tone: "pending" },
  bank_verification: { label: "Bank check", heading: "Waiting for bank verification", tone: "pending" },
  manager_review: { label: "Manager review", heading: "With a Manager for review", tone: "pending" },
  verified: { label: "Verified", heading: "Verified against the ledger", tone: "verified" },
  rejected: { label: "Rejected", heading: "Claim rejected", tone: "unknown" },
};

export interface CaseFacts {
  state: CaseState;
  /** Claim is below the invoice amount: a part payment, never assumed full. */
  partial: boolean;
  /** |claim − ledger outstanding|, when both are known. */
  discrepancy?: Paise;
  /** Open = still needs a person (not verified or rejected). */
  open: boolean;
}

/**
 * The one place a case's state is decided. Recorded decisions (verified,
 * rejected) and workflow steps win; otherwise the ledger evidence decides.
 */
export function caseFacts(input: {
  kind: CaseKind;
  items: StoredReviewItem[];
  invoice?: Invoice;
  claimAmount?: Paise;
  outstanding?: Paise;
  candidates: Candidate[];
}): CaseFacts {
  const { kind, items, invoice, claimAmount, outstanding, candidates } = input;
  const head = items[0];
  const partial = claimAmount !== undefined && invoice !== undefined && claimAmount < invoice.amount_paise;
  const discrepancy =
    claimAmount !== undefined && outstanding !== undefined ? paise(Math.abs(claimAmount - outstanding)) : undefined;
  const withD = (state: CaseState, open: boolean): CaseFacts => {
    const f: CaseFacts = { state, partial, open };
    if (discrepancy !== undefined) f.discrepancy = discrepancy;
    return f;
  };

  const wf = head?.workflow_state;
  if (head?.status === "actioned" && wf === "verified") return withD("verified", false);
  if (head?.status === "dismissed" || wf === "rejected") return withD("rejected", false);
  if (head?.status !== "open" && head !== undefined) return withD("rejected", false);
  if (wf === "awaiting_evidence" || wf === "bank_verification" || wf === "manager_review") return withD(wf, true);

  if (kind === "duplicate_invoice" || !invoice) return withD("ambiguous_invoice", true);
  if (candidates.some((c) => c.tier === "exact")) return withD("exact_match_candidate", true);
  if (candidates.some((c) => c.tier === "same_invoice_amount_differs")) return withD("amount_mismatch", true);
  if (claimAmount !== undefined && outstanding !== undefined && claimAmount !== outstanding) {
    return withD("amount_mismatch", true);
  }
  return withD("no_ledger_entry", true);
}

/**
 * What the balance would be if a part payment of `amount` were recorded.
 * Never below zero; an amount above the outstanding is not a part payment.
 */
export function remainingAfter(outstanding: Paise, amount: Paise): { remaining: Paise; valid: boolean; reason?: string } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { remaining: outstanding, valid: false, reason: "Enter an amount above ₹0." };
  }
  if (amount > outstanding) {
    return { remaining: outstanding, valid: false, reason: "That is more than the ledger outstanding." };
  }
  return { remaining: paise(outstanding - amount), valid: true };
}

/** UTRs quoted by more than one email (a duplicate payment reference). */
export function duplicateReferences(claims: Array<{ caseId: string; utr?: string }>): Map<string, string[]> {
  const by = new Map<string, Set<string>>();
  for (const c of claims) {
    if (!c.utr) continue;
    const key = c.utr.toUpperCase();
    const set = by.get(key) ?? new Set<string>();
    set.add(c.caseId);
    by.set(key, set);
  }
  const out = new Map<string, string[]>();
  for (const [utr, ids] of by) if (ids.size > 1) out.set(utr, [...ids].sort());
  return out;
}

// --- KPIs -------------------------------------------------------------------

export interface PaymentsKpis {
  /** Unique open reconciliation cases (emails), not review items. */
  needsReconciliation: number;
  /** Unique emails with an open uncertain_match item. */
  unmatchedEmails: number;
  /** Unique ledger entries. */
  ledgerEntries: number;
  /** Sum of unique ledger entries only — claims never count. */
  ledgerTotal: Paise;
}

export function kpis(cases: Array<{ id: string; open: boolean }>, items: ReviewItem[], payments: Payment[]): PaymentsKpis {
  const openCases = new Set(cases.filter((c) => c.open).map((c) => c.id));
  const unmatched = new Set(items.filter((r) => r.kind === "uncertain_match" && r.status === "open").map((r) => r.message_id));
  const unique = new Map(payments.map((p) => [p.payment_id, p]));
  let total = 0;
  for (const p of unique.values()) total += p.amount_paise;
  return {
    needsReconciliation: openCases.size,
    unmatchedEmails: unmatched.size,
    ledgerEntries: unique.size,
    ledgerTotal: paise(total),
  };
}

// --- Ledger reconciliation status -------------------------------------------

export type LedgerStatus = "verified" | "candidate" | "recorded";

export const LEDGER_STATUS_META: Record<LedgerStatus, { label: string; tone: Tone }> = {
  verified: { label: "Verified against claim", tone: "verified" },
  candidate: { label: "Claim pending review", tone: "pending" },
  recorded: { label: "Ledger-recorded", tone: "info" },
};

/** A ledger entry's status from the review items that point at it. */
export function ledgerStatus(paymentId: string, verifiedIds: Set<string>, candidateIds: Set<string>): LedgerStatus {
  if (verifiedIds.has(paymentId)) return "verified";
  if (candidateIds.has(paymentId)) return "candidate";
  return "recorded";
}

// --- One case, assessed -------------------------------------------------------

export interface CaseContext {
  invoices: Map<string, Invoice>;
  customers: Map<string, Customer>;
  emails: Map<string, EmailMessage>;
  extractions: Map<string, Extraction>;
  matches: Map<string, Match>;
  payments: Payment[];
}

export interface AssessedCase extends CaseFacts {
  case: ReconCase;
  head: StoredReviewItem;
  invoice?: Invoice;
  customer?: Customer;
  email?: EmailMessage;
  claim: Claim;
  candidates: Candidate[];
  outstanding?: Paise;
  /** Set when exactly one same-invoice ledger entry already carries the claimed amount. */
  recordedPaymentId?: string;
  /**
   * The balance if the claim were confirmed. When the claim is already in
   * the ledger the outstanding already reflects it, so nothing is subtracted
   * twice; a claim above the outstanding is not a valid part payment.
   */
  remainingIfConfirmed?: Paise;
}

/** Everything the page needs to show one case, from data only. */
export function assessCase(c: ReconCase, ctx: CaseContext): AssessedCase {
  const head = c.items[0]!;
  const invoice = c.kind === "payment_claim" && c.invoiceIds[0] ? ctx.invoices.get(c.invoiceIds[0]) : undefined;
  const customer = c.customerId ? ctx.customers.get(c.customerId) : undefined;
  const email = ctx.emails.get(c.id);
  const claim = claimFrom({ email, extraction: ctx.extractions.get(c.id), item: head, customerName: customer?.name });
  const outstanding = head.ledger_outstanding_paise;
  const candidates =
    c.kind === "payment_claim"
      ? candidatesFor(
          {
            ...(invoice ? { invoiceId: invoice.invoice_id } : {}),
            ...(c.customerId ? { customerId: c.customerId } : {}),
            ...(claim.amount_paise !== undefined ? { amount: claim.amount_paise } : {}),
            ...(claim.date_iso ? { dateIso: claim.date_iso } : {}),
          },
          ctx.payments,
          ctx.invoices,
        )
      : [];
  const facts = caseFacts({
    kind: c.kind,
    items: c.items,
    ...(invoice ? { invoice } : {}),
    ...(claim.amount_paise !== undefined ? { claimAmount: claim.amount_paise } : {}),
    ...(outstanding !== undefined ? { outstanding } : {}),
    candidates,
  });
  const out: AssessedCase = { ...facts, case: c, head, claim, candidates };
  if (invoice) out.invoice = invoice;
  if (customer) out.customer = customer;
  if (email) out.email = email;
  if (outstanding !== undefined) out.outstanding = outstanding;
  const exact = candidates.filter((k) => k.tier === "exact");
  if (exact.length === 1) out.recordedPaymentId = exact[0]!.payment.payment_id;
  if (outstanding !== undefined && claim.amount_paise !== undefined) {
    if (exact.length > 0) out.remainingIfConfirmed = outstanding;
    else {
      const r = remainingAfter(outstanding, claim.amount_paise);
      if (r.valid) out.remainingIfConfirmed = r.remaining;
    }
  }
  return out;
}

/** Customer name for an invoice id, or undefined. */
export function customerOf(invoiceId: string | undefined, invoices: Map<string, Invoice>, customers: Map<string, Customer>): Customer | undefined {
  const inv = invoiceId ? invoices.get(invoiceId) : undefined;
  return inv ? customers.get(inv.customer_id) : undefined;
}
