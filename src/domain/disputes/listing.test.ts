import { describe, expect, it } from "vitest";
import { paise } from "../money";
import type { Customer, Dispute, EmailMessage, Extraction, Invoice, Match, Payment } from "../schema";
import {
  buildCases,
  DEFAULT_FILTERS,
  exposurePaise,
  filterCases,
  isFiltered,
  kpisFor,
  paginate,
  sortCases,
  toCsv,
  type AuditLike,
  type DisputeSources,
} from "./listing";

const inv = (invoice_id: string, amount_paise: number, invoice_number: string | null = invoice_id): Invoice => ({
  row_id: Number(invoice_id.replace(/\D/g, "")) || 1,
  invoice_id,
  invoice_number,
  customer_id: "C-1",
  invoice_date: "2026-09-01",
  due_date: "2026-10-01",
  amount_paise: paise(amount_paise),
  currency: "INR",
  status_raw: "open",
  status: "open",
  billing_period: null,
  po_number: null,
});

const email = (message_id: string, sent_at: string, subject = "Re: invoice"): EmailMessage => ({
  thread_id: `T-${message_id}`,
  message_id,
  from_address: "ap@customer.example",
  sent_at,
  subject,
  body: "body",
});

const extraction = (message_id: string, payment_claim: Extraction["payment_claim"] = null): Extraction => ({
  message_id,
  thread_id: `T-${message_id}`,
  mode: "simulated",
  provider: "sim",
  schemaVersion: "extraction.v1",
  email_class: "dispute",
  signals: [],
  invoice_refs: [],
  amounts: [],
  dates: [],
  commitment_date: null,
  payment_claim,
  dispute_type: "incorrect_amount",
  missing_info: [],
  status: "valid",
});

const disp = (over: Partial<Dispute> & Pick<Dispute, "dispute_id">): Dispute => ({
  customer_id: "C-1",
  type: "incorrect_amount",
  claim_text: "The amount is wrong",
  ai_recommendation: "Open a dispute and hold reminders until it is resolved",
  status: "new",
  ...over,
});

const customers: Customer[] = [
  { customer_id: "C-1", name: "Coromandel Foods", contact_emails: [], payment_terms_days: 30, segment: "x" },
];

function sources(over: Partial<DisputeSources> = {}): DisputeSources {
  return {
    disputes: [],
    customers,
    invoices: [],
    emails: [],
    extractions: [],
    matches: [],
    payments: [],
    audit: [],
    asOf: "2026-10-30",
    ...over,
  };
}

describe("buildCases", () => {
  it("joins customer, invoice, email, and ages from the email's sent time", () => {
    const c = buildCases(
      sources({
        disputes: [disp({ dispute_id: "D-1", invoice_id: "INV-1", source_message_id: "E-1" })],
        invoices: [inv("INV-1", 60_000_000, "INV-1015")],
        emails: [email("E-1", "2026-10-12T10:00:00Z")],
        extractions: [extraction("E-1")],
      }),
    )[0]!;
    expect(c.customerName).toBe("Coromandel Foods");
    expect(c.invoiceLabel).toBe("INV-1015");
    expect(c.amountPaise).toBe(60_000_000);
    expect(c.age).toBe(18);
    expect(c.group).toBe("needs_response");
  });

  it("ages a manual dispute from its mark_disputed audit event, and unknown otherwise", () => {
    const audit: AuditLike[] = [
      { at: "2026-10-28T09:00:00.000Z", action: "mark_disputed", subject_kind: "invoice", subject_id: "INV-1", after: { dispute_id: "D-m", status: "new" } },
    ];
    const cases = buildCases(
      sources({
        disputes: [disp({ dispute_id: "D-m", invoice_id: "INV-1" }), disp({ dispute_id: "D-x", invoice_id: "INV-1" })],
        invoices: [inv("INV-1", 100)],
        audit,
      }),
    );
    expect(cases[0]!.age).toBe(2);
    expect(cases[0]!.events).toHaveLength(1);
    expect(cases[1]!.age).toBeNull();
  });

  it("withholds the amount for a payment claim (type or extracted claim) and with no ledger invoice", () => {
    const cases = buildCases(
      sources({
        disputes: [
          disp({ dispute_id: "D-1", invoice_id: "INV-1", type: "payment_already_completed" }),
          disp({ dispute_id: "D-2", invoice_id: "INV-2", source_message_id: "E-2" }),
          disp({ dispute_id: "D-3", invoice_id: "INV-404" }),
        ],
        invoices: [inv("INV-1", 100), inv("INV-2", 200)],
        extractions: [extraction("E-2", { paid_on: "2026-10-01", amount_paise: 200 })],
      }),
    );
    expect(cases.map((c) => c.amountPaise)).toEqual([null, null, null]);
    expect(cases.map((c) => c.paymentClaimed)).toEqual([true, true, false]);
    expect(cases[2]!.amountNote).toMatch(/No ledger invoice/);
  });

  it("collects ledger payments for the disputed invoice only", () => {
    const payments: Payment[] = [
      { payment_id: "P-1", invoice_id: "INV-1", paid_on: "2026-10-01", amount_paise: paise(100) },
      { payment_id: "P-2", invoice_id: "INV-9", paid_on: "2026-10-01", amount_paise: paise(100) },
    ];
    const c = buildCases(sources({ disputes: [disp({ dispute_id: "D-1", invoice_id: "INV-1" })], invoices: [inv("INV-1", 100)], payments }))[0]!;
    expect(c.ledgerPayments.map((p) => p.payment_id)).toEqual(["P-1"]);
  });
});

