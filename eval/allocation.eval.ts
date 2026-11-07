/**
 * TC-75.40 (TKT-75.08): the "allocation-recommendation accuracy" eval gate.
 *
 * Every labelled bank line runs through the app's own pure pipeline —
 * `paymentExceptionsFor` → Recommend → Policy — and is scored against its
 * hand label (`eval/allocation.ts`). Positive = Policy says `auto_permitted`.
 *   unambiguous correct  = 100%: each unambiguous line gets the right outcome
 *   ambiguous escalated  = 100%: no ambiguous line is ever auto-picked
 * The seed set is the committed `public/seed` (P-012 and FS14–FS17); the
 * held-out set is built inline so it never shares a fixture with the seed.
 * Kept separate from `run.ts`/`report.json` so the v1 report schema is unchanged.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { describe, expect, test } from "vitest";
import { ingest, type Row } from "@/domain/ingest";
import {
  ALLOCATION_THRESHOLDS,
  HELDOUT_ALLOCATION_CASES,
  SEED_ALLOCATION_LABELS,
  scoreAllocation,
  type AllocationCase,
  type AllocationScore,
} from "./allocation";

const dir = join(process.cwd(), "public", "seed");
const csv = (name: string) =>
  Papa.parse<Row>(readFileSync(join(dir, name), "utf-8"), { header: true, skipEmptyLines: true }).data;
const seed = ingest({
  invoices: csv("invoices.csv"),
  customers: csv("customers.csv"),
  payments: csv("payments.csv"),
  emails: [],
});
const seedCases: AllocationCase[] = SEED_ALLOCATION_LABELS.map((label) => ({
  ...label,
  invoices: seed.invoices,
  payments: seed.payments,
  customers: seed.customers,
}));

function gate(set: string, cases: AllocationCase[]): void {
  describe(`${set} allocation-recommendation accuracy (TC-75.40)`, () => {
    let score: AllocationScore;
    test("scores every labelled bank line", () => {
      score = scoreAllocation(cases);
      const { tp, fp, tn, fn } = score.confusion;
      console.info(
        `allocation ${set}: unambiguous correct ${score.unambiguous_correct.passed}/${score.unambiguous_correct.total}` +
          `, ambiguous escalated ${score.ambiguous_escalated.passed}/${score.ambiguous_escalated.total}` +
          ` — TP ${tp} FP ${fp} TN ${tn} FN ${fn}`,
      );
      expect(score.cases).toHaveLength(cases.length);
      expect(tp + fp + tn + fn).toBe(cases.length);
    });
    test(`unambiguous correct ≥ ${ALLOCATION_THRESHOLDS.unambiguous_correct * 100}%`, () => {
      expect(score.unambiguous_correct.total).toBeGreaterThan(0);
      expect(score.unambiguous_correct.rate, `failing: ${score.unambiguous_correct.failures.join(", ")}`).toBeGreaterThanOrEqual(
        ALLOCATION_THRESHOLDS.unambiguous_correct,
      );
    });
    test(`ambiguous escalated, never auto-picked ≥ ${ALLOCATION_THRESHOLDS.ambiguous_escalated * 100}%`, () => {
      expect(score.ambiguous_escalated.total).toBeGreaterThan(0);
      expect(score.ambiguous_escalated.rate, `failing: ${score.ambiguous_escalated.failures.join(", ")}`).toBeGreaterThanOrEqual(
        ALLOCATION_THRESHOLDS.ambiguous_escalated,
      );
      expect(score.confusion.fp).toBe(0);
    });
  });
}

gate("seed", seedCases);
gate("held-out", HELDOUT_ALLOCATION_CASES);

describe("allocation scorer self-check (TC-75.40)", () => {
  test("an auto-pick of an ambiguous line is counted as a false positive and fails the gate", () => {
    // A mislabelled case (an FS14 tie labelled as auto) proves the scorer can
    // fail: Policy escalates it, so the unambiguous gate misses with an FN.
    const tie = HELDOUT_ALLOCATION_CASES.find((c) => c.id === "H-TIE-2")!;
    const score = scoreAllocation([{ ...tie, ambiguous: false, expected: { verdict: "auto_permitted", invoice_id: "INV-201" } }]);
    expect(score.confusion.fn).toBe(1);
    expect(score.unambiguous_correct.rate).toBe(0);
  });
});
