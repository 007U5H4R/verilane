import { describe, expect, it } from "vitest";
import type { Customer, Invoice, Priority } from "@/domain/schema";
import { DEFAULT_FILTERS } from "./queueParams";
import { filterRows, sortRows, type QueueRow } from "./useQueueTable";
import { paise } from "@/domain/money";

function row(
  rank: number,
  over: { name: string; number: string; band: Priority["band"]; status: Invoice["status"]; days: number | null; cust: string },
): QueueRow {
  return {
    invoice: { invoice_id: `I${rank}`, invoice_number: over.number, customer_id: over.cust, status: over.status } as Invoice,
    priority: { invoice_id: `I${rank}`, band: over.band, days_overdue: over.days } as Priority,
    customer: { customer_id: over.cust, name: over.name } as Customer,
    customerName: over.name,
    outstanding: paise(100 * rank),
    rank,
  };
}

const rows: QueueRow[] = [
  row(0, { name: "Aravalli Steel", number: "INV-1012", band: "high", status: "open", days: 47, cust: "C1" }),
  row(1, { name: "Konkan Agro", number: "INV-1025", band: "medium", status: "open", days: 20, cust: "C2" }),
  row(2, { name: "Konkan Agro", number: "INV-1030", band: "low", status: "partially_paid", days: 5, cust: "C2" }),
  row(3, { name: "Ganga Mills", number: "INV-1040", band: "not_due", status: "open", days: null, cust: "C3" }),
];

const ids = (rs: QueueRow[]) => rs.map((r) => r.invoice.invoice_id);

describe("filterRows (TASK-9.1)", () => {
  it("returns every row, in rank order, with no filters", () => {
    expect(ids(filterRows(rows, DEFAULT_FILTERS))).toEqual(["I0", "I1", "I2", "I3"]);
  });

  it("searches customer name and invoice number, case-insensitively", () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, q: "konkan" }))).toEqual(["I1", "I2"]);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, q: "inv-1040" }))).toEqual(["I3"]);
  });

  it("ANDs facets and ORs values within one facet", () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, band: ["high", "low"] }))).toEqual(["I0", "I2"]);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, customer: ["C2"], status: ["open"] }))).toEqual(["I1"]);
  });

  it("buckets ageing and leaves not-overdue rows out of any ageing filter", () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, ageing: ["1-15", "31-60"] }))).toEqual(["I0", "I2"]);
  });

  it("leaves closed (paid/written-off) rows out of any ageing filter, matching Home's ageing chart (T18-2)", () => {
    const withClosed = [
      ...rows,
      row(4, { name: "Ganga Mills", number: "INV-1050", band: "closed", status: "paid", days: 90, cust: "C3" }),
    ];
    expect(ids(filterRows(withClosed, { ...DEFAULT_FILTERS, ageing: ["60+"] }))).toEqual([]);
    expect(ids(filterRows(withClosed, DEFAULT_FILTERS))).toContain("I4");
  });
});

describe("sortRows (TASK-38, replaces TanStack's sorted row model)", () => {
  it("returns the input (rank) order with no sort", () => {
    expect(ids(sortRows(rows, null))).toEqual(["I0", "I1", "I2", "I3"]);
  });

  it("priority desc is rank order, asc reverses it", () => {
    expect(ids(sortRows(rows, { column: "priority", desc: true }))).toEqual(["I0", "I1", "I2", "I3"]);
    expect(ids(sortRows(rows, { column: "priority", desc: false }))).toEqual(["I3", "I2", "I1", "I0"]);
  });

  it("sorts numbers numerically and strings by locale", () => {
    expect(ids(sortRows(rows, { column: "outstanding", desc: true }))).toEqual(["I3", "I2", "I1", "I0"]);
    expect(ids(sortRows(rows, { column: "customer", desc: false }))).toEqual(["I0", "I3", "I1", "I2"]);
  });

  it("keeps rank order between ties in both directions", () => {
    // I1 and I2 share a customer name: rank order holds whichever way.
    expect(ids(sortRows(rows, { column: "customer", desc: true }))).toEqual(["I1", "I2", "I3", "I0"]);
  });

  it("puts unknown values last in both directions (unknown stays unknown)", () => {
    expect(ids(sortRows(rows, { column: "days_overdue", desc: true }))).toEqual(["I0", "I1", "I2", "I3"]);
    expect(ids(sortRows(rows, { column: "days_overdue", desc: false }))).toEqual(["I2", "I1", "I0", "I3"]);
    const dated: QueueRow[] = rows.map((r, i) => ({
      ...r,
      invoice: { ...r.invoice, due_date: i === 1 ? null : `2026-0${4 - i}-01` } as Invoice,
    }));
    expect(ids(sortRows(dated, { column: "due_date", desc: false }))).toEqual(["I3", "I2", "I0", "I1"]);
    expect(ids(sortRows(dated, { column: "due_date", desc: true }))).toEqual(["I0", "I2", "I3", "I1"]);
  });

  it("does not mutate its input", () => {
    const copy = [...rows];
    sortRows(rows, { column: "outstanding", desc: true });
    expect(rows).toEqual(copy);
  });
});
