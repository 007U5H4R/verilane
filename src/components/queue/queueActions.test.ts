import { describe, expect, it } from "vitest";
import { paise } from "@/domain/money";
import type { Invoice, Priority, PriorityBand } from "@/domain/schema";
import {
  disputeIdOf,
  overdueState,
  pageWindow,
  partitionForDrafts,
  queueKpis,
  reminderEligibility,
  rowActions,
  showingRange,
} from "./queueActions";
import type { QueueRow } from "./useQueueTable";

const ALL_BANDS: PriorityBand[] = [
  "high",
  "medium",
  "low",
  "needs_review",
  "disputed",
  "hold_reconcile",
  "not_due",
  "on_hold_promised",
  "closed",
];

function row(id: string, band: PriorityBand, outstanding = 100, reason = "x"): QueueRow {
  return {
    invoice: { invoice_id: id, invoice_number: id, customer_id: "C1", status: "open" } as Invoice,
    priority: { invoice_id: id, band, reason, days_overdue: 10 } as Priority,
    customer: undefined,
    customerName: "C1",
    outstanding: paise(outstanding),
    rank: 0,
  };
}

describe("reminder eligibility (TASK-38 financial safeguard)", () => {
  it("allows only high and medium", () => {
    const allowed = ALL_BANDS.filter((b) => reminderEligibility(b).eligible);
    expect(allowed).toEqual(["high", "medium"]);
  });

  it("refuses disputed, hold, promised, closed and needs-review with a reason", () => {
    for (const b of ["disputed", "hold_reconcile", "on_hold_promised", "closed", "needs_review"] as const) {
      const e = reminderEligibility(b);
      expect(e.eligible).toBe(false);
      if (!e.eligible) expect(e.reason).not.toBe("");
    }
  });

  it("partitions a selection, keeping order", () => {
    const { eligible, refused } = partitionForDrafts([row("A", "high"), row("B", "disputed"), row("C", "medium")]);
    expect(eligible.map((r) => r.invoice.invoice_id)).toEqual(["A", "C"]);
    expect(refused.map((r) => r.row.invoice.invoice_id)).toEqual(["B"]);
  });
});

describe("row actions", () => {
  it("never offers a reminder for a blocked band", () => {
    for (const b of ALL_BANDS) {
      const has = rowActions(row("A", b)).some((a) => a.kind === "reminder");
      expect(has).toBe(b === "high" || b === "medium");
    }
  });

  it("links the dispute only when the reason names one", () => {
    expect(disputeIdOf("Disputed: Resolve dispute (Manager) [dispute D-0007]")).toBe("D-0007");
    const actions = rowActions(row("A", "disputed", 1, "Disputed: x [dispute D-1]"));
    expect(actions.find((a) => a.kind === "dispute")).toMatchObject({ href: "/disputes/D-1" });
    expect(rowActions(row("A", "disputed")).some((a) => a.kind === "dispute")).toBe(false);
  });
});

describe("queueKpis", () => {
  it("counts bands and sums outstanding over non-closed rows", () => {
    const k = queueKpis([
      row("A", "high", 500),
      row("B", "needs_review", 200),
      row("C", "disputed", 300),
      row("D", "closed", -50),
      row("E", "high", 1),
    ]);
    expect(k).toEqual({ total: 5, outstanding: 1001, high: 2, needsReview: 1, disputed: 1 });
  });
});

describe("overdueState", () => {
  it("never shows a negative number", () => {
    expect(overdueState(-12, "not_due")).toEqual({ kind: "not_due", label: "Not due" });
    expect(overdueState(0, "low")).toEqual({ kind: "not_due", label: "Not due" });
    expect(overdueState(null, "needs_review")).toEqual({ kind: "unknown", label: "Unknown" });
    expect(overdueState(1, "high")).toMatchObject({ kind: "overdue", label: "1 day" });
    expect(overdueState(47, "high")).toMatchObject({ kind: "overdue", label: "47 days" });
    expect(overdueState(90, "closed")).toEqual({ kind: "closed", label: "Closed" });
  });
});

describe("pagination", () => {
  it("windows page numbers", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 2)).toEqual([1, 2]);
    expect(pageWindow(1, 7)).toEqual([1, 2, "gap", 7]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
  });

  it("computes the showing range", () => {
    expect(showingRange(1, 25, 50)).toEqual({ from: 1, to: 25 });
    expect(showingRange(2, 25, 30)).toEqual({ from: 26, to: 30 });
    expect(showingRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
});
