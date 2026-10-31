/**
 * Rule-based email classifier (TASK-12.3, TC-023, TC-024).
 *
 * A class needs its phrase signal AND a supporting token:
 * - confirmation → an amount or an invoice ref;
 * - commitment → a date on or after the sent date;
 * - dispute / duplicate → an object (amount, ref, PO or period mention).
 * Unsupported hits are dropped. The class is the highest-precedence supported
 * family (dispute/duplicate > confirmation > commitment > delay > enquiry);
 * every other supported family stays in `signals`. missing_info is an enquiry.
 *
 * `text` must be the same body `tokens` were extracted from — token and hit
 * offsets are compared to pick the date nearest a signal.
 * Pure (SR2): no I/O.
 */
import { extractTokens, type DateToken, type Tokens } from "./extract";
import type { Paise } from "./money";
import { clauseAt, detectSignals, type SignalHit } from "./phrases";
import type { DisputeType, EmailClass, PaymentClaim, SignalFamily } from "./schema";

export interface Classification {
  email_class: EmailClass;
  /** Supported families, in precedence order. */
  signals: SignalFamily[];
  dispute_type?: DisputeType;
  /** Promised date (commitment) or claimed paid date (confirmation / already-paid dispute). */
  commitment_date: string | null;
  payment_claim: PaymentClaim | null;
  missing_info: string[];
}

const PRECEDENCE: SignalFamily[] = [
  "duplicate",
  "dispute",
  "confirmation",
  "commitment",
  "delay",
  "enquiry",
  "missing_info",
];

const CLASS_OF: Record<SignalFamily, EmailClass> = {
  duplicate: "duplicate",
  dispute: "dispute",
  confirmation: "confirmation",
  commitment: "commitment",
  delay: "delay",
  enquiry: "enquiry",
  missing_info: "enquiry",
};

const DISPUTE_OBJECT =
  /\b(?:PO|purchase\s+order|billing\s+period|period|month|january|february|march|april|june|july|august|september|october|november|december)\b/i;
// The month May, case-sensitive so the modal "may" is no object (M-002 R16).
const MAY_MONTH = /\bMay\b(?!\s+(?:I|we|you|be|have|not)\b)/;

/** The date nearest `index`; ties go to the later one in the text. */
function nearest(dates: DateToken[], index: number): DateToken | undefined {
  let best: DateToken | undefined;
  for (const d of dates) {
    if (best === undefined) best = d;
    else {
      const db = Math.abs(best.index - index);
      const dd = Math.abs(d.index - index);
      if (dd < db || (dd === db && d.index > best.index)) best = d;
    }
  }
  return best;
}

/** First date at or after the hit, else the nearest one before it. */
function promisedDate(dates: DateToken[], index: number): DateToken | undefined {
  return dates.find((d) => d.index >= index) ?? nearest(dates, index);
}

/** Amounts written in `text[start, end)`, in order of first appearance. */
function amountsIn(text: string, start: number, end: number, sent: string): Paise[] {
  return extractTokens({ body: text.slice(start, end), sent_at: `${sent}T00:00:00Z` }).amounts;
}

/**
 * The amount a confirmation claims was paid (M-002 R15): the amount in the
 * hit's clause bound to the paid verb — after it for active wording ("we paid
 * ₹3,00,000"), before it for passive ("₹3,00,000 has been paid"). With none in
 * the clause, the email's only amount; with several, null (a person decides).
 */
function claimedAmount(hit: SignalHit, tokens: Tokens, text: string): Paise | null {
  const [cs, ce] = clauseAt(text, hit.index);
  const after = amountsIn(text, hit.index + hit.text.length, ce, tokens.sent);
  const before = amountsIn(text, cs, hit.index, tokens.sent);
  const passive = /^payment\b|\b(?:been|was|were)\b/i.test(hit.text);
  const bound = passive ? (before.at(-1) ?? after[0]) : (after[0] ?? before.at(-1));
  if (bound !== undefined) return bound;
  return tokens.amounts.length === 1 ? (tokens.amounts[0] ?? null) : null;
}

export function classify(tokens: Tokens, text: string): Classification {
  const hits = detectSignals(text);
  const future = tokens.allDates.filter((d) => d.iso >= tokens.sent);
  const past = tokens.allDates.filter((d) => d.iso <= tokens.sent);
  const hasObject = tokens.amounts.length > 0 || tokens.refs.length > 0 || DISPUTE_OBJECT.test(text) || MAY_MONTH.test(text);
  const hasAmountOrRef = tokens.amounts.length > 0 || tokens.refs.length > 0;

  let promised: string | null = null;
  const supported: SignalHit[] = [];
  for (const hit of hits) {
    switch (hit.family) {
      case "confirmation":
        if (hasAmountOrRef) supported.push(hit);
        break;
      case "commitment": {
        const date = promisedDate(future, hit.index);
        if (date) {
          supported.push(hit);
          // EXE10: the latest promised date in the email wins (M-002 R17).
          if (promised === null || date.iso > promised) promised = date.iso;
        }
        break;
      }
      case "dispute":
      case "duplicate":
        if (hasObject) supported.push(hit);
        break;
      default:
        supported.push(hit);
    }
  }

  const signals = PRECEDENCE.filter((f) => supported.some((h) => h.family === f));
  const top = signals[0];
  const email_class: EmailClass = top ? CLASS_OF[top] : "unknown";

  let dispute_type: DisputeType | undefined;
  if (email_class === "duplicate") dispute_type = "duplicate_invoice";
  if (email_class === "dispute") {
    dispute_type = supported.find((h) => h.family === "dispute")?.dispute_type ?? "unknown";
  }

  const claimedPaid = (family: SignalFamily) => {
    const hit = supported.find((h) => h.family === family);
    return hit ? (nearest(past, hit.index)?.iso ?? null) : null;
  };

  let commitment_date: string | null = null;
  let payment_claim: PaymentClaim | null = null;
  if (email_class === "confirmation") {
    const paid_on = claimedPaid("confirmation");
    const hit = supported.find((h) => h.family === "confirmation");
    payment_claim = { paid_on, amount_paise: hit ? claimedAmount(hit, tokens, text) : null };
    commitment_date = paid_on;
  } else if (dispute_type === "payment_already_completed") {
    commitment_date = claimedPaid("dispute");
  } else if (email_class === "commitment") {
    commitment_date = promised;
  }

  const missing_info = [
    ...new Set(supported.flatMap((h) => (h.family === "missing_info" ? (h.items ?? []) : []))),
  ];

  return {
    email_class,
    signals,
    ...(dispute_type ? { dispute_type } : {}),
    commitment_date,
    payment_claim,
    missing_info,
  };
}
