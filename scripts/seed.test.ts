/**
 * TC-011 + TC-012 for `scripts/seed.ts`. TC-012: the generator is deterministic. Two fresh runs, written into
 * scratch dirs on the E Drive, are byte-identical to each other and to the
 * committed `public/seed/` files.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Papa from "papaparse";
import { afterAll, describe, expect, it } from "vitest";
import { ingest, type Row } from "../src/domain/ingest";
import { isUnapplied, outstandingOf } from "../src/domain/priority";
import { generateSeed, INVOICES, PAYMENT_FIXTURES, SEED_VERSION, THREADS, writeSeed, type SeedFiles } from "./seed";

const SCRATCH_ROOT = "/Volumes/E Drive/Dev/.scratch";
function scratchRoot(): string {
  try {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    return SCRATCH_ROOT;
  } catch {
    return tmpdir(); // not on the dev machine (e.g. CI) — use the OS temp dir
  }
}
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

/**
 * The service worker caches `/seed/*` cache-first under `verilane-<seedVersion>`,
 * and `adoptManifest` refetches only when that cache name changes (EXE161). A
 * seed content change without a SEED_VERSION bump would never reach a browser
 * that already has the old seed. Each version pins the sha256 of its data
 * files; changing the content means bumping SEED_VERSION and adding a pin.
 */
const SEED_CONTENT_PINS: Record<string, string> = {
  "2026-10-30.1": "8e827f2b9caeccd5a869a4d9a8d24245464a61a4ec0231563fdf1782d9e2bd76",
  "2026-11-07.1": "c77264d71341227f7e178f51334d4919b78b4c80b6fc3cc59770dfa277212e52", // FS14–FS17 (TKT-75.08)
  "2026-11-07.2": "0f6f653eb054b06fed1baa391f122a1b96b1959ff52ebdfd3f2614d0f8b04475", // FS18–FS19 short payments (TKT-75.05)
};

function seedContentHash(files: SeedFiles): string {
  const h = createHash("sha256");
  for (const name of ["customers.csv", "invoices.csv", "payments.csv", "emails.json"] as const) {
    h.update(`${name}\n`).update(files[name]).update("\n");
  }
  return h.digest("hex");
}

describe("seed — content changes require a SEED_VERSION bump (EXE161)", () => {
  it("the generated data files match the content pinned for the current SEED_VERSION", () => {
    expect(SEED_CONTENT_PINS[SEED_VERSION], `no content pin for SEED_VERSION ${SEED_VERSION}`).toBeDefined();
    expect(seedContentHash(generateSeed())).toBe(SEED_CONTENT_PINS[SEED_VERSION]);
  });
});

