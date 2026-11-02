import { describe, expect, it } from "vitest";
import type { Customer, Dispute, EmailMessage, Extraction, Invoice, Match, ReviewItem } from "@/domain/schema";
import { buildThreads, resolveInvoiceRefs, type ThreadSources } from "./threads";

const email = (thread_id: string, n: number, sent_at: string, from = "ap@acme.test"): EmailMessage => ({
  thread_id,
  message_id: `${thread_id}-${n}`,
  from_address: from,
  sent_at,
  subject: `Subject ${thread_id}-${n}`,
  body: `Body ${n}`,
});

const extraction = (m: EmailMessage, over: Partial<Extraction> = {}): Extraction =>
  ({
    message_id: m.message_id,
    thread_id: m.thread_id,
    mode: "simulated",
    provider: "sim",
    email_class: "commitment",
    signals: [],
    invoice_refs: [],
    amounts: [],
    dates: [],
    commitment_date: null,
    payment_claim: null,
    missing_info: [],
    status: "valid",
    ...over,
  }) as Extraction;

const customer = (customer_id: string, name: string, contact_emails: string[]): Customer => ({
  customer_id,
  name,
  contact_emails,
  payment_terms_days: 30,
  segment: "SMB",
});

const invoice = (invoice_id: string, invoice_number: string | null): Invoice =>
  ({ row_id: 1, invoice_id, invoice_number, customer_id: "C-1" }) as Invoice;

const review = (message_id: string, over: Partial<ReviewItem> = {}): ReviewItem =>
  ({ review_id: `R-${message_id}`, kind: "reconciliation", message_id, status: "open", ...over }) as ReviewItem;

const dispute = (source_message_id: string, over: Partial<Dispute> = {}): Dispute =>
  ({ dispute_id: `D-${source_message_id}`, customer_id: "C-1", type: "already_paid", source_message_id, status: "new", ...over }) as Dispute;

function sources(over: Partial<ThreadSources> = {}): ThreadSources {
  return { emails: [], extractions: [], matches: [], reviewItems: [], disputes: [], customers: [], invoices: [], ...over };
}

