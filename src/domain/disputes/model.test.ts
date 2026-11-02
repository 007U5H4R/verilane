import { describe, expect, it } from "vitest";
import { DisputeStatusSchema } from "../schema";
import { MACHINES } from "../transitions";
import {
  ageDays,
  ageLabel,
  ageTone,
  BULK_STATUS_EVENTS,
  canApply,
  closingOutcome,
  DISPUTE_GROUP,
  DISPUTE_TEAM,
  eventsFor,
  isDisputeReviewer,
  isOpen,
  matchesAge,
  matchesStatus,
  outcomeAvailability,
  ownerLabel,
  RESOLUTION_CODES,
  RESOLUTION_EFFECT,
  STATUS_FILTER_OPTIONS,
} from "./model";

const STATES = DisputeStatusSchema.options;

describe("DISPUTE_GROUP (machine state → KPI group, one place)", () => {
  it("maps every machine state", () => {
    expect(Object.keys(DISPUTE_GROUP).sort()).toEqual([...STATES].sort());
    expect([...MACHINES.dispute.states].sort()).toEqual([...STATES].sort());
  });

  it("puts new in needs response, under review in resolution, awaiting with awaiting, terminal states closed", () => {
    expect(DISPUTE_GROUP).toEqual({
      new: "needs_response",
      under_review: "in_resolution",
      awaiting_customer: "awaiting_customer",
      resolved: "closed",
      rejected: "closed",
    });
  });

  it("treats only resolved and rejected as closed", () => {
    expect(STATES.filter((s) => !isOpen(s))).toEqual(["resolved", "rejected"]);
  });
});

describe("matchesStatus", () => {
  it("offers All, Open and every machine state", () => {
    const values = STATUS_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["all", "open", ...STATES]);
  });

  it("matches all, open, a machine state, and a KPI group", () => {
    expect(STATES.filter((s) => matchesStatus(s, "all"))).toHaveLength(5);
    expect(STATES.filter((s) => matchesStatus(s, "open"))).toEqual(["new", "under_review", "awaiting_customer"]);
    expect(STATES.filter((s) => matchesStatus(s, "under_review"))).toEqual(["under_review"]);
    expect(STATES.filter((s) => matchesStatus(s, "needs_response"))).toEqual(["new"]);
    expect(STATES.filter((s) => matchesStatus(s, "in_resolution"))).toEqual(["under_review"]);
    expect(STATES.filter((s) => matchesStatus(s, "awaiting_customer"))).toEqual(["awaiting_customer"]);
    expect(STATES.filter((s) => matchesStatus(s, "closed"))).toEqual(["resolved", "rejected"]);
  });
});

describe("age", () => {
  it("counts whole days from creation to the as-of date, never negative, null when unknown", () => {
    expect(ageDays("2026-10-12T09:00:00Z", "2026-10-30")).toBe(18);
    expect(ageDays("2026-10-30T23:00:00Z", "2026-10-30")).toBe(0);
    expect(ageDays("2026-11-02T00:00:00Z", "2026-10-30")).toBe(0);
    expect(ageDays(undefined, "2026-10-30")).toBeNull();
  });

  it("buckets are cumulative; unknown only matches All", () => {
    expect(matchesAge(0, "today")).toBe(true);
    expect(matchesAge(1, "today")).toBe(false);
    expect(matchesAge(3, "le3")).toBe(true);
    expect(matchesAge(4, "le3")).toBe(false);
    expect(matchesAge(7, "le7")).toBe(true);
    expect(matchesAge(30, "le30")).toBe(true);
    expect(matchesAge(30, "gt30")).toBe(false);
    expect(matchesAge(31, "gt30")).toBe(true);
    expect(matchesAge(null, "all")).toBe(true);
    expect(matchesAge(null, "le30")).toBe(false);
  });

  it("tones: ≤7 fresh, 8–14 ageing, >14 stale", () => {
    expect([0, 7, 8, 14, 15, null].map(ageTone)).toEqual(["fresh", "fresh", "ageing", "ageing", "stale", "unknown"]);
    expect([0, 1, 9, null].map(ageLabel)).toEqual(["Today", "1 day", "9 days", "Age unknown"]);
  });
});