describe("exposure (verified value at stake)", () => {
  const dup = (id: string, invoice: string, pair: string[], msg: string): [Dispute, Match] => [
    disp({ dispute_id: id, invoice_id: invoice, type: "duplicate_invoice", source_message_id: msg }),
    { message_id: msg, outcome: "ambiguous", candidates: pair, reason: "dup" },
  ];

  it("sums open disputes, counts each invoice once, and excludes payment claims and closed disputes", () => {
    const [d3, m3] = dup("D-3", "INV-3", ["INV-3", "INV-4"], "E-3");
    const [d4, m4] = dup("D-4", "INV-4", ["INV-4", "INV-3"], "E-4");
    const cases = buildCases(
      sources({
        disputes: [
          disp({ dispute_id: "D-1", invoice_id: "INV-1" }),
          disp({ dispute_id: "D-1b", invoice_id: "INV-1" }), // same invoice, counted once
          disp({ dispute_id: "D-2", invoice_id: "INV-2", type: "payment_already_completed" }), // claim: excluded
          d3,
          d4, // the same duplicate pair claimed twice: counted once
          disp({ dispute_id: "D-5", invoice_id: "INV-5", status: "resolved" }), // closed: excluded
        ],
        invoices: [inv("INV-1", 1000), inv("INV-2", 2000), inv("INV-3", 300), inv("INV-4", 300), inv("INV-5", 5000)],
        matches: [m3, m4],
      }),
    );
    expect(exposurePaise(cases)).toBe(1000 + 300);
    const k = kpisFor(cases);
    expect(k).toMatchObject({ total: 5, needsResponse: 5, closed: 1, exposurePaise: 1300, unpricedOpen: 1 });
  });
});

describe("filter, sort, page", () => {
  const cases = buildCases(
    sources({
      disputes: [
        disp({ dispute_id: "D-1", invoice_id: "INV-1", source_message_id: "E-1", claim_text: "PO number missing" }),
        disp({ dispute_id: "D-2", invoice_id: "INV-2", source_message_id: "E-2", status: "awaiting_customer", type: "missing_po" }),
        disp({ dispute_id: "D-3", invoice_id: "INV-3", source_message_id: "E-3", status: "under_review" }),
        disp({ dispute_id: "D-4", invoice_id: "INV-4", type: "payment_already_completed", source_message_id: "E-4" }),
      ],
      invoices: [inv("INV-1", 500), inv("INV-2", 900), inv("INV-3", 100), inv("INV-4", 10_000)],
      emails: [
        email("E-1", "2026-10-29T10:00:00Z"),
        email("E-2", "2026-10-10T10:00:00Z", "Purchase order"),
        email("E-3", "2026-10-25T10:00:00Z"),
        email("E-4", "2026-10-20T10:00:00Z"),
      ],
    }),
  );
  const label = (t: string) => t.replace(/_/g, " ");

  it("filters by search terms across claim, subject, invoice and customer", () => {
    expect(filterCases(cases, { ...DEFAULT_FILTERS, query: "po" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-1", "D-2"]);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, query: "purchase order" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-2"]);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, query: "inv-3" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-3"]);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, query: "coromandel" }, label)).toHaveLength(4);
  });

  it("filters by status, type and age", () => {
    expect(filterCases(cases, { ...DEFAULT_FILTERS, status: "needs_response" }, label)).toHaveLength(2);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, type: "missing_po" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-2"]);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, age: "le3" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-1"]);
    expect(filterCases(cases, { ...DEFAULT_FILTERS, age: "le7" }, label).map((c) => c.dispute.dispute_id)).toEqual(["D-1", "D-3"]);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, query: " x " })).toBe(true);
  });

  it("sorts deterministically", () => {
    const ids = (s: Parameters<typeof sortCases>[1]) => sortCases(cases, s).map((c) => c.dispute.dispute_id);
    expect(ids("latest")).toEqual(["D-1", "D-3", "D-4", "D-2"]);
    expect(ids("oldest")).toEqual(["D-2", "D-4", "D-3", "D-1"]);
    expect(ids("longest_unresolved")).toEqual(["D-2", "D-4", "D-3", "D-1"]);
    // D-4 is a payment claim: its amount is withheld, so it sorts last.
    expect(ids("highest_amount")).toEqual(["D-2", "D-1", "D-3", "D-4"]);
    // needs response (D-1 priced, D-4 not) → in resolution → awaiting.
    expect(ids("priority")).toEqual(["D-1", "D-4", "D-3", "D-2"]);
    expect(ids("latest")).toEqual(ids("latest"));
  });

  it("pages six at a time and clamps the page", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(paginate(items, 1)).toMatchObject({ items: [0, 1, 2, 3, 4, 5], from: 1, to: 6, total: 10, pageCount: 2 });
    expect(paginate(items, 2)).toMatchObject({ from: 7, to: 10 });
    expect(paginate(items, 9).page).toBe(2);
    expect(paginate([], 1)).toMatchObject({ from: 0, to: 0, total: 0, pageCount: 1 });
  });

  it("exports CSV with exact amounts and blanks where withheld", () => {
    const csv = toCsv(sortCases(cases, "highest_amount"), { type: label, status: label });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Dispute,Status,Invoice,Customer,Type,Amount (INR),Age (days),Owner,Raised");
    expect(lines[1]).toContain("D-2,awaiting customer,INV-2,Coromandel Foods,missing po,9.00,20,Unassigned");
    expect(lines[4]).toContain(",,10,Unassigned");
  });
});
