/**
 * Email Conversations (TASK-38): the ingested messages grouped by
 * `thread_id`, each joined to what the pipeline already stored about it —
 * its extraction, its invoice match, the review items and disputes it
 * raised. Pure: every field here is a stored value or a lookup of one, and
 * nothing is inferred that the rows do not say.
 */
import type {
  Customer,
  Dispute,
  EmailClass,
  EmailMessage,
  Extraction,
  Invoice,
  Match,
  MatchOutcome,
  ReviewItem,
} from "@/domain/schema";

export interface ThreadMessage {
  email: EmailMessage;
  /** Absent when the message has no extraction row. */
  extraction?: Extraction;
  /** Absent when the matcher left no row for this message. */
  match?: Match;
  /** Every review item this message raised, any status. */
  reviews: ReviewItem[];
  /** Disputes whose source is this message. */
  disputes: Dispute[];
}

/** An invoice reference the thread links to, by internal id (route) and its number (label). */
export interface InvoiceLink {
  invoice_id: string;
  /** `invoice_number`, else the internal id when the number is missing. */
  label: string;
}

export interface EmailThread {
  thread_id: string;
  /** The first message's subject. */
  subject: string;
  /** Oldest first. */
  messages: ThreadMessage[];
  latest: ThreadMessage;
  firstSentAt: string;
  lastSentAt: string;
  customer_id?: string;
  /** Absent when the customer id has no customer row (or there is no id). */
  customerName?: string;
  /** Unique extraction classes, in message order. */
  intents: EmailClass[];
  /** Unique match outcomes, in message order. */
  outcomes: MatchOutcome[];
  /** Invoices the pipeline tied the thread to: a match, a dispute or a review item. */
  invoices: InvoiceLink[];
  /** Invoice numbers the extraction read in the messages (`invoice_refs`), unique. */
  refs: string[];
  /** Invoices a reviewer was pointed at but no match confirmed (ambiguous / customer-only). */
  candidates: InvoiceLink[];
  disputes: Dispute[];
  openReviews: ReviewItem[];
  /** Messages whose extraction was rejected. */
  rejected: number;
}

export interface ThreadSources {
  emails: EmailMessage[];
  extractions: Extraction[];
  matches: Match[];
  reviewItems: ReviewItem[];
  disputes: Dispute[];
  customers: Customer[];
  invoices: Invoice[];
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T>(rows: T[], key: (row: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === undefined) continue;
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** Group messages into threads and join each to its stored pipeline rows. */
export function buildThreads(src: ThreadSources): EmailThread[] {
  const extractions = new Map(src.extractions.map((x) => [x.message_id, x]));
  const matches = new Map(src.matches.map((m) => [m.message_id, m]));
  const reviews = groupBy(src.reviewItems, (r) => r.message_id);
  const disputes = groupBy(src.disputes, (d) => d.source_message_id);
  const customers = new Map(src.customers.map((c) => [c.customer_id, c]));
  const byContact = new Map<string, string>();
  for (const c of src.customers) for (const e of c.contact_emails) byContact.set(e.toLowerCase(), c.customer_id);
  const invoicesById = new Map(src.invoices.map((i) => [i.invoice_id, i]));
  const link = (invoice_id: string): InvoiceLink => ({
    invoice_id,
    label: invoicesById.get(invoice_id)?.invoice_number ?? invoice_id,
  });

  const threads: EmailThread[] = [];
  for (const [thread_id, emails] of groupBy(src.emails, (e) => e.thread_id)) {
    const messages: ThreadMessage[] = [...emails]
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.message_id.localeCompare(b.message_id))
      .map((email) => ({
        email,
        extraction: extractions.get(email.message_id),
        match: matches.get(email.message_id),
        reviews: reviews.get(email.message_id) ?? [],
        disputes: disputes.get(email.message_id) ?? [],
      }));
    const first = messages[0]!;
    const latest = messages[messages.length - 1]!;

    // The matcher's customer wins; otherwise the sender's address on a customer record.
    const customer_id =
      messages.map((m) => m.match?.customer_id).find((id) => id !== undefined) ??
      messages.map((m) => byContact.get(m.email.from_address.toLowerCase())).find((id) => id !== undefined);

    const linked = uniq(
      messages.flatMap((m) => [
        ...(m.match?.invoice_id ? [m.match.invoice_id] : []),
        ...(m.match?.outcome === "matched" ? m.match.candidates : []),
        ...m.disputes.flatMap((d) => (d.invoice_id ? [d.invoice_id] : [])),
        ...m.reviews.flatMap((r) => (r.invoice_id ? [r.invoice_id] : [])),
      ]),
    );
    const candidates = uniq(
      messages.flatMap((m) => (m.match && m.match.outcome !== "matched" ? m.match.candidates : [])),
    ).filter((id) => !linked.includes(id));

    threads.push({
      thread_id,
      subject: first.email.subject,
      messages,
      latest,
      firstSentAt: first.email.sent_at,
      lastSentAt: latest.email.sent_at,
      customer_id,
      customerName: customer_id ? customers.get(customer_id)?.name : undefined,
      intents: uniq(messages.flatMap((m) => (m.extraction ? [m.extraction.email_class] : []))),
      outcomes: uniq(messages.flatMap((m) => (m.match ? [m.match.outcome] : []))),
      invoices: linked.map(link),
      refs: uniq(messages.flatMap((m) => m.extraction?.invoice_refs ?? [])),
      candidates: candidates.map(link),
      disputes: messages.flatMap((m) => m.disputes),
      openReviews: messages.flatMap((m) => m.reviews.filter((r) => r.status === "open")),
      rejected: messages.filter((m) => m.extraction?.status === "rejected").length,
    });
  }
  return threads.sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt) || a.thread_id.localeCompare(b.thread_id));
}

/** Map extraction invoice numbers (`invoice_refs`) to internal ids, for linking; unknown numbers come back without an id. */
export function resolveInvoiceRefs(refs: string[], invoices: Invoice[]): { ref: string; invoice_id?: string }[] {
  const byNumber = new Map(invoices.flatMap((i) => (i.invoice_number ? [[i.invoice_number, i.invoice_id] as const] : [])));
  return refs.map((ref) => ({ ref, invoice_id: byNumber.get(ref) }));
}
