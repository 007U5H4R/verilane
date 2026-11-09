/**
 * TC-75.31 (TKT-75.05): the "short-payment-pattern detection recall" eval gate.
 *
 * Every labelled customer's ledger runs through the app's own pure pipeline —
 * `shortPaymentExceptionsFor` (FS18/FS19) — and is scored against its hand
 * label (`eval/shortPaymentPattern.ts`). Positive = a `short_payment_pattern`
 * row exists for that customer.
 *   pattern recall      = 100%: every customer that should get a pattern gets one, correctly linked
 *   pattern precision   = 100%: no pattern is raised when none is expected
 *   instance recall     = 100%: every short payment surfaces as its own exception instance (AC)
 * The seed set is the committed `public/seed` (C-001 patterned, C-002 not);
 * the held-out set is built inline so it never shares a fixture with the seed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { beforeAll, describe, expect, test } from "vitest";
import { ingest, type Row } from "@/domain/ingest";
import {
  HELDOUT_SHORT_PAYMENT_PATTERN_CASES,
  SHORT_PAYMENT_PATTERN_THRESHOLDS,
  scoreShortPaymentPattern,
  type ShortPaymentPatternCase,
  type ShortPaymentPatternScore,
} from "./shortPaymentPattern";

const dir = join(process.cwd(), "public", "seed");
const csv = (name: string) =>
  Papa.parse<Row>(readFileSync(join(dir, name), "utf-8"), { header: true, skipEmptyLines: true }).data;
const seed = ingest({
  invoices: csv("invoices.csv"),
  customers: csv("customers.csv"),
  payments: csv("payments.csv"),
  emails: [],
});

// C-001: INV-001/002/003 short by ₹1,000 each, 54 days apart (within 90) — patterned.
// C-002: INV-004/005 short by ₹500 each, only two — never a pattern.
const seedCases: ShortPaymentPatternCase[] = [
  {
    id: "S-C-001",
    customer_id: "C-001",
    expectPattern: true,
    expectedInstanceInvoiceIds: ["INV-001", "INV-002", "INV-003"],
    note: "seed: 3 short payments within 90 days (INV-002 has no stated reason)",
    invoices: seed.invoices,
    payments: seed.payments,
  },
  {
    id: "S-C-002",
    customer_id: "C-002",
    expectPattern: false,
    expectedInstanceInvoiceIds: ["INV-004", "INV-005"],
    note: "seed: only 2 short payments — below PATTERN_MIN, no pattern",
    invoices: seed.invoices,
    payments: seed.payments,
  },
];

function gate(set: string, cases: ShortPaymentPatternCase[]): void {
  describe(`${set} short-payment-pattern detection recall (TC-75.31)`, () => {
    let score: ShortPaymentPatternScore;
    // Scored once before any test, so each test can run (or be filtered) on its own (review m6).
    beforeAll(() => {
      score = scoreShortPaymentPattern(cases);
    });
    test("scores every labelled customer", () => {
      const { tp, fp, tn, fn } = score.confusion;
      console.info(
        `short-payment-pattern ${set}: pattern recall ${score.pattern_recall.passed}/${score.pattern_recall.total}` +
          `, pattern precision ${score.pattern_precision.passed}/${score.pattern_precision.total}` +
          `, instance recall ${score.instance_recall.passed}/${score.instance_recall.total}` +
          ` — TP ${tp} FP ${fp} TN ${tn} FN ${fn}`,
      );
      expect(score.cases).toHaveLength(cases.length);
      expect(tp + fp + tn + fn).toBe(cases.length);
    });
    test(`pattern recall ≥ ${SHORT_PAYMENT_PATTERN_THRESHOLDS.pattern_recall * 100}%`, () => {
      expect(score.pattern_recall.total).toBeGreaterThan(0);
      expect(score.pattern_recall.rate, `failing: ${score.pattern_recall.failures.join(", ")}`).toBeGreaterThanOrEqual(
        SHORT_PAYMENT_PATTERN_THRESHOLDS.pattern_recall,
      );
    });
    test(`pattern precision ≥ ${SHORT_PAYMENT_PATTERN_THRESHOLDS.pattern_precision * 100}%`, () => {
      expect(score.pattern_precision.total).toBeGreaterThan(0);
      expect(score.pattern_precision.rate, `failing: ${score.pattern_precision.failures.join(", ")}`).toBeGreaterThanOrEqual(
        SHORT_PAYMENT_PATTERN_THRESHOLDS.pattern_precision,
      );
      expect(score.confusion.fp).toBe(0);
    });
    test(`instance recall ≥ ${SHORT_PAYMENT_PATTERN_THRESHOLDS.instance_recall * 100}%`, () => {
      expect(score.instance_recall.total).toBeGreaterThan(0);
      expect(score.instance_recall.rate, `failing: ${score.instance_recall.failures.join(", ")}`).toBeGreaterThanOrEqual(
        SHORT_PAYMENT_PATTERN_THRESHOLDS.instance_recall,
      );
    });
  });
}

gate("seed", seedCases);
gate("held-out", HELDOUT_SHORT_PAYMENT_PATTERN_CASES);

describe("short-payment-pattern scorer self-check (TC-75.31)", () => {
  // Each check feeds the scorer a deliberately mislabelled case, proving the
  // gate can fail in both directions.
  test("a real pattern labelled as none is counted as a false positive and fails the precision gate", () => {
    const patterned = seedCases.find((c) => c.id === "S-C-001")!;
    const score = scoreShortPaymentPattern([{ ...patterned, expectPattern: false, expectedInstanceInvoiceIds: [] }]);
    expect(score.confusion.fp).toBe(1);
    expect(score.pattern_recall.total).toBe(0); // no case expects a pattern, so recall has nothing to score...
    expect(score.pattern_precision.rate).toBe(0); // ...but precision catches the spurious raise.
  });

  test("a customer mislabelled as expecting a pattern it never gets is counted as a false negative and fails the recall gate", () => {
    const standalone = seedCases.find((c) => c.id === "S-C-002")!;
    const score = scoreShortPaymentPattern([{ ...standalone, expectPattern: true }]);
    expect(score.confusion.fn).toBe(1);
    expect(score.pattern_recall.rate).toBe(0);
  });
});