describe("seed — TC-012 determinism", () => {
  it("two runs and the committed public/seed are byte-identical", () => {
    const base = scratchRoot();
    const a = mkdtempSync(join(base, "verilane-seed-a-"));
    const b = mkdtempSync(join(base, "verilane-seed-b-"));
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

  // TC-75.06 (TKT-75.02): an unapplied bank line whose remittance amount
  // matches exactly one open invoice's outstanding — the tracer's scenario.
  it("has an unapplied bank line matching exactly one open invoice (TC-75.06)", () => {
    expect(result.dataIssues.filter((d) => d.record_id.startsWith("P-"))).toEqual([]);
    const unapplied = result.payments.filter(isUnapplied);
    expect(unapplied.length).toBeGreaterThanOrEqual(1);
    const ctx = { payments: result.payments };
    const open = result.invoices.filter(
      (i) => i.status !== "paid" && i.status !== "written_off" && outstandingOf(i, ctx) > 0,
    );
    const exact = unapplied.filter(
      (p) => open.filter((i) => outstandingOf(i, ctx) === p.amount_paise).length === 1,
    );
    expect(exact.length, "unapplied payments with exactly one candidate").toBeGreaterThanOrEqual(1);
  });

  // TKT-75.08 (R9, third scenario): the seed carries the bank lines the
  // recommender must never guess on — ambiguous, overpaid, a mistyped
  // reference and untraceable cash — and the coverage test fails without them.
  describe("TKT-75.08 allocation edge cases (FS14–FS17, R9 third scenario)", () => {
    const ctx = { payments: result.payments };
    const open = result.invoices.filter(
      (i) => i.status !== "paid" && i.status !== "written_off" && outstandingOf(i, ctx) > 0,
    );
    const unapplied = result.payments.filter(isUnapplied);
    const fixture = (fs: string) => {
      const ids = PAYMENT_FIXTURES.filter((f) => f.edge_cases.includes(fs as never)).map((f) => f.payment_id);
      return unapplied.filter((p) => ids.includes(p.payment_id));
    };

    it("tags every FS14–FS17 case on an unapplied bank line", () => {
      for (let n = 14; n <= 17; n++) expect(fixture(`FS${n}`).length, `FS${n}`).toBeGreaterThanOrEqual(1);
    });

    it("FS14: an unapplied bank line fits two or more open invoices equally (ambiguous)", () => {
      const ambiguous = fixture("FS14").filter(
        (p) => open.filter((i) => outstandingOf(i, ctx) === p.amount_paise).length >= 2,
      );
      expect(ambiguous.length).toBeGreaterThanOrEqual(1);
    });

    it("FS15: a bank line from a named payer exceeds that customer's open balance (overpayment)", () => {
      const over = fixture("FS15").filter((p) => {
        const balance = open
          .filter((i) => i.customer_id === p.payer_customer_id)
          .reduce((sum, i) => sum + outstandingOf(i, ctx), 0);
        return balance > 0 && p.amount_paise > balance;
      });
      expect(over.length).toBeGreaterThanOrEqual(1);
    });

    it("FS16: a bank line cites a reference that is no invoice_number on the ledger", () => {
      const numbers = new Set(result.invoices.map((i) => i.invoice_number));
      const unknown = fixture("FS16").filter(
        (p) => p.remittance_reference !== undefined && !numbers.has(p.remittance_reference),
      );
      expect(unknown.length).toBeGreaterThanOrEqual(1);
    });

    it("FS17: a bank line names no payer, cites nothing and matches no open invoice", () => {
      const untraceable = fixture("FS17").filter(
        (p) =>
          p.payer_customer_id === undefined &&
          p.remittance_reference === undefined &&
          !open.some((i) => outstandingOf(i, ctx) === p.amount_paise),
      );
      expect(untraceable.length).toBeGreaterThanOrEqual(1);
    });
  });

  // TKT-75.05 (FS18/FS19, TC-75.26): a customer whose paid invoices were each
  // settled short. A short payment is a paid invoice whose applied payments
  // fall below its amount; the gap is the deduction.
  describe("TKT-75.05 short payments (FS18, FS19)", () => {
    const shorts = result.invoices.flatMap((inv) => {
      if (inv.status !== "paid") return [];
      const applied = result.payments.filter((p) => p.invoice_id === inv.invoice_id);
      const paid = applied.reduce((sum, p) => sum + p.amount_paise, 0);
      if (applied.length === 0 || paid >= inv.amount_paise) return [];
      const last = applied.map((p) => p.paid_on).sort().at(-1) as string;
      return [{ customer_id: inv.customer_id, paid_on: last, reason: applied.find((p) => p.deduction_reason)?.deduction_reason }];
    });
    const byCustomer = new Map<string, typeof shorts>();
    for (const s of shorts) byCustomer.set(s.customer_id, [...(byCustomer.get(s.customer_id) ?? []), s]);
    const within90 = (list: typeof shorts) => {
      const days = list.map((s) => Date.parse(s.paid_on)).sort((a, b) => a - b);
      return days.some((d, i) => i + 2 < days.length && (days[i + 2] as number) - d <= 90 * 86_400_000);
    };

    it("FS19: one customer has 3 or more short payments within 90 days", () => {
      const patterned = [...byCustomer.values()].filter(within90);
      expect(patterned).toHaveLength(1);
    });

    it("FS18: one of that customer's short payments states no reason", () => {
      const patterned = [...byCustomer.values()].filter(within90);
      expect(patterned[0]?.some((s) => s.reason === undefined)).toBe(true);
      expect(patterned[0]?.some((s) => s.reason !== undefined)).toBe(true);
    });

    it("has a customer with short payments that do not form a pattern (a negative case)", () => {
      expect([...byCustomer.values()].some((list) => list.length > 0 && !within90(list))).toBe(true);
    });
  });
});
