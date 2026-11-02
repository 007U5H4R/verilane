import { describe, expect, it } from "vitest";
import { paise } from "../money";
import {
  AMOUNT_BUCKETS,
  csvCell,
  filterCases,
  filterLedger,
  inBucket,
  ledgerTotals,
  paginate,
  showingText,
  sortCases,
  sortLedger,
  toCsv,
  type CaseRow,
  type LedgerListRow,
} from "./listing";

const row = (id: string, sent: string, amount: number | undefined, discrepancy: number | undefined, extra: Partial<CaseRow> = {}): CaseRow => ({
  id,
  sentAt: sent,
  amount: amount === undefined ? undefined : paise(amount),
  discrepancy: discrepancy === undefined ? undefined : paise(discrepancy),
  customerId: "C-1",
  haystack: [id, "ap@x.test", "INV-1001", "Acme Co"],
  ...extra,
});

const ROWS: CaseRow[] = [
  row("E-1", "2026-10-20T00:00:00Z", 4_999_999, 0),
  row("E-2", "2026-10-22T00:00:00Z", 5_000_000, 100, { customerId: "C-2", haystack: ["E-2", "treasury@ganga.test", "INV-1042", "Ganga Steel"] }),
  row("E-3", "2026-10-24T00:00:00Z", 10_000_000, 4_000_000),
  row("E-4", "2026-10-26T00:00:00Z", 50_000_000, undefined),
  row("E-5", "2026-10-28T00:00:00Z", 50_000_001, 5),
  row("E-6", "2026-10-29T00:00:00Z", undefined, undefined),
];

describe("amount buckets", () => {
  it("has the five buckets in order", () => {
    expect(AMOUNT_BUCKETS.map((b) => b.label)).toEqual([
      "All amounts",
      "< ₹50,000",
      "₹50,000 – ₹1,00,000",
      "₹1,00,000 – ₹5,00,000",
      "> ₹5,00,000",
    ]);
  });
  it("edges fall in exactly one bucket; an unknown amount only under All", () => {
    const counts = AMOUNT_BUCKETS.map((b) => ROWS.filter((r) => inBucket(r.amount, b.id)).map((r) => r.id));
    expect(counts).toEqual([
      ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6"],
      ["E-1"],
      ["E-2", "E-3"],
      ["E-4"],
      ["E-5"],
    ]);
  });
});

describe("filterCases", () => {
  it("searches email, invoice and customer, case-insensitively", () => {
    expect(filterCases(ROWS, { q: "GANGA" }).map((r) => r.id)).toEqual(["E-2"]);
    expect(filterCases(ROWS, { q: "inv-1042" }).map((r) => r.id)).toEqual(["E-2"]);
    expect(filterCases(ROWS, { q: "  " })).toHaveLength(6);
  });
  it("filters by customer and bucket together", () => {
    expect(filterCases(ROWS, { customerId: "C-1", bucket: "lt50k" }).map((r) => r.id)).toEqual(["E-1"]);
    expect(filterCases(ROWS, { customerId: "C-2", bucket: "lt50k" })).toEqual([]);
  });
});

describe("sortCases", () => {
  const ids = (s: Parameters<typeof sortCases>[1]) => sortCases(ROWS, s).map((r) => r.id);
  it("latest / oldest by email time", () => {
    expect(ids("latest")).toEqual(["E-6", "E-5", "E-4", "E-3", "E-2", "E-1"]);
    expect(ids("oldest")).toEqual(["E-1", "E-2", "E-3", "E-4", "E-5", "E-6"]);
  });
  it("amount and discrepancy sorts put unknowns last", () => {
    expect(ids("amount_desc")).toEqual(["E-5", "E-4", "E-3", "E-2", "E-1", "E-6"]);
    expect(ids("amount_asc")).toEqual(["E-1", "E-2", "E-3", "E-4", "E-5", "E-6"]);
    expect(ids("discrepancy")).toEqual(["E-3", "E-2", "E-5", "E-1", "E-4", "E-6"]);
  });
  it("does not mutate its input", () => {
    const copy = [...ROWS];
    sortCases(ROWS, "latest");
    expect(ROWS).toEqual(copy);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  it("returns the page and its 1-based bounds", () => {
    expect(paginate(items, 1, 4)).toEqual({ items: [0, 1, 2, 3], from: 1, to: 4, total: 10, page: 1, pages: 3 });
    expect(paginate(items, 3, 4)).toEqual({ items: [8, 9], from: 9, to: 10, total: 10, page: 3, pages: 3 });
  });
  it("clamps an out-of-range page and handles empty", () => {
    expect(paginate(items, 99, 4).page).toBe(3);
    expect(paginate(items, 0, 4).page).toBe(1);
    expect(paginate([], 1, 4)).toEqual({ items: [], from: 0, to: 0, total: 0, page: 1, pages: 1 });
  });
  it("showingText", () => {
    expect(showingText(paginate(items, 1, 4))).toBe("Showing 1–4 of 10");
    expect(showingText(paginate([], 1, 4))).toBe("Showing 0 of 0");
  });
});

const L = (id: string, paid: string, amount: number, customerId: string, status: LedgerListRow["status"], hay: string[] = []): LedgerListRow => ({
  id,
  paidOn: paid,
  amount: paise(amount),
  customerId,
  status,
  haystack: [id, ...hay],
});
const LEDGER = [
  L("P-1", "2026-10-01", 100, "C-1", "recorded", ["INV-1001", "Acme"]),
  L("P-2", "2026-10-03", 300, "C-2", "verified", ["INV-1002", "Ganga"]),
  L("P-3", "2026-10-02", 200, "C-1", "candidate", ["INV-1003", "Acme"]),
];

describe("ledger listing", () => {
  it("filters by text, customer and status", () => {
    expect(filterLedger(LEDGER, { q: "acme" }).map((r) => r.id)).toEqual(["P-1", "P-3"]);
    expect(filterLedger(LEDGER, { customerId: "C-1", status: "candidate" }).map((r) => r.id)).toEqual(["P-3"]);
  });
  it("sorts by date and amount", () => {
    expect(sortLedger(LEDGER, "latest").map((r) => r.id)).toEqual(["P-2", "P-3", "P-1"]);
    expect(sortLedger(LEDGER, "oldest").map((r) => r.id)).toEqual(["P-1", "P-3", "P-2"]);
    expect(sortLedger(LEDGER, "amount_asc").map((r) => r.id)).toEqual(["P-1", "P-3", "P-2"]);
    expect(sortLedger(LEDGER, "amount_desc").map((r) => r.id)).toEqual(["P-2", "P-3", "P-1"]);
  });
  it("displayed total and full total are separate and never double count", () => {
    const shown = filterLedger(LEDGER, { customerId: "C-1" });
    expect(ledgerTotals(shown, [...LEDGER, LEDGER[0]!])).toEqual({ displayed: 300, displayedCount: 2, full: 600, fullCount: 3 });
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
  });
  it("toCsv joins header and rows with CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "x,y"]])).toBe('A,B\r\n1,"x,y"\r\n');
  });
});