describe("buildThreads", () => {
  it("groups by thread_id, orders messages oldest first and threads newest first", () => {
    const a2 = email("T-A", 2, "2026-10-05T10:00:00Z");
    const a1 = email("T-A", 1, "2026-10-01T10:00:00Z");
    const b1 = email("T-B", 1, "2026-10-03T10:00:00Z");
    const threads = buildThreads(sources({ emails: [a2, b1, a1] }));
    expect(threads.map((t) => t.thread_id)).toEqual(["T-A", "T-B"]);
    const a = threads[0]!;
    expect(a.messages.map((m) => m.email.message_id)).toEqual(["T-A-1", "T-A-2"]);
    expect(a.subject).toBe("Subject T-A-1");
    expect(a.latest.email.message_id).toBe("T-A-2");
    expect(a.firstSentAt).toBe("2026-10-01T10:00:00Z");
    expect(a.lastSentAt).toBe("2026-10-05T10:00:00Z");
  });

  it("joins the extraction, match, reviews and disputes per message", () => {
    const m = email("T-A", 1, "2026-10-01T10:00:00Z");
    const x = extraction(m, { email_class: "dispute", invoice_refs: ["INV-1012", "INV-1012"] });
    const match: Match = { message_id: m.message_id, outcome: "matched", customer_id: "C-1", invoice_id: "INV-A", candidates: [], reason: "cited" };
    const r1 = review(m.message_id, { invoice_id: "INV-A" });
    const r2 = review(m.message_id, { review_id: "R-2", status: "actioned" });
    const d = dispute(m.message_id, { invoice_id: "INV-A" });
    const [t] = buildThreads(
      sources({
        emails: [m],
        extractions: [x],
        matches: [match],
        reviewItems: [r1, r2],
        disputes: [d],
        customers: [customer("C-1", "Acme Ltd", [])],
        invoices: [invoice("INV-A", "INV-1012")],
      }),
    );
    expect(t!.messages[0]!.extraction).toBe(x);
    expect(t!.messages[0]!.match).toBe(match);
    expect(t!.messages[0]!.reviews).toEqual([r1, r2]);
    expect(t!.openReviews).toEqual([r1]);
    expect(t!.disputes).toEqual([d]);
    expect(t!.customer_id).toBe("C-1");
    expect(t!.customerName).toBe("Acme Ltd");
    expect(t!.intents).toEqual(["dispute"]);
    expect(t!.outcomes).toEqual(["matched"]);
    expect(t!.invoices).toEqual([{ invoice_id: "INV-A", label: "INV-1012" }]);
    expect(t!.refs).toEqual(["INV-1012"]);
    expect(t!.candidates).toEqual([]);
    expect(t!.rejected).toBe(0);
  });

  it("keeps unconfirmed candidates apart from linked invoices", () => {
    const m = email("T-A", 1, "2026-10-01T10:00:00Z");
    const match: Match = { message_id: m.message_id, outcome: "ambiguous", customer_id: "C-1", candidates: ["INV-A", "INV-B"], reason: "two" };
    const [t] = buildThreads(sources({ emails: [m], matches: [match], invoices: [invoice("INV-A", null)] }));
    expect(t!.invoices).toEqual([]);
    expect(t!.candidates).toEqual([
      { invoice_id: "INV-A", label: "INV-A" },
      { invoice_id: "INV-B", label: "INV-B" },
    ]);
  });

  it("treats a matched outcome's candidates as linked (the FS6 duplicate pair)", () => {
    const m = email("T-A", 1, "2026-10-01T10:00:00Z");
    const match: Match = { message_id: m.message_id, outcome: "matched", invoice_id: "INV-A", candidates: ["INV-A", "INV-B"], reason: "pair" };
    const [t] = buildThreads(sources({ emails: [m], matches: [match] }));
    expect(t!.invoices.map((i) => i.invoice_id)).toEqual(["INV-A", "INV-B"]);
    expect(t!.candidates).toEqual([]);
  });

  it("falls back to the sender's address for the customer, case-insensitively", () => {
    const m = email("T-A", 1, "2026-10-01T10:00:00Z", "AP@Acme.test");
    const [t] = buildThreads(sources({ emails: [m], customers: [customer("C-9", "Acme", ["ap@acme.test"])] }));
    expect(t!.customer_id).toBe("C-9");
    expect(t!.customerName).toBe("Acme");
  });

  it("leaves customer and joins absent when nothing was stored", () => {
    const m = email("T-A", 1, "2026-10-01T10:00:00Z");
    const [t] = buildThreads(sources({ emails: [m] }));
    expect(t!.customer_id).toBeUndefined();
    expect(t!.customerName).toBeUndefined();
    expect(t!.messages[0]!.extraction).toBeUndefined();
    expect(t!.messages[0]!.match).toBeUndefined();
    expect(t!.intents).toEqual([]);
    expect(t!.outcomes).toEqual([]);
  });

  it("counts rejected extractions", () => {
    const m1 = email("T-A", 1, "2026-10-01T10:00:00Z");
    const m2 = email("T-A", 2, "2026-10-02T10:00:00Z");
    const [t] = buildThreads(
      sources({
        emails: [m1, m2],
        extractions: [extraction(m1, { status: "rejected", rejection_reason: "bad" }), extraction(m2)],
      }),
    );
    expect(t!.rejected).toBe(1);
  });

  it("returns no threads for no emails", () => {
    expect(buildThreads(sources())).toEqual([]);
  });
});

describe("resolveInvoiceRefs", () => {
  it("maps known invoice numbers to internal ids and leaves unknown ones unlinked", () => {
    const invoices = [invoice("INV-A", "INV-1012"), invoice("INV-B", null)];
    expect(resolveInvoiceRefs(["INV-1012", "INV-9999"], invoices)).toEqual([
      { ref: "INV-1012", invoice_id: "INV-A" },
      { ref: "INV-9999", invoice_id: undefined },
    ]);
  });
});
