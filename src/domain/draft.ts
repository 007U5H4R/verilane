/**
 * Reminder drafts (TASK-15.2). Pure. A draft is built only from verified
 * facts: the template carries no literal numbers, dates or references
 * (TC-044), so every factual token in a generated body comes from a
 * `VerifiedFact` and sits inside a footnote span that cites its evidence.
 */
import { daysBetween } from "./clock";
import { formatInr, type Paise } from "./money";
import type { Customer, Footnote, Invoice, VerifiedFact, VerifiedFactKind } from "./schema";

/** Template pieces; `{kind}` slots are filled with that fact's value. */
export const DRAFT_TEMPLATE = {
  subject: "Payment reminder: invoice {invoice_number}",
  subjectFallback: "Payment reminder",
  greeting: "Dear {customer_name},",
  greetingFallback: "Dear customer,",
  opening: "This is a reminder that invoice {invoice_number} for {amount}",
  openingFallback: "This is a reminder about an outstanding invoice",
  due: " was due on {due_date}",
  overdue: " and is now {days_overdue} days overdue",
  close: "Please arrange payment at your earliest convenience.",
  signOff: "Regards,\nAccounts Receivable",
} as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-09-13` → `13 September 2026` (the form the reminder states). */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/**
 * The facts a reminder for `invoice` may state, each traced to the ledger
 * cell that verifies it. A fact the ledger can't support is left out, so the
 * draft simply doesn't claim it.
 */
export function factsFor(
  invoice: Invoice,
  customer: Customer | undefined,
  outstanding: Paise,
  asOf: string,
): VerifiedFact[] {
  const id = invoice.invoice_id;
  const facts: VerifiedFact[] = [];
  const add = (kind: VerifiedFactKind, value: string, evidenceId: string) =>
    facts.push({ claimId: `${id}:${kind}`, kind, value, evidenceId });

  if (invoice.invoice_number) {
    add("invoice_number", invoice.invoice_number, `${id}:invoices.csv:invoice_number`);
  }
  if (customer) add("customer_name", customer.name, `${customer.customer_id}:customers.csv:name`);
  add("amount", formatInr(outstanding), `${id}:invoices.csv:amount_paise`);
  if (invoice.due_date) {
    add("due_date", formatLongDate(invoice.due_date), `${id}:invoices.csv:due_date`);
    const days = daysBetween(invoice.due_date, asOf);
    if (days > 0) add("days_overdue", String(days), `${id}:invoices.csv:due_date`);
  }
  const contact = customer?.contact_emails[0];
  if (customer && contact) add("contact", contact, `${customer.customer_id}:customers.csv:contact_emails`);
  return facts;
}

export interface BuiltDraft {
  subject: string;
  body: string;
  footnotes: Footnote[];
}

/** Fills `{kind}` slots, recording each filled span as a footnote. */
function fill(
  template: string,
  byKind: Map<VerifiedFactKind, VerifiedFact>,
  offset: number,
  footnotes: Footnote[],
): string {
  let out = "";
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    out += template.slice(last, m.index);
    const fact = byKind.get(m[1] as VerifiedFactKind);
    const value = fact?.value ?? "";
    if (fact) footnotes.push({ claimId: fact.claimId, span: [offset + out.length, offset + out.length + value.length] });
    out += value;
    last = m.index + m[0].length;
  }
  return out + template.slice(last);
}

/** Builds a reminder from verified facts only. */
export function buildDraft(facts: VerifiedFact[]): BuiltDraft {
  const byKind = new Map(facts.map((f) => [f.kind, f]));
  const has = (k: VerifiedFactKind) => byKind.has(k);
  const t = DRAFT_TEMPLATE;
  const footnotes: Footnote[] = [];
  let body = "";
  const append = (template: string) => {
    body += fill(template, byKind, body.length, footnotes);
  };

  append(has("customer_name") ? t.greeting : t.greetingFallback);
  body += "\n\n";
  append(has("invoice_number") && has("amount") ? t.opening : t.openingFallback);
  if (has("due_date")) {
    append(t.due);
    if (has("days_overdue")) append(t.overdue);
  }
  body += ".\n\n";
  append(t.close);
  body += "\n\n";
  append(t.signOff);

  const subject = fill(has("invoice_number") ? t.subject : t.subjectFallback, byKind, 0, []);
  return { subject, body, footnotes };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Re-finds every occurrence of each fact's exact value in an (edited) body,
 * at token boundaries. A fact edited away loses its footnote, so check 9
 * catches whatever replaced it.
 */
export function locateFootnotes(body: string, facts: VerifiedFact[]): Footnote[] {
  const out: Footnote[] = [];
  for (const f of facts) {
    if (f.value === "" || f.kind === "contact") continue;
    const re = new RegExp(`(?<![\\w.,₹-])${escapeRegExp(f.value)}(?![\\w-]|[.,]\\d)`, "g");
    for (const m of body.matchAll(re)) {
      out.push({ claimId: f.claimId, span: [m.index, m.index + m[0].length] });
    }
  }
  return out.sort((a, b) => a.span[0] - b.span[0]);
}