describe("owner", () => {
  it("is a fixed synthetic team, defaulting to Unassigned", () => {
    expect(DISPUTE_TEAM.length).toBeGreaterThan(0);
    expect(new Set(DISPUTE_TEAM).size).toBe(DISPUTE_TEAM.length);
    expect(isDisputeReviewer(DISPUTE_TEAM[0])).toBe(true);
    expect(isDisputeReviewer("Someone Else")).toBe(false);
    expect(ownerLabel(undefined)).toBe("Unassigned");
    expect(ownerLabel("  ")).toBe("Unassigned");
    expect(ownerLabel(DISPUTE_TEAM[1])).toBe(DISPUTE_TEAM[1]);
  });
});

describe("resolution outcomes", () => {
  it("covers the seven outcomes; only claim_rejected rejects, only awaiting_info keeps it open", () => {
    expect(RESOLUTION_CODES).toHaveLength(7);
    expect(RESOLUTION_CODES.filter((c) => closingOutcome(c) === "rejected")).toEqual(["claim_rejected"]);
    expect(RESOLUTION_CODES.filter((c) => closingOutcome(c) === null)).toEqual(["awaiting_info"]);
    expect(RESOLUTION_EFFECT.awaiting_info).toBe("await_customer");
  });

  it("never offers payment reconciled without a ledger payment (a claim is not proof)", () => {
    const r = outcomeAvailability("payment_reconciled", { status: "under_review", ledgerPaymentCount: 0, isManager: true });
    expect(r.available).toBe(false);
    expect(r.available || r.reason).toMatch(/not proof/);
    expect(
      outcomeAvailability("payment_reconciled", { status: "under_review", ledgerPaymentCount: 1, isManager: true }).available,
    ).toBe(true);
  });

  it("keeps closing outcomes Manager-only, matching the permission rule", () => {
    const r = outcomeAvailability("invoice_corrected", { status: "new", ledgerPaymentCount: 0, isManager: false });
    expect(r).toEqual({ available: false, reason: "Only a Manager can resolve or reject a dispute." });
    expect(outcomeAvailability("awaiting_info", { status: "new", ledgerPaymentCount: 0, isManager: false }).available).toBe(true);
  });

  it("refuses closed disputes and a second wait on the customer", () => {
    expect(outcomeAvailability("other", { status: "resolved", ledgerPaymentCount: 0, isManager: true }).available).toBe(false);
    expect(
      outcomeAvailability("awaiting_info", { status: "awaiting_customer", ledgerPaymentCount: 0, isManager: true }).available,
    ).toBe(false);
  });

  it("plans only legal machine paths, starting review from new", () => {
    for (const code of RESOLUTION_CODES) {
      for (const status of ["new", "under_review", "awaiting_customer"] as const) {
        if (!outcomeAvailability(code, { status, ledgerPaymentCount: 1, isManager: true }).available) continue;
        let s: string = status;
        for (const e of eventsFor(code, status)) {
          expect(canApply(s as never, e)).toBe(true);
          s = { start_review: "under_review", customer_replied: "under_review", await_customer: "awaiting_customer", resolve: "resolved", reject: "rejected" }[e]!;
        }
      }
    }
    expect(eventsFor("claim_rejected", "new")).toEqual(["start_review", "reject"]);
    expect(eventsFor("invoice_corrected", "awaiting_customer")).toEqual(["customer_replied", "resolve"]);
    expect(eventsFor("awaiting_info", "under_review")).toEqual(["await_customer"]);
  });
});

describe("bulk status events", () => {
  it("never include resolve or reject", () => {
    const events = BULK_STATUS_EVENTS.map((b) => b.event as string);
    expect(events).not.toContain("resolve");
    expect(events).not.toContain("reject");
  });

  it("canApply follows the machine", () => {
    expect(canApply("new", "start_review")).toBe(true);
    expect(canApply("new", "await_customer")).toBe(false);
    expect(canApply("resolved", "start_review")).toBe(false);
  });
});
