import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  actionOptions,
  actorOptions,
  applyFilters,
  auditId,
  inRange,
  isFiltering,
  kpis,
  moduleOptions,
  pageInfo,
  pageList,
  pageSlice,
  sortEntries,
  toEntry,
  type StoredAuditEvent,
} from "./view";

const ev = (event_id: number, action: string, at: string, extra: Partial<StoredAuditEvent> = {}): StoredAuditEvent => ({
  event_id,
  action,
  at,
  subject: `invoice:INV-${event_id}`,
  subject_kind: "invoice",
  subject_id: `INV-${event_id}`,
  invoice_id: `INV-${event_id}`,
  actor_role: "analyst",
  actor_label: "Analyst",
  summary: `summary ${event_id}`,
  evidence_ids: [],
  ...extra,
});

const NOW = Date.parse("2026-11-02T06:30:00Z"); // 12:00 IST, 2 Nov

const rows = [
  ev(1, "switch_role", "2026-07-01T04:00:00Z", { subject: "system:role", subject_kind: "system", subject_id: "role", invoice_id: undefined, actor_role: "analyst", actor_label: "Analyst" }),
  ev(2, "add_note", "2026-10-20T04:00:00Z"),
  ev(3, "approve_draft", "2026-11-01T19:00:00Z", { actor_role: "manager", actor_label: "Manager", subject: "draft:D-3", subject_kind: "draft" }), // 2 Nov 00:30 IST
  ev(4, "validation_failure", "2026-11-02T05:00:00Z", { subject: "review:RV-1", subject_kind: "review" }),
  { action: "note", subject: "INV-A", text: "legacy" } as StoredAuditEvent,
];
const entries = rows.map(toEntry);

describe("toEntry", () => {
  it("formats an id and keeps unrecorded fields null", () => {
    expect(auditId(42)).toBe("AUD-000042");
    const legacy = entries[4]!;
    expect(legacy.id).toBeNull();
    expect(legacy.at).toBeNull();
    expect(legacy.summary).toBeNull();
    expect(legacy.invoiceId).toBeNull();
    expect(legacy.meta.known).toBe(false);
  });

  it("rejects an unparseable timestamp", () => {
    expect(toEntry(ev(9, "add_note", "not a date")).at).toBeNull();
  });
});

describe("date ranges", () => {
  it("Today is the display-zone calendar day", () => {
    expect(inRange(Date.parse("2026-11-01T19:00:00Z"), { preset: "today" }, NOW)).toBe(true);
    expect(inRange(Date.parse("2026-11-01T18:00:00Z"), { preset: "today" }, NOW)).toBe(false);
  });
  it("rolling windows and custom inclusive days", () => {
    expect(inRange(Date.parse("2026-10-20T04:00:00Z"), { preset: "7d" }, NOW)).toBe(false);
    expect(inRange(Date.parse("2026-10-20T04:00:00Z"), { preset: "30d" }, NOW)).toBe(true);
    expect(inRange(Date.parse("2026-07-01T04:00:00Z"), { preset: "90d" }, NOW)).toBe(false);
    const custom = { preset: "custom" as const, from: "2026-10-20", to: "2026-11-01" };
    expect(inRange(Date.parse("2026-10-20T04:00:00Z"), custom, NOW)).toBe(true);
    expect(inRange(Date.parse("2026-11-01T19:00:00Z"), custom, NOW)).toBe(false); // 2 Nov IST
    expect(inRange(null, { preset: "today" }, NOW)).toBe(false);
    expect(inRange(null, { preset: "all" }, NOW)).toBe(true);
  });
});

describe("filters", () => {
  it("search covers id, action label, actor, subject and summary", () => {
    const q = (s: string) => applyFilters(entries, { ...NO_FILTERS, q: s }, NOW).map((e) => e.eventId);
    expect(q("AUD-000003")).toEqual([3]);
    expect(q("draft approved")).toEqual([3]);
    expect(q("manager")).toEqual([3]);
    expect(q("INV-2")).toEqual([2]);
    expect(q("summary 4")).toEqual([4]);
    expect(q("nothing-like-this")).toEqual([]);
  });

  it("KPI, actor, module and action filters compose", () => {
    const f = (x: Partial<typeof NO_FILTERS>) => applyFilters(entries, { ...NO_FILTERS, ...x }, NOW).map((e) => e.eventId);
    expect(f({ kpi: "user" })).toEqual([1, 2, 3]);
    expect(f({ kpi: "system" })).toEqual([4]);
    expect(f({ kpi: "approvals" })).toEqual([3]);
    expect(f({ actor: "manager" })).toEqual([3]);
    expect(f({ module: "drafts" })).toEqual([3]);
    expect(f({ action: "add_note" })).toEqual([2]);
    expect(f({ date: { preset: "today" } })).toEqual([3, 4]);
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, q: " x " })).toBe(true);
  });

  it("options list only values present in the data", () => {
    expect(actorOptions(entries).map((o) => o.value).sort()).toEqual(["analyst", "manager", "system", "unknown"]);
    expect(moduleOptions(entries).map((o) => o.value).sort()).toEqual(["drafts", "payments", "queue", "unknown", "workspace"]);
    expect(actionOptions(entries).map((o) => o.value).sort()).toEqual(["add_note", "approve_draft", "note", "switch_role", "validation_failure"]);
  });
});

describe("KPIs", () => {
  it("never double counts: user + system + unattributed = total", () => {
    const k = kpis(entries);
    expect(k).toEqual({ total: 5, user: 3, system: 1, unattributed: 1, approvals: 1 });
    expect(k.user + k.system + k.unattributed).toBe(k.total);
  });
  it("is all zeros with no events", () => {
    expect(kpis([])).toEqual({ total: 0, user: 0, system: 0, unattributed: 0, approvals: 0 });
  });
});

describe("sorting", () => {
  it("newest / oldest follow the append order", () => {
    expect(sortEntries(entries, "newest").map((e) => e.eventId)).toEqual([4, 3, 2, 1, null]);
    expect(sortEntries(entries, "oldest").map((e) => e.eventId)).toEqual([null, 1, 2, 3, 4]);
  });
  it("text sorts are deterministic with a newest-first tiebreak", () => {
    const byActor = sortEntries(entries, "actor").map((e) => e.eventId);
    expect(byActor).toEqual([2, 1, 3, null, 4]);
    expect(sortEntries(entries, "actor")).toEqual(sortEntries([...entries].reverse(), "actor"));
  });
  it("does not mutate its input", () => {
    const copy = [...entries];
    sortEntries(entries, "oldest");
    expect(entries).toEqual(copy);
  });
});

describe("pagination", () => {
  it("clamps the page and reports the visible range", () => {
    expect(pageInfo(23, 1, 10)).toEqual({ page: 1, pageCount: 3, start: 1, end: 10, total: 23 });
    expect(pageInfo(23, 9, 10)).toEqual({ page: 3, pageCount: 3, start: 21, end: 23, total: 23 });
    expect(pageInfo(0, 1, 10)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0, total: 0 });
    expect(pageSlice([1, 2, 3, 4, 5], pageInfo(5, 2, 2))).toEqual([3, 4]);
  });
  it("collapses long page lists with ellipses", () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(1, 20)).toEqual([1, 2, 3, 4, "…", 20]);
    expect(pageList(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(pageList(20, 20)).toEqual([1, "…", 17, 18, 19, 20]);
  });
});
