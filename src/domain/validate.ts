/**
 * The nine pre-approval checks (TASK-15.3). Pure. `draftContextFor` gathers
 * what the ledger and the matched email say about one invoice; `validate`
 * runs the nine checks against a draft. Check 9 is the FS12 guard: any
 * number, date, invoice reference or customer name in the body that is not
 * inside a footnote span (i.e. not a verified fact) fails the draft.
 */
import { outstandingOf } from "./priority";
import { parseInr } from "./money";
import { MANAGER_APPROVAL_THRESHOLD } from "./permissions";
import type {
  Check,
  Customer,
  Extraction,
  Footnote,
  Invoice,
  Match,
  Payment,
  ReviewItem,
  VerifiedFact,
} from "./schema";
import { OPEN_DISPUTE, type DisputeRecord } from "./signals";

/** Everything `draftContextFor` reads; the command core loads it from the db. */
export interface DraftSources {
  asOf: string;
  invoices: Invoice[];
  customers: Customer[];
  payments: Payment[];
  extractions: Extraction[];
  matches: Match[];
  disputes: DisputeRecord[];
  reviewItems: ReviewItem[];
}

/** What is known about one invoice when a draft about it is checked. */
export interface DraftContext {
  invoiceId: string;
  invoice?: Invoice;
  customer?: Customer;
  /** Outstanding paise (amount − Σpayments); 0 when the invoice is unknown. */
  outstanding: number;
  /** Every known customer name, for check 9. */
  customerNames: string[];
  /** Why the invoice is disputed, or null (check 6). */
  disputed: string | null;
  /** Why a payment is claimed, or null (check 7). */
  paymentClaim: string | null;
  /** An ambiguous email match names this invoice (→ Manager approval). */
  ambiguousMatch: boolean;
  /** An open reconciliation item reports conflicting payment info (→ Manager approval). */
  conflictingPayment: boolean;
}

/** The parts of a draft the checks read. */
export interface DraftUnderCheck {
  body: string;
  facts: VerifiedFact[];
  footnotes: Footnote[];
}

const emailCause = (x: Extraction) => `email ${x.message_id} (${x.email_class})`;

export function draftContextFor(invoiceId: string, src: DraftSources): DraftContext {
  const invoice = src.invoices.find((i) => i.invoice_id === invoiceId);
  const customer = invoice ? src.customers.find((c) => c.customer_id === invoice.customer_id) : undefined;
  const outstanding = invoice ? outstandingOf(invoice, { payments: src.payments }) : 0;

  let disputed: string | null = null;
  let paymentClaim: string | null = null;
  let closedDispute = false;
  for (const d of src.disputes) {
    if (d.invoice_id !== invoiceId) continue;
    if (OPEN_DISPUTE.has(d.status)) disputed ??= `Open dispute ${d.dispute_id}`;
    else closedDispute = true;
  }

  const byMessage = new Map(src.extractions.map((x) => [x.message_id, x]));
  const underReview = new Set(
    src.reviewItems.filter((r) => r.status === "open").map((r) => r.message_id),
  );
  let ambiguousMatch = false;
  for (const m of src.matches) {
    if (m.outcome === "ambiguous" && m.candidates.includes(invoiceId)) ambiguousMatch = true;
    // FS11 (TASK-22): an email the provider could not read may be a dispute
    // or a payment claim about any invoice it could concern, so those
    // invoices stay blocked until a person deals with its review item.
    const rejected = byMessage.get(m.message_id)?.status === "rejected";
    if (
      rejected &&
      underReview.has(m.message_id) &&
      (m.invoice_id === invoiceId || m.candidates.includes(invoiceId))
    ) {
      disputed ??= `Unreadable email ${m.message_id} (extraction rejected) may dispute this invoice; review it first`;
    }
    if (m.outcome !== "matched") continue;
    const x = byMessage.get(m.message_id);
    if (!x || x.status !== "valid") continue;
    const names = m.invoice_id === invoiceId;
    switch (x.email_class) {
      case "dispute":
        if (names && x.dispute_type === "payment_already_completed") paymentClaim ??= emailCause(x);
        else if (names && !closedDispute) disputed ??= emailCause(x);
        break;
      case "duplicate":
        // FS6: both invoices of the pair stay disputed until reconciled.
        if ((names || m.candidates.includes(invoiceId)) && !closedDispute) disputed ??= emailCause(x);
        break;
      case "confirmation":
        if (names) paymentClaim ??= emailCause(x);
        break;
      default:
        break;
    }
  }

  const conflictingPayment = src.reviewItems.some(
    (r) =>
      r.kind === "reconciliation" &&
      r.invoice_id === invoiceId &&
      r.status === "open" &&
      r.validation_status === "conflict",
  );

  return {
    invoiceId,
    invoice,
    customer,
    outstanding,
    customerNames: src.customers.map((c) => c.name),
    disputed,
    paymentClaim,
    ambiguousMatch,
    conflictingPayment,
  };
}

// --- Check 9: factual tokens outside footnotes ------------------------------

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const NUM = String.raw`\d+(?:,\d+)*(?:\.\d+)?`;

