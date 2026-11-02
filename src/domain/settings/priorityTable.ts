/**
 * The read-only priority table on Settings (TASK-38). `priority.ts` keeps its
 * weights inside private functions, so there is no exported config object to
 * read. Instead every Points cell and the config version are read from the
 * engine itself: each row carries a probe value, and `buildPriorityTable()`
 * runs `prioritise()` on a synthetic invoice at that value and reports the
 * points the engine actually awarded. Only the "When" wording lives here;
 * `priorityTable.test.ts` checks both edges of every bracket and every band
 * threshold against the engine, so the wording can't drift from the scoring.
 */
import { AS_OF_DATE, toDay } from "../clock";
import { paise } from "../money";
import { prioritise } from "../priority";
import type { Invoice, PriorityBand } from "../schema";

export type FactorKey = "days" | "outstanding" | "behavior" | "promise";

/** One input to the engine. Unset fields take the neutral defaults below. */
export interface Probe {
  /** Days past due as of the default as-of date (0 = due today). */
  days?: number;
  outstandingPaise?: number;
  /** Customer's average days late; `null` = no payment history. */
  avgDaysLate?: number | null;
  brokenPromise?: boolean;
}

interface RowSpec {
  when: string;
  /** The value whose points are shown. */
  probe: Probe;
  /** Bracket edges the test checks score the same as `probe`. */
  edges: Probe[];
}

interface FactorSpec {
  key: FactorKey;
  factor: string;
  /** Shown as "+10": an extra on top of the base score. */
  additive?: boolean;
  rows: RowSpec[];
}

const RUPEE = 100; // paise per rupee

export const PRIORITY_FACTOR_SPECS: readonly FactorSpec[] = [
  {
    key: "days",
    factor: "Days overdue",
    rows: [
      { when: "61 or more", probe: { days: 61 }, edges: [{ days: 61 }, { days: 400 }] },
      { when: "31 to 60", probe: { days: 31 }, edges: [{ days: 31 }, { days: 60 }] },
      { when: "16 to 30", probe: { days: 16 }, edges: [{ days: 16 }, { days: 30 }] },
      { when: "1 to 15", probe: { days: 1 }, edges: [{ days: 1 }, { days: 15 }] },
      { when: "Not overdue", probe: { days: 0 }, edges: [{ days: 0 }] },
    ],
  },
  {
    key: "outstanding",
    factor: "Outstanding amount",
    rows: [
      {
        when: "₹5,00,000 or more",
        probe: { outstandingPaise: 500_000 * RUPEE },
        edges: [{ outstandingPaise: 500_000 * RUPEE }, { outstandingPaise: 90_000_000 * RUPEE }],
      },
      {
        when: "₹2,00,000 to ₹4,99,999",
        probe: { outstandingPaise: 200_000 * RUPEE },
        edges: [{ outstandingPaise: 200_000 * RUPEE }, { outstandingPaise: 500_000 * RUPEE - 1 }],
      },
      {
        when: "₹50,000 to ₹1,99,999",
        probe: { outstandingPaise: 50_000 * RUPEE },
        edges: [{ outstandingPaise: 50_000 * RUPEE }, { outstandingPaise: 200_000 * RUPEE - 1 }],
      },
      {
        when: "Under ₹50,000",
        probe: { outstandingPaise: 1 },
        edges: [{ outstandingPaise: 1 }, { outstandingPaise: 50_000 * RUPEE - 1 }],
      },
    ],
  },
  {
    key: "behavior",
    factor: "Customer’s average days late",
    rows: [
      { when: "No payment history", probe: { avgDaysLate: null }, edges: [{ avgDaysLate: null }] },
      { when: "5 or fewer", probe: { avgDaysLate: 0 }, edges: [{ avgDaysLate: 0 }, { avgDaysLate: 5 }] },
      {
        when: "More than 5, up to 20",
        probe: { avgDaysLate: 20 },
        edges: [{ avgDaysLate: 5.01 }, { avgDaysLate: 20 }],
      },
      {
        when: "More than 20, up to 45",
        probe: { avgDaysLate: 45 },
        edges: [{ avgDaysLate: 20.01 }, { avgDaysLate: 45 }],
      },
      { when: "More than 45", probe: { avgDaysLate: 46 }, edges: [{ avgDaysLate: 45.01 }, { avgDaysLate: 365 }] },
    ],
  },
  {
    key: "promise",
    factor: "Broken payment promise",
    additive: true,
    rows: [{ when: "Promise date passed unpaid", probe: { brokenPromise: true }, edges: [{ brokenPromise: true }] }],
  },
];

