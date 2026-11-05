/**
 * TASK-19.1 gates: TC-057 (unit half) — a bad file is rejected whole with a
 * row / field / reason list; TC-059 — `parseImport(toCsv(rows))` round-trips
 * and amounts stay integer paise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseImport, toCsv } from "./csv";

const FIXTURES = join(process.cwd(), "tests/e2e/fixtures");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const seed = (name: string) => readFileSync(join(process.cwd(), "public/seed", name), "utf8");

describe("parseImport — TC-057 bad file", () => {
  const result = parseImport("invoices", fixture("bad-invoices.csv"));

  it("rejects the whole file", () => {
    expect(result.ok).toBe(false);
  });

  it("lists the missing header, the bad date on row 3 and the negative amount on row 7", () => {
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: null, field: "currency" }),
        expect.objectContaining({ row: 3, field: "invoice_date" }),
        expect.objectContaining({ row: 7, field: "amount_paise" }),
      ]),
    );
    for (const e of result.error) expect(e.reason).toMatch(/\S/);
    // Only those three problems — nothing invented for the missing column's cells.
    expect(result.error).toHaveLength(3);
  });

  it("rejects a file with no data rows", () => {
    const r = parseImport("payments", "payment_id,invoice_id,paid_on,amount_paise\n");
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate ids and non-integer amounts", () => {
    const r = parseImport(
      "payments",
      "payment_id,invoice_id,paid_on,amount_paise\nP-1,INV-001,2026-10-01,100\nP-1,INV-002,2026-10-02,12.5\n",
    );
    if (r.ok) throw new Error("expected rejection");
    expect(r.error).toHaveLength(2);
    expect(r.error).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "payment_id" }),
        expect.objectContaining({ row: 2, field: "amount_paise" }),
      ]),
    );
  });

  it("rejects a repeated invoice_number (it is unique in the store)", () => {
    const header =
      "row_id,invoice_id,invoice_number,customer_id,invoice_date,due_date,amount_paise,currency,status_raw,billing_period,po_number";
    const r = parseImport(
      "invoices",
      `${header}\n1,INV-1,1001,C-1,2026-01-01,2026-02-01,100,INR,open,,\n2,INV-2,1001,C-1,2026-01-01,2026-02-01,100,INR,open,,\n`,
    );
    if (r.ok) throw new Error("expected rejection");
    expect(r.error).toEqual([expect.objectContaining({ row: 2, field: "invoice_number" })]);
  });

  it("rejects an impossible calendar date", () => {
    const r = parseImport(
      "payments",
      "payment_id,invoice_id,paid_on,amount_paise\nP-1,INV-001,2026-02-30,100\n",
    );
    if (r.ok) throw new Error("expected rejection");
    expect(r.error).toEqual([expect.objectContaining({ row: 1, field: "paid_on" })]);
  });
});

describe("parseImport — accepts good files", () => {
  it("parses the good fixture into typed invoices", () => {
    const r = parseImport("invoices", fixture("good-invoices.csv"));
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.kind).toBe("invoices");
    expect(r.value.rows).toHaveLength(6);
    expect(r.value.rows[0]).toMatchObject({
      invoice_id: "INV-901",
      invoice_number: "INV-9001",
      amount_paise: 12500000,
      status: "open",
    });
  });

  it.each(["invoices", "customers", "payments"] as const)("accepts the shipped seed %s.csv", (kind) => {
    const r = parseImport(kind, seed(`${kind}.csv`));
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.rows.length).toBeGreaterThan(0);
  });

  it("raises the same data issues ingest does (FS1/FS2 stay explicit)", () => {
    const r = parseImport("invoices", seed("invoices.csv"));
    if (!r.ok) throw new Error("expected acceptance");
    expect(r.value.dataIssues.length).toBeGreaterThan(0);
  });
});

describe("toCsv / parseImport — TC-059 round-trip", () => {
  it.each(["invoices", "customers", "payments"] as const)("%s round-trip", (kind) => {
    const first = parseImport(kind, seed(`${kind}.csv`));
    if (!first.ok) throw new Error("seed should parse");
    const again = parseImport(kind, toCsv(kind, first.value.rows));
    if (!again.ok) throw new Error(JSON.stringify(again.error));
    expect(again.value.rows).toEqual(first.value.rows);
    for (const row of again.value.rows) {
      if ("amount_paise" in row) expect(Number.isInteger(row.amount_paise)).toBe(true);
    }
  });

  // M2 / EXE123: unapplied cash (`invoice_id: null`) exports as a blank cell
  // and re-imports as null — never dropped, never "".
  it("round-trips an unapplied payment (null invoice_id) symmetrically", () => {
    const rows = [
      { payment_id: "P-900", invoice_id: "INV-001", paid_on: "2026-10-01", amount_paise: 100 },
      { payment_id: "P-901", invoice_id: null, paid_on: "2026-10-02", amount_paise: 2_500_000 },
    ];
    const csv = toCsv("payments", rows);
    expect(csv.split(/\r?\n/)[2]).toBe("P-901,,2026-10-02,2500000");
    const back = parseImport("payments", csv);
    if (!back.ok) throw new Error(JSON.stringify(back.error));
    expect(back.value.rows).toEqual(rows);
    expect(back.value.dataIssues).toEqual([]);
  });

  it("exports workflow tables with a header row and escaped cells", () => {
    const csv = toCsv("audit", [
      { event_id: 1, action: "add_note", subject: "invoice:INV-001", summary: 'Note: "hi", there' },
    ]);
    const [header, line] = csv.split(/\r?\n/);
    expect(header).toContain("event_id");
    expect(line).toContain('"Note: ""hi"", there"');
  });
});
