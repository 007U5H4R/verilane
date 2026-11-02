import { describe, expect, it } from "vitest";
import { paise, type Paise } from "../money";
import type { RankItem } from "../priority";
import type { Customer, Invoice, Payment, Priority } from "../schema";
import {
  DEFAULT_PARAMS,
  balanceState,
  buildRows,
  filterRows,
  isFiltering,
  kpis,
  overdueState,
  pageInfo,
  pageWindow,
  parseParams,
  serializeParams,
  sortRows,
  type InvoiceRow,
  type RegisterParams,
} from "./register";

function row(over: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    number: over.id.replace("INV-", "INV-1"),
    customerId: "C-001",
    customerName: "Aravalli Textiles Pvt Ltd",
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    amount: paise(100_00),
    outstanding: paise(100_00),
    status: "open",
    band: "medium",
    daysOverdue: 29,
    closed: false,
    ageing: "16-30",
    disputeIds: [],
    ...over,
  };
}

const sp = (s: string) => new URLSearchParams(s);
const P = (over: Partial<RegisterParams> = {}): RegisterParams => ({ ...DEFAULT_PARAMS, ...over });

describe("buildRows", () => {
  const invoice = (id: string, over: Partial<Invoice> = {}): Invoice => ({
    row_id: 1,
    invoice_id: id,
    invoice_number: `N-${id}`,
    customer_id: "C-001",
    invoice_date: "2026-09-01",
    due_date: "2026-10-01",
    amount_paise: paise(1000_00),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
    ...over,
  });
  const priority = (id: string, band: Priority["band"], days: number | null): Priority => ({
    invoice_id: id,
    config_version: "priority.v1",
    band,
    factors: [],
    reason: "",
    recommended_action: "",
    days_overdue: days,
  });
  const customers = new Map<string, Customer>([
    ["C-001", { customer_id: "C-001", name: "Aravalli", contact_emails: [], payment_terms_days: 30, segment: "SMB" }],
  ]);

  it("joins outstanding, customer name, open disputes and the engine's band/days", () => {
    const items: RankItem[] = [
      { invoice: invoice("INV-1"), priority: priority("INV-1", "disputed", 29) },
      { invoice: invoice("INV-2", { customer_id: "C-999", status: "paid" }), priority: priority("INV-2", "closed", 40) },
    ];
    const payments: Payment[] = [
      { payment_id: "P-1", invoice_id: "INV-1", amount_paise: paise(400_00), paid_on: "2026-10-02" } as unknown as Payment,
    ];
    const rows = buildRows(items, customers, payments, [
      { dispute_id: "D-2", invoice_id: "INV-1" },
      { dispute_id: "D-1", invoice_id: "INV-1" },
      { dispute_id: "D-9" },
    ]);
    expect(rows[0]).toMatchObject({
      outstanding: 600_00,
      customerName: "Aravalli",
      disputeIds: ["D-1", "D-2"],
      daysOverdue: 29,
      closed: false,
      ageing: "16-30",
    });
    // Closed invoices are kept (the register is every invoice) and have no ageing bucket.
    expect(rows[1]).toMatchObject({ customerName: null, closed: true, ageing: null, disputeIds: [] });
  });
});

describe("overdueState", () => {
  it("never shows an unknown as 0", () => {
    expect(overdueState({ closed: false, daysOverdue: null })).toEqual({ kind: "unknown", label: "Unknown" });
  });
  it("labels not-due, due-today, overdue and closed", () => {
    expect(overdueState({ closed: false, daysOverdue: -3 }).label).toBe("Due in 3 days");
    expect(overdueState({ closed: false, daysOverdue: -1 }).label).toBe("Due in 1 day");
    expect(overdueState({ closed: false, daysOverdue: 0 }).label).toBe("Due today");
    expect(overdueState({ closed: false, daysOverdue: 1 })).toEqual({ kind: "overdue", days: 1, label: "1 day" });
    expect(overdueState({ closed: false, daysOverdue: 45 }).label).toBe("45 days");
    expect(overdueState({ closed: true, daysOverdue: 45 }).kind).toBe("closed");
  });
});

describe("balanceState", () => {
  it("covers due, paid, overpaid and written off", () => {
    expect(balanceState({ status: "open", outstanding: paise(5) })).toEqual({ kind: "due", amount: 5 });
    expect(balanceState({ status: "paid", outstanding: paise(0) })).toEqual({ kind: "paid" });
    expect(balanceState({ status: "partially_paid", outstanding: paise(0) })).toEqual({ kind: "paid" });
    expect(balanceState({ status: "paid", outstanding: paise(-250) })).toEqual({ kind: "overpaid", amount: 250 });
    expect(balanceState({ status: "written_off", outstanding: paise(70) })).toEqual({ kind: "written_off", amount: 70 });
  });
});