/** The score bands, as the engine applies them after no gate fires. */
export const PRIORITY_BANDS: readonly { band: Extract<PriorityBand, "high" | "medium" | "low">; label: string; min: number; max: number | null }[] = [
  { band: "high", label: "High", min: 55, max: null },
  { band: "medium", label: "Medium", min: 30, max: 54 },
  { band: "low", label: "Low", min: 0, max: 29 },
];

export function bandForScore(score: number): "high" | "medium" | "low" {
  return (PRIORITY_BANDS.find((b) => score >= b.min && (b.max === null || score <= b.max)) ?? PRIORITY_BANDS[2]).band;
}

export function bandRangeLabel(b: (typeof PRIORITY_BANDS)[number]): string {
  if (b.max === null) return `${b.min}+`;
  if (b.min === 0) return `<${b.max + 1}`;
  return `${b.min}–${b.max}`;
}

const PROBE_INVOICE_ID = "INV-PROBE";
const PROBE_CUSTOMER_ID = "C-PROBE";

function isoDaysBefore(iso: string, days: number): string {
  return new Date((toDay(iso) - days) * 86_400_000).toISOString().slice(0, 10);
}

/** Runs the real engine on a synthetic, gate-free open invoice. */
export function scoreProbe(probe: Probe) {
  const invoice: Invoice = {
    row_id: 1,
    invoice_id: PROBE_INVOICE_ID,
    invoice_number: "PROBE-1",
    customer_id: PROBE_CUSTOMER_ID,
    invoice_date: isoDaysBefore(AS_OF_DATE, (probe.days ?? 0) + 30),
    due_date: isoDaysBefore(AS_OF_DATE, probe.days ?? 0),
    amount_paise: paise(probe.outstandingPaise ?? 10_000 * RUPEE),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
  };
  const avg = probe.avgDaysLate === undefined ? null : probe.avgDaysLate;
  return prioritise(invoice, {
    asOf: AS_OF_DATE,
    payments: [],
    customerHistory: new Map([[PROBE_CUSTOMER_ID, avg]]),
    signals: probe.brokenPromise ? { brokenPromise: new Map([[PROBE_INVOICE_ID, "probe"]]) } : {},
  });
}

const FACTOR_MATCH: Record<FactorKey, (name: string) => boolean> = {
  days: (n) => n.endsWith("days overdue"),
  outstanding: (n) => n.endsWith("outstanding"),
  behavior: (n) => n === "customer payment history",
  promise: (n) => n === "promise broken",
};

/** Points the engine awards `key` for `probe` (0 when the factor is absent). */
export function factorPoints(key: FactorKey, probe: Probe): number {
  const result = scoreProbe(probe);
  if (result.gate !== undefined) {
    throw new Error(`Probe hit gate ${result.gate}; it must score.`);
  }
  return result.factors.find((f) => FACTOR_MATCH[key](f.name))?.points ?? 0;
}

export interface PriorityTableRow {
  key: FactorKey;
  factor: string;
  /** First row of its factor group (renders the factor name). */
  first: boolean;
  /** Rows in this factor group. */
  groupSize: number;
  when: string;
  points: number;
  pointsLabel: string;
}

export interface PriorityTable {
  version: string;
  rows: PriorityTableRow[];
  bands: typeof PRIORITY_BANDS;
}

/** The table Settings renders, with every number read from the engine. */
export function buildPriorityTable(): PriorityTable {
  const rows = PRIORITY_FACTOR_SPECS.flatMap((spec) =>
    spec.rows.map((row, i): PriorityTableRow => {
      const points = factorPoints(spec.key, row.probe);
      return {
        key: spec.key,
        factor: spec.factor,
        first: i === 0,
        groupSize: spec.rows.length,
        when: row.when,
        points,
        pointsLabel: spec.additive ? `+${points}` : String(points),
      };
    }),
  );
  return { version: scoreProbe({}).config_version, rows, bands: PRIORITY_BANDS };
}
