/**
 * TC-054: Home aggregates equal hand-computed values on a small fixture,
 * and ageing buckets sum to the total overdue outstanding.
 */
import { describe, expect, it } from "vitest";
import {
  ageingBuckets,
  ageingBucketOf,
  ageingBucketOfPriority,
  kpis,
  priorityMix,
  type HomeAggregateInput,
} from "./aggregates";
import type { Invoice, Payment, Priority, PriorityBand } from "./schema";
import { paise } from "./money";

function invoice(id: string, amountPaise: number, overrides: Partial<Invoice> = {}): Invoice {
  return {
    row_id: 1,
    invoice_id: id,
    invoice_number: id,
    customer_id: "C-001",
    invoice_date: "2026-01-01",
    due_date: "2026-09-01",
    amount_paise: paise(amountPaise),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
    ...overrides,
  };
}

function priority(invoiceId: string, band: PriorityBand, daysOverdue: number | null): Priority {
  return {
    invoice_id: invoiceId,
    config_version: "priority.v1",
    band,
    factors: [],
    reason: "fixture",
    recommended_action: "fixture",
    days_overdue: daysOverdue,
  };
}

function payment(invoiceId: string, amountPaise: number): Payment {
  return { payment_id: `PMT-${invoiceId}`, invoice_id: invoiceId, paid_on: "2026-09-10", amount_paise: paise(amountPaise) };
}

// 7 invoices: two `high` (10d, 20d overdue), one `medium` (40d), one `low`
// (70d), one `disputed` (5d), one `closed` (excluded from every KPI/chart),
// one `needs_review` with no due date (counted in KPIs, has no ageing bucket).
const fixture: HomeAggregateInput = {
  items: [
    { invoice: invoice("INV-1", 100_000), priority: priority("INV-1", "high", 10) },
    { invoice: invoice("INV-2", 200_000), priority: priority("INV-2", "high", 20) },
    { invoice: invoice("INV-3", 300_000), priority: priority("INV-3", "medium", 40) },
    { invoice: invoice("INV-4", 50_000), priority: priority("INV-4", "low", 70) },
    { invoice: invoice("INV-5", 80_000), priority: priority("INV-5", "disputed", 5) },
    { invoice: invoice("INV-6", 999_999), priority: priority("INV-6", "closed", 100) },
    { invoice: invoice("INV-7", 120_000, { due_date: null }), priority: priority("INV-7", "needs_review", null) },
  ],
  payments: [payment("INV-2", 50_000), payment("INV-6", 999_999)],
};

describe("kpis — TC-054", () => {
  it("matches hand-computed outstanding, high count and avg days overdue", () => {
    const result = kpis(fixture);
    // Open (non-closed) outstanding: 100000 + 150000(200000-50000) + 300000 + 50000 + 80000 + 120000 = 800000.
    expect(result.outstandingPaise).toBe(800_000);
    expect(result.highCount).toBe(2);
    // "Open disputes" is not an invoice-band count: it comes from the dispute
    // records, the same source as the sidebar badge (T18-10).
    expect(result).not.toHaveProperty("openDisputesCount");
    // (10 + 20 + 40 + 70 + 5) / 5 = 29.
    expect(result.avgDaysOverdue).toBe(29);
  });

  it("avgDaysOverdue is null when nothing is overdue", () => {
    const result = kpis({
      items: [{ invoice: invoice("INV-1", 1_000), priority: priority("INV-1", "not_due", -5) }],
      payments: [],
    });
    expect(result.avgDaysOverdue).toBeNull();
  });
});

describe("ageingBucketOf — TC-054", () => {
  it("buckets at the 15/30/60-day boundaries, and excludes not-overdue/unknown", () => {
    expect(ageingBucketOf(null)).toBeNull();
    expect(ageingBucketOf(0)).toBeNull();
    expect(ageingBucketOf(1)).toBe("1-15");
    expect(ageingBucketOf(15)).toBe("1-15");
    expect(ageingBucketOf(16)).toBe("16-30");
    expect(ageingBucketOf(30)).toBe("16-30");
    expect(ageingBucketOf(31)).toBe("31-60");
    expect(ageingBucketOf(60)).toBe("31-60");
    expect(ageingBucketOf(61)).toBe("60+");
  });

  it("gives a closed invoice no bucket, however overdue (T18-2: chart and Queue filter agree)", () => {
    expect(ageingBucketOfPriority({ band: "closed", days_overdue: 100 })).toBeNull();
    expect(ageingBucketOfPriority({ band: "high", days_overdue: 100 })).toBe("60+");
    expect(ageingBucketOfPriority({ band: "not_due", days_overdue: null })).toBeNull();
  });
});

describe("ageingBuckets — TC-054", () => {
  it("matches hand-computed counts/outstanding per bucket and sums to the overdue total", () => {
    const result = ageingBuckets(fixture);
    expect(result).toEqual([
      { bucket: "1-15", count: 2, outstandingPaise: 180_000 }, // INV-1 (100000) + INV-5 (80000).
      { bucket: "16-30", count: 1, outstandingPaise: 150_000 }, // INV-2.
      { bucket: "31-60", count: 1, outstandingPaise: 300_000 }, // INV-3.
      { bucket: "60+", count: 1, outstandingPaise: 50_000 }, // INV-4.
    ]);
    const bucketedTotal = result.reduce((sum, b) => sum + b.outstandingPaise, 0);
    // Every open invoice except INV-7 (no due date, so no bucket) is bucketed.
    expect(bucketedTotal).toBe(680_000);
  });
});

describe("priorityMix — TC-054", () => {
  it("matches hand-computed counts for the four charted bands", () => {
    expect(priorityMix(fixture)).toEqual([
      { band: "high", count: 2 },
      { band: "medium", count: 1 },
      { band: "low", count: 1 },
      { band: "disputed", count: 1 },
    ]);
  });
});