describe("URL params", () => {
  it("defaults to an empty query string", () => {
    expect(parseParams(sp(""))).toEqual(DEFAULT_PARAMS);
    expect(serializeParams(DEFAULT_PARAMS)).toBe("");
  });
  it("round-trips every key, omitting defaults", () => {
    const p = P({ q: "1004", status: "partially_paid", ageing: "60+", customer: "C-003", sort: { key: "amount", desc: false }, page: 2 });
    const s = serializeParams(p);
    expect(s).toBe("q=1004&status=partially_paid&ageing=60%2B&customer=C-003&sort=amount.asc&page=2");
    expect(parseParams(sp(s))).toEqual(p);
  });
  it("writes a bare sort key for the key's default direction", () => {
    expect(serializeParams(P({ sort: { key: "overdue", desc: true } }))).toBe("sort=overdue");
    expect(parseParams(sp("sort=overdue")).sort).toEqual({ key: "overdue", desc: true });
    expect(parseParams(sp("sort=due")).sort).toEqual({ key: "due", desc: false });
  });
  it("drops unknown values instead of failing", () => {
    expect(parseParams(sp("status=bogus&ageing=99&sort=x.desc&page=-4&customer=%20"))).toEqual(DEFAULT_PARAMS);
    expect(parseParams(sp("sort=amount.sideways")).sort).toEqual(DEFAULT_PARAMS.sort);
    expect(parseParams(sp("page=2.5")).page).toBe(1);
  });
  it("does not carry foreign keys such as __state", () => {
    expect(serializeParams(parseParams(sp("__state=error&q=a")))).toBe("q=a");
  });
  it("isFiltering ignores sort and page", () => {
    expect(isFiltering(P({ sort: { key: "due", desc: true }, page: 3 }))).toBe(false);
    expect(isFiltering(P({ customer: "C-001" }))).toBe(true);
  });
});

describe("filterRows", () => {
  const rows = [
    row({ id: "INV-001", customerName: "Aravalli Textiles", status: "open", ageing: "1-15" }),
    row({ id: "INV-002", customerId: "C-002", customerName: "Bharat Polymers", status: "paid", closed: true, ageing: null }),
    row({ id: "INV-003", number: null, customerId: "C-003", customerName: null, status: "unknown", ageing: "60+" }),
  ];
  const ids = (r: InvoiceRow[]) => r.map((x) => x.id);

  it("searches invoice number, id and customer name, case-insensitively", () => {
    expect(ids(filterRows(rows, P({ q: "inv-1001" })))).toEqual(["INV-001"]);
    expect(ids(filterRows(rows, P({ q: "bharat" })))).toEqual(["INV-002"]);
    expect(ids(filterRows(rows, P({ q: "INV-003" })))).toEqual(["INV-003"]);
  });
  it("filters by status, ageing and customer, combined with AND", () => {
    expect(ids(filterRows(rows, P({ status: "paid" })))).toEqual(["INV-002"]);
    expect(ids(filterRows(rows, P({ ageing: "60+" })))).toEqual(["INV-003"]);
    expect(ids(filterRows(rows, P({ customer: "C-001" })))).toEqual(["INV-001"]);
    expect(ids(filterRows(rows, P({ customer: "C-001", status: "paid" })))).toEqual([]);
  });
});

describe("sortRows", () => {
  const rows = [
    row({ id: "INV-001", dueDate: "2026-10-05", amount: paise(300), daysOverdue: 25 }),
    row({ id: "INV-002", number: null, dueDate: null, amount: paise(100), daysOverdue: null }),
    row({ id: "INV-003", dueDate: "2026-09-01", amount: paise(200), daysOverdue: 59 }),
    row({ id: "INV-004", dueDate: "2026-08-01", amount: paise(200), daysOverdue: 90, closed: true }),
  ];
  const ids = (key: "number" | "due" | "amount" | "overdue", desc: boolean) => sortRows(rows, { key, desc }).map((r) => r.id);

  it("puts unknowns last in both directions", () => {
    expect(ids("due", false)).toEqual(["INV-004", "INV-003", "INV-001", "INV-002"]);
    expect(ids("due", true)).toEqual(["INV-001", "INV-003", "INV-004", "INV-002"]);
    expect(ids("number", false)).toEqual(["INV-001", "INV-003", "INV-004", "INV-002"]);
    expect(ids("number", true).at(-1)).toBe("INV-002");
  });
  it("treats a closed invoice's days overdue as unknown", () => {
    expect(ids("overdue", true)).toEqual(["INV-003", "INV-001", "INV-002", "INV-004"]);
    expect(ids("overdue", false)).toEqual(["INV-001", "INV-003", "INV-002", "INV-004"]);
  });
  it("breaks ties by invoice id", () => {
    expect(ids("amount", true)).toEqual(["INV-001", "INV-003", "INV-004", "INV-002"]);
  });
});

describe("kpis", () => {
  it("sums only real figures; closed invoices are counted, not owed", () => {
    const k = kpis([
      row({ id: "A", outstanding: paise(100), daysOverdue: 10 }),
      row({ id: "B", outstanding: paise(50), daysOverdue: -5 }),
      row({ id: "C", outstanding: paise(30), daysOverdue: null, disputeIds: ["D-1"] }),
      row({ id: "D", outstanding: paise(0), closed: true, status: "paid", daysOverdue: 80 }),
      row({ id: "E", outstanding: paise(5), closed: true, status: "written_off", daysOverdue: 80, disputeIds: ["D-2"] }),
    ]);
    expect(k).toEqual({
      total: 5,
      outstanding: 180 as Paise,
      openCount: 3,
      overdueCount: 1,
      overdueAmount: 100 as Paise,
      disputedCount: 2,
      disputedAmount: 30 as Paise,
      closedCount: 2,
    });
  });
});

describe("pagination", () => {
  it("clamps and gives the showing range", () => {
    expect(pageInfo(0, 3)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0, total: 0 });
    expect(pageInfo(50, 2)).toEqual({ page: 2, pageCount: 2, start: 26, end: 50, total: 50 });
    expect(pageInfo(51, 9)).toEqual({ page: 3, pageCount: 3, start: 51, end: 51, total: 51 });
  });
  it("windows long page lists", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, "…", 10]);
  });
});