/** Token patterns, most specific first; a match masks its text from later ones. */
const TOKEN_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  new RegExp(String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}\b(?:,?\s+\d{4})?`, "gi"),
  new RegExp(String.raw`\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?\b(?:,?\s+\d{4})?`, "gi"),
  /\bINV-[A-Za-z0-9-]*[A-Za-z0-9]/g,
  new RegExp(String.raw`(?:₹|\bRs\.?|\bINR)\s*${NUM}(?:\s*(?:lakhs?|crores?)\b)?`, "gi"),
  new RegExp(String.raw`${NUM}\s*(?:lakhs?|crores?)\b`, "gi"),
  new RegExp(NUM, "g"),
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Factual tokens in `body` not wholly inside a footnote span, in body order. */
export function findUnverifiedTokens(body: string, footnotes: Footnote[], customerNames: string[]): string[] {
  const patterns = [
    ...TOKEN_PATTERNS.slice(0, -1),
    ...customerNames.filter((n) => n.trim() !== "").map((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "gi")),
    TOKEN_PATTERNS[TOKEN_PATTERNS.length - 1] as RegExp,
  ];
  let masked = body;
  const found: { start: number; end: number }[] = [];
  for (const re of patterns) {
    for (const m of masked.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      found.push({ start, end });
      masked = masked.slice(0, start) + "\u0000".repeat(end - start) + masked.slice(end);
    }
  }
  const covered = (t: { start: number; end: number }) =>
    footnotes.some((f) => f.span[0] <= t.start && t.end <= f.span[1]);
  return found
    .filter((t) => !covered(t))
    .sort((a, b) => a.start - b.start)
    .map((t) => body.slice(t.start, t.end));
}

// --- The nine checks ---------------------------------------------------------

export const CHECK_NAMES: Record<number, string> = {
  1: "Invoice exists",
  2: "Customer matches",
  3: "Amount matches outstanding",
  4: "Currency present",
  5: "Due date present",
  6: "No open dispute",
  7: "No payment claimed",
  8: "Invoice still open",
  9: "Every fact is footnoted",
};

function check(id: number, passed: boolean, reason: string): Check {
  return { id, name: CHECK_NAMES[id] ?? `Check ${id}`, passed, reason };
}

export function validate(draft: DraftUnderCheck, ctx: DraftContext): Check[] {
  const fact = (kind: VerifiedFact["kind"]) => draft.facts.find((f) => f.kind === kind)?.value;
  const inv = ctx.invoice;
  const checks: Check[] = [];

  const number = fact("invoice_number");
  checks.push(
    !inv
      ? check(1, false, `Invoice ${ctx.invoiceId} is not in the ledger`)
      : inv.invoice_number === null
        ? check(1, false, "The invoice has no invoice number")
        : number !== inv.invoice_number
          ? check(1, false, `The draft names ${number ?? "no invoice"}, the ledger has ${inv.invoice_number}`)
          : check(1, true, `${inv.invoice_number} is in the ledger`),
  );

  const name = fact("customer_name");
  checks.push(
    !ctx.customer
      ? check(2, false, "The invoice's customer is not in the ledger")
      : name !== ctx.customer.name
        ? check(2, false, `The draft addresses ${name ?? "no customer"}, the invoice is ${ctx.customer.name}'s`)
        : check(2, true, `Addressed to ${ctx.customer.name}`),
  );

  const amount = fact("amount");
  const stated = amount === undefined ? null : parseInr(amount);
  checks.push(
    !inv
      ? check(3, false, "No invoice to compare the amount against")
      : stated === null
        ? check(3, false, "The draft states no amount")
        : stated !== ctx.outstanding
          ? check(3, false, `The draft states ${amount}, which is not the outstanding amount`)
          : check(3, true, `${amount} equals the outstanding amount`),
  );

  checks.push(
    inv?.currency
      ? check(4, true, `Currency is ${inv.currency}`)
      : check(4, false, "The invoice has no currency"),
  );

  checks.push(
    inv?.due_date ? check(5, true, "The invoice has a due date") : check(5, false, "The invoice has no due date"),
  );

  checks.push(ctx.disputed ? check(6, false, ctx.disputed) : check(6, true, "No open dispute on this invoice"));

  checks.push(
    ctx.paymentClaim
      ? check(7, false, `Payment claimed in ${ctx.paymentClaim}`)
      : check(7, true, "No payment claimed by the customer"),
  );

  checks.push(
    !inv
      ? check(8, false, "No invoice to remind about")
      : inv.status === "paid" || inv.status === "written_off"
        ? check(8, false, `The invoice is ${inv.status.replace("_", " ")}`)
        : ctx.outstanding <= 0
          ? check(8, false, "Nothing is outstanding on the invoice")
          : check(8, true, "The invoice is still open"),
  );

  const loose = findUnverifiedTokens(draft.body, draft.footnotes, ctx.customerNames);
  checks.push(
    loose.length > 0
      ? check(9, false, `Not backed by a verified fact: ${loose.join(", ")}`)
      : check(9, true, "Every number, date, reference and name is footnoted"),
  );

  return checks;
}

/** A draft needs Manager approval over ₹5L, or on an ambiguous or conflicting payment picture. */
export function requiresManager(d: { amount_paise: number; ambiguous_match: boolean; conflicting_payment: boolean }): boolean {
  return d.amount_paise > MANAGER_APPROVAL_THRESHOLD || d.ambiguous_match || d.conflicting_payment;
}
