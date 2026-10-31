/**
 * TC-019: the eval label set is well-formed and self-consistent.
 *
 * Every file parses against `eval/schema.ts`, every label points at a thread
 * that exists in its email set, every customer/invoice it names exists in the
 * matching ledger, every draft case targets a seed invoice, and the label
 * CHANGELOG exists. The labels were hand-authored from the scenario spec and
 * the thread text, never from Verilane's own output (AI-Evaluation.md §2).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  DraftCaseFile,
  ThreadLabelFile,
  type DraftCase,
  type ThreadLabel,
} from "./schema";

const ROOT = process.cwd();
const EVAL_DIR = join(ROOT, "eval");
const SEED_DIR = join(ROOT, "public", "seed");
const HELDOUT_DIR = join(EVAL_DIR, "heldout");

interface EmailRow {
  thread_id: string;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readCsv(path: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(path, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  expect(parsed.errors).toEqual([]);
  return parsed.data;
}

interface Corpus {
  name: string;
  labelsPath: string;
  emailsPath: string;
  invoicesPath: string;
  customersPath: string;
  expectedCount: number;
}

const CORPORA: Corpus[] = [
  {
    name: "seed",
    labelsPath: join(EVAL_DIR, "seed.labels.json"),
    emailsPath: join(SEED_DIR, "emails.json"),
    invoicesPath: join(SEED_DIR, "invoices.csv"),
    customersPath: join(SEED_DIR, "customers.csv"),
    expectedCount: 25,
  },
  {
    name: "held-out",
    labelsPath: join(HELDOUT_DIR, "labels.json"),
    emailsPath: join(HELDOUT_DIR, "emails.json"),
    invoicesPath: join(HELDOUT_DIR, "invoices.csv"),
    customersPath: join(HELDOUT_DIR, "customers.csv"),
    expectedCount: 30,
  },
];

describe("eval labels — TC-019", () => {
  for (const c of CORPORA) {
    describe(`${c.name} set`, () => {
      const load = (): {
        labels: ThreadLabel[];
        threadIds: Set<string>;
        invoices: Record<string, string>[];
        customerIds: Set<string>;
      } => {
        const labels = ThreadLabelFile.parse(readJson(c.labelsPath));
        const emails = readJson(c.emailsPath) as EmailRow[];
        const invoices = readCsv(c.invoicesPath);
        const customers = readCsv(c.customersPath);
        return {
          labels,
          threadIds: new Set(emails.map((e) => e.thread_id)),
          invoices,
          customerIds: new Set(customers.map((r) => r.customer_id ?? "")),
        };
      };

      it(`parses against the schema with exactly ${c.expectedCount} labels`, () => {
        const { labels } = load();
        expect(labels).toHaveLength(c.expectedCount);
      });

      it("labels one thread each, and every thread is labelled", () => {
        const { labels, threadIds } = load();
        const ids = labels.map((l) => l.thread_id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(threadIds.has(id), id).toBe(true);
        expect([...threadIds].sort()).toEqual([...ids].sort());
      });

      it("references only customers and invoices that exist in its ledger", () => {
        const { labels, invoices, customerIds } = load();
        const byId = new Map(invoices.map((r) => [r.invoice_id ?? "", r]));
        for (const l of labels) {
          if (l.customer_id !== null) {
            expect(customerIds.has(l.customer_id), `${l.thread_id} customer`).toBe(true);
          }
          for (const inv of l.invoice_ids) {
            const row = byId.get(inv);
            expect(row, `${l.thread_id} → ${inv}`).toBeDefined();
            // A matched invoice belongs to the sender. Ambiguous candidates may not (FS3 near-miss).
            if (l.match_outcome === "matched") {
              expect(row?.customer_id, `${l.thread_id} → ${inv} owner`).toBe(l.customer_id);
            }
          }
          if (l.invoice_id !== null) {
            expect(l.invoice_ids).toContain(l.invoice_id);
          }
        }
      });
    });
  }

  it("held-out invoices and customers do not collide with the seed", () => {
    const seedInv = new Set(readCsv(join(SEED_DIR, "invoices.csv")).map((r) => r.invoice_number));
    const seedCust = readCsv(join(SEED_DIR, "customers.csv"));
    const seedNames = new Set(seedCust.map((r) => r.name));
    const seedIds = new Set(seedCust.map((r) => r.customer_id));
    for (const r of readCsv(join(HELDOUT_DIR, "invoices.csv"))) {
      expect(seedInv.has(r.invoice_number), r.invoice_number).toBe(false);
    }
    for (const r of readCsv(join(HELDOUT_DIR, "customers.csv"))) {
      expect(seedNames.has(r.name), r.name).toBe(false);
      expect(seedIds.has(r.customer_id), r.customer_id).toBe(false);
    }
    const seedThreads = new Set(
      (readJson(join(SEED_DIR, "emails.json")) as EmailRow[]).map((e) => e.thread_id),
    );
    for (const e of readJson(join(HELDOUT_DIR, "emails.json")) as EmailRow[]) {
      expect(seedThreads.has(e.thread_id), e.thread_id).toBe(false);
    }
  });

  describe("draft cases", () => {
    const load = (): DraftCase[] => DraftCaseFile.parse(readJson(join(EVAL_DIR, "drafts.cases.json")));

    it("has at least 20 cases with unique ids", () => {
      const cases = load();
      expect(cases.length).toBeGreaterThanOrEqual(20);
      const ids = cases.map((d) => d.case_id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("targets only seed invoices", () => {
      const seedIds = new Set(readCsv(join(SEED_DIR, "invoices.csv")).map((r) => r.invoice_id));
      for (const d of load()) expect(seedIds.has(d.invoice_id), d.case_id).toBe(true);
    });

    it("covers the FS12 adversarial edits: amount change, added date, new ref, customer swap", () => {
      const tags = new Set(load().flatMap((d) => d.tags));
      for (const t of ["fs12-amount", "fs12-date", "fs12-ref", "fs12-customer"]) {
        expect(tags.has(t), t).toBe(true);
      }
      // Every FS12 adversarial edit must be blocked by the footnote check (#9).
      for (const d of load().filter((x) => x.tags.some((t) => t.startsWith("fs12-")))) {
        expect(d.edit, d.case_id).toBeDefined();
        expect(d.expected.approvable, d.case_id).toBe(false);
        expect(d.expected.must_fail, d.case_id).toContain(9);
      }
    });
  });

  it("CHANGELOG.md exists and has an initial entry", () => {
    const path = join(EVAL_DIR, "CHANGELOG.md");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/^## /m);
  });
});
