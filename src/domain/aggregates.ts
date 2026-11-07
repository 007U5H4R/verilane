/**
 * Home-page aggregates (TASK-18.1, TC-054). Pure functions over the same
 * `RankItem[]` the Queue already builds (`priority.ts`'s `rank()` output)
 * plus the payment ledger `outstandingOf()` needs. SR2: no react/next/dexie
 * imports — `src/components/home/*` calls these from `useQueue()`/
 * `usePayments()` data, never the other way round.
 */
import { addPaise, ZERO_PAISE, type Paise } from "./money";
import { isUnapplied, outstandingOf, type RankItem } from "./priority";
import type { Payment, Priority } from "./schema";

export interface HomeAggregateInput {
  items: RankItem[];
  payments: Payment[];
}

export interface HomeKpis {
  /** Σ outstanding across every non-closed invoice (paise). */
  outstandingPaise: Paise;
  /** Count of invoices currently in the `high` priority band. */
  highCount: number;
  /** Mean days overdue across overdue, non-closed invoices; `null` when none are overdue. */
  avgDaysOverdue: number | null;
}

/** Closed invoices (paid/written-off/overpaid, G1) sit outside the AR workload the KPIs describe. */
function isOpen(item: RankItem): boolean {
  return item.priority.band !== "closed";
}

/** KPI strip: Outstanding, High priority, Avg days overdue (TKT-13). The
 * fourth KPI, "Open disputes", counts dispute *records* (status not
 * resolved/rejected), the same source as the sidebar badge, so it is read
 * from the store (`useDisputeCount()`), not derived from invoice bands. */
export function kpis(input: HomeAggregateInput): HomeKpis {
  const open = input.items.filter(isOpen);

  const outstandingPaise = open.reduce(
    (sum, item) => addPaise(sum, outstandingOf(item.invoice, { payments: input.payments })),
    ZERO_PAISE,
  );
  const highCount = open.filter((item) => item.priority.band === "high").length;

  const overdueDays = open
    .map((item) => item.priority.days_overdue)
    .filter((d): d is number => d !== null && d > 0);
  const avgDaysOverdue =
    overdueDays.length === 0 ? null : overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length;

  return { outstandingPaise, highCount, avgDaysOverdue };
}

export const AGEING_BUCKETS = ["1-15", "16-30", "31-60", "60+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

/** Days overdue → ageing bucket (Design.md §15); not overdue (or unknown) →
 * no bucket. The single definition: the Queue's `ageing` filter re-exports it. */
export function ageingBucketOf(daysOverdue: number | null): AgeingBucket | null {
  if (daysOverdue === null || daysOverdue <= 0) return null;
  if (daysOverdue <= 15) return "1-15";
  if (daysOverdue <= 30) return "16-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

/** An invoice's ageing bucket. A closed invoice (paid/written-off/overpaid,
 * G1) has none however overdue it was, so Home's ageing chart and the
 * Queue's `ageing` filter it deep-links to count the same invoices (T18-2). */
export function ageingBucketOfPriority(priority: Pick<Priority, "band" | "days_overdue">): AgeingBucket | null {
  return priority.band === "closed" ? null : ageingBucketOf(priority.days_overdue);
}

export interface AgeingBucketCount {
  bucket: AgeingBucket;
  count: number;
  outstandingPaise: Paise;
}

/** "Outstanding by ageing bucket" chart data (Design.md §15). Buckets sum to
 * the total overdue outstanding (TC-054). */
export function ageingBuckets(input: HomeAggregateInput): AgeingBucketCount[] {
  const totals = new Map<AgeingBucket, AgeingBucketCount>(
    AGEING_BUCKETS.map((bucket) => [bucket, { bucket, count: 0, outstandingPaise: ZERO_PAISE }]),
  );
  for (const item of input.items) {
    const bucket = ageingBucketOfPriority(item.priority);
    if (bucket === null) continue;
    const row = totals.get(bucket)!;
    row.count += 1;
    row.outstandingPaise = addPaise(
      row.outstandingPaise,
      outstandingOf(item.invoice, { payments: input.payments }),
    );
  }
  return AGEING_BUCKETS.map((bucket) => totals.get(bucket)!);
}

/** The four bands the "priority mix" chart shows (Design.md §15) — the
 * score bands plus `disputed`; the other gate bands (needs_review,
 * hold_reconcile, not_due, on_hold_promised) and `closed` aren't part of
 * the mix the chart answers ("how much of the queue is urgent?"). */
export const PRIORITY_MIX_BANDS = ["high", "medium", "low", "disputed"] as const;
export type PriorityMixBand = (typeof PRIORITY_MIX_BANDS)[number];

export interface PriorityMixCount {
  band: PriorityMixBand;
  count: number;
}

/** "Priority mix of the queue" chart data (Design.md §15, TC-054). */
export function priorityMix(input: HomeAggregateInput): PriorityMixCount[] {
  const counts = new Map<PriorityMixBand, number>(PRIORITY_MIX_BANDS.map((b) => [b, 0]));
  for (const item of input.items) {
    const band = item.priority.band;
    if ((PRIORITY_MIX_BANDS as readonly string[]).includes(band)) {
      counts.set(band as PriorityMixBand, (counts.get(band as PriorityMixBand) ?? 0) + 1);
    }
  }
  return PRIORITY_MIX_BANDS.map((band) => ({ band, count: counts.get(band) ?? 0 }));
}

/** Payments with no invoice (`invoice_id: null`, TASK-79.1, TC-003). */
export function unappliedPayments(payments: readonly Payment[]): Payment[] {
  return payments.filter(isUnapplied);
}

/** "Unapplied cash": Σ payments not applied to any invoice. Counted here so
 * a null-invoice payment is never silently dropped from totals (TC-003). */
export function unappliedCashPaise(payments: readonly Payment[]): Paise {
  return unappliedPayments(payments).reduce((sum, p) => addPaise(sum, p.amount_paise), ZERO_PAISE);
}
