/**
 * TC-011 + TC-012 for `scripts/seed.ts`. TC-012: the generator is deterministic. Two fresh runs, written into
 * scratch dirs on the E Drive, are byte-identical to each other and to the
 * committed `public/seed/` files.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { afterAll, describe, expect, it } from "vitest";
import { ingest, type Row } from "../src/domain/ingest";
import { INVOICES, THREADS, writeSeed, type SeedFiles } from "./seed";

const SCRATCH_ROOT = "/Volumes/E Drive/Dev/.scratch";
const FILES: (keyof SeedFiles)[] = [
  "manifest.json",
  "customers.csv",
  "invoices.csv",
  "payments.csv",
  "emails.json",
];

const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe("seed — TC-012 determinism", () => {
  it("two runs and the committed public/seed are byte-identical", () => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const a = mkdtempSync(join(SCRATCH_ROOT, "verilane-seed-a-"));
    const b = mkdtempSync(join(SCRATCH_ROOT, "verilane-seed-b-"));
    created.push(a, b);

    writeSeed(a);
    writeSeed(b);

    const committed = join(process.cwd(), "public", "seed");
    for (const name of FILES) {
      const fromA = readFileSync(join(a, name));
      const fromB = readFileSync(join(b, name));
      const fromCommitted = readFileSync(join(committed, name));
      expect(fromA.equals(fromB), `${name}: run a vs run b`).toBe(true);
      expect(fromA.equals(fromCommitted), `${name}: run vs committed public/seed`).toBe(true);
    }
  });
});

// TC-011: the committed seed carries every scenario the spec table promises.
describe("seed — TC-011 coverage", () => {
  const dir = join(process.cwd(), "public", "seed");
  const csv = (name: string) =>
    Papa.parse<Row>(readFileSync(join(dir, name), "utf-8"), { header: true, skipEmptyLines: true })
      .data;
  const emails = JSON.parse(readFileSync(join(dir, "emails.json"), "utf-8")) as {
    thread_id: string;
  }[];
  const result = ingest({
    invoices: csv("invoices.csv"),
    customers: csv("customers.csv"),
    payments: csv("payments.csv"),
    emails,
  });

  it("has 50 invoices, 10 customers and 25 email threads", () => {
    expect(result.invoices).toHaveLength(50);
    expect(result.customers).toHaveLength(10);
    expect(new Set(emails.map((e) => e.thread_id)).size).toBe(25);
    expect(THREADS).toHaveLength(25);
  });

  it("keeps the worked examples A–E by invoice_id", () => {
    const ids = new Set(result.invoices.map((i) => i.invoice_id));
    for (const id of ["INV-A", "INV-B", "INV-C", "INV-D", "INV-E"]) expect(ids).toContain(id);
  });

  it("has at least 5 commitment, confirmation, dispute and duplicate threads, and all 7 classes", () => {
    const byClass = new Map<string, number>();
    for (const t of THREADS) byClass.set(t.email_class, (byClass.get(t.email_class) ?? 0) + 1);
    for (const cls of ["commitment", "confirmation", "dispute", "duplicate"]) {
      expect(byClass.get(cls) ?? 0, cls).toBeGreaterThanOrEqual(5);
    }
    expect([...byClass.keys()].sort()).toEqual([
      "commitment",
      "confirmation",
      "delay",
      "dispute",
      "duplicate",
      "enquiry",
      "unknown",
    ]);
  });

  it("has at least 5 duplicate invoice pairs with the same customer, amount and PO", () => {
    const byRow = new Map(result.invoices.map((i) => [i.row_id, i]));
    const pairs = INVOICES.filter((s) => s.duplicate_of !== undefined);
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    for (const spec of pairs) {
      const copy = byRow.get(spec.row_id);
      const original = byRow.get(spec.duplicate_of ?? -1);
      expect(copy).toBeDefined();
      expect(original).toBeDefined();
      expect(copy?.customer_id).toBe(original?.customer_id);
      expect(copy?.amount_paise).toBe(original?.amount_paise);
      expect(copy?.po_number).toBe(original?.po_number);
      expect(copy?.invoice_number).not.toBe(original?.invoice_number);
    }
  });

  it("has at least 5 invoices with missing data (DataIssue kind 'missing')", () => {
    const missing = new Set(
      result.dataIssues.filter((d) => d.kind === "missing").map((d) => d.record_id),
    );
    expect(missing.size).toBeGreaterThanOrEqual(5);
  });

  it("covers every FS1–FS10 edge case, with FS1/FS2/FS8/FS10 backed by DataIssues", () => {
    const tagged = new Set<string>([
      ...INVOICES.flatMap((s) => s.edge_cases ?? []),
      ...THREADS.flatMap((t) => t.edge_cases),
    ]);
    for (let n = 1; n <= 10; n++) expect(tagged, `FS${n}`).toContain(`FS${n}`);

    const has = (field: string, kind: string) =>
      result.dataIssues.some((d) => d.field === field && d.kind === kind);
    expect(has("invoice_number", "missing")).toBe(true); // FS1
    expect(has("due_date", "missing")).toBe(true); // FS2
    expect(has("outstanding_amount", "conflict")).toBe(true); // FS8
    expect(has("status_raw", "unparseable")).toBe(true); // FS10
    // The seed itself never repeats an invoice_number (TC-013's guard is a backstop).
    expect(has("invoice_number", "conflict")).toBe(false);
  });
});
