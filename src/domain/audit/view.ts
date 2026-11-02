/**
 * TASK-38 · Pure view-model helpers for the Audit Log: normalise a stored row,
 * then search / filter / sort / paginate / count. Nothing here writes, and
 * nothing invents a value — a field the event didn't record stays `null`.
 */
import { DISPLAY_TIME_ZONE } from "@/domain/clock";
import { MODULES, actorOf, describe, type ActionMeta, type ActorView, type AuditModule } from "./classify";

/** The stored row's shape as the log reads it (see `AuditEventRow`). */
export interface StoredAuditEvent {
  event_id?: number;
  action: string;
  subject: string;
  [key: string]: unknown;
}

export interface AuditEntry {
  /** Display id, e.g. `AUD-000042`; `null` if the row has no event_id. */
  id: string | null;
  eventId: number | null;
  action: string;
  meta: ActionMeta & { known: boolean };
  actor: ActorView;
  /** ISO instant as recorded; `null` if absent/unparseable. */
  at: string | null;
  atMs: number | null;
  subject: string;
  subjectKind: string | null;
  subjectId: string | null;
  invoiceId: string | null;
  summary: string | null;
  moduleLabel: string;
  moduleHref: string | null;
  raw: StoredAuditEvent;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function auditId(eventId: number): string {
  return `AUD-${String(eventId).padStart(6, "0")}`;
}

export function toEntry(raw: StoredAuditEvent): AuditEntry {
  const meta = describe(raw);
  const at = str(raw.at);
  const ms = at === null ? NaN : Date.parse(at);
  const eventId = typeof raw.event_id === "number" ? raw.event_id : null;
  const mod = MODULES[meta.module];
  return {
    id: eventId === null ? null : auditId(eventId),
    eventId,
    action: raw.action,
    meta,
    actor: actorOf(raw),
    at: Number.isNaN(ms) ? null : at,
    atMs: Number.isNaN(ms) ? null : ms,
    subject: raw.subject,
    subjectKind: str(raw.subject_kind),
    subjectId: str(raw.subject_id),
    invoiceId: str(raw.invoice_id),
    summary: str(raw.summary),
    moduleLabel: mod.label,
    moduleHref: mod.href,
    raw,
  };
}

// --- Date ranges --------------------------------------------------------------

export type DatePreset = "all" | "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRange {
  preset: DatePreset;
  /** Custom range, inclusive, `YYYY-MM-DD` calendar days in the display zone. */
  from?: string;
  to?: string;
}

const DAY_MS = 86_400_000;
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

/** The calendar day (`YYYY-MM-DD`) of an instant in the display time zone. */
export function dayKey(ms: number): string {
  return DAY_KEY.format(ms);
}

/** True when an entry's time falls in `range`, relative to `now` (ms). */
export function inRange(atMs: number | null, range: DateRange, now: number): boolean {
  if (range.preset === "all") return true;
  if (atMs === null) return false;
  switch (range.preset) {
    case "today":
      return dayKey(atMs) === dayKey(now);
    case "7d":
      return atMs > now - 7 * DAY_MS && atMs <= now;
    case "30d":
      return atMs > now - 30 * DAY_MS && atMs <= now;
    case "90d":
      return atMs > now - 90 * DAY_MS && atMs <= now;
    case "custom": {
      const d = dayKey(atMs);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    }
  }
}

// --- Filters ------------------------------------------------------------------

export type KpiFilter = "all" | "user" | "system" | "approvals";

export interface AuditFilters {
  q: string;
  date: DateRange;
  /** Actor key (`analyst` | `manager` | `system` | `unknown`) or "" for all. */
  actor: string;
  module: AuditModule | "";
  action: string;
  kpi: KpiFilter;
}

export const NO_FILTERS: AuditFilters = {
  q: "",
  date: { preset: "all" },
  actor: "",
  module: "",
  action: "",
  kpi: "all",
};

export function isFiltering(f: AuditFilters): boolean {
  return f.q.trim() !== "" || f.date.preset !== "all" || f.actor !== "" || f.module !== "" || f.action !== "" || f.kpi !== "all";
}

/** Every field the search box looks at, lower-cased. */
export function searchText(e: AuditEntry): string {
  const r = e.raw;
  const extra = ["customer_id", "payment_id", "dispute_id", "email", "message_id"]
    .map((k) => str(r[k]))
    .filter((v): v is string => v !== null);
  return [
    e.id,
    e.eventId === null ? null : String(e.eventId),
    e.action,
    e.meta.label,
    e.actor.name,
    e.actor.role,
    e.subject,
    e.subjectId,
    e.invoiceId,
    e.summary,
    e.moduleLabel,
    ...extra,
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" \u0000 ")
    .toLowerCase();
}

export function matchesKpi(e: AuditEntry, kpi: KpiFilter): boolean {
  switch (kpi) {
    case "all":
      return true;
    case "user":
      return e.actor.type === "human";
    case "system":
      return e.actor.type === "system";
    case "approvals":
      return e.meta.category === "approval";
  }
}

export function applyFilters(entries: AuditEntry[], f: AuditFilters, now: number): AuditEntry[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.action && e.action !== f.action) return false;
    if (f.module && e.meta.module !== f.module) return false;
    if (f.actor && e.actor.key !== f.actor) return false;
    if (!matchesKpi(e, f.kpi)) return false;
    if (!inRange(e.atMs, f.date, now)) return false;
    if (terms.length) {
      const text = searchText(e);
      if (!terms.every((t) => text.includes(t))) return false;
    }
    return true;
  });
}

// --- Options (only values present in the data) ---------------------------------

export interface Option {
  value: string;
  label: string;
}

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value);

export function actorOptions(entries: AuditEntry[]): Option[] {
  const seen = new Map<string, string>();
  for (const e of entries) if (!seen.has(e.actor.key)) seen.set(e.actor.key, e.actor.name);
  return [...seen].map(([value, label]) => ({ value, label })).sort(byLabel);
}

export function moduleOptions(entries: AuditEntry[]): Option[] {
  const seen = new Map<string, string>();
  for (const e of entries) seen.set(e.meta.module, e.moduleLabel);
  return [...seen].map(([value, label]) => ({ value, label })).sort(byLabel);
}

export function actionOptions(entries: AuditEntry[]): Option[] {
  const seen = new Map<string, string>();
  for (const e of entries) if (!seen.has(e.action)) seen.set(e.action, e.meta.known ? e.meta.label : e.action.replace(/_/g, " "));
  return [...seen].map(([value, label]) => ({ value, label })).sort(byLabel);
}

// --- Sorting ------------------------------------------------------------------

export type AuditSort = "newest" | "oldest" | "actor" | "module" | "action";

export const SORT_LABEL: Record<AuditSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  actor: "User (A–Z)",
  module: "Module (A–Z)",
  action: "Action type (A–Z)",
};

/** Recorded order: event_id is the append order, so it breaks every tie. */
function newestCmp(a: AuditEntry, b: AuditEntry): number {
  const ia = a.eventId ?? -Infinity;
  const ib = b.eventId ?? -Infinity;
  if (ia !== ib) return ib - ia;
  return (b.atMs ?? -Infinity) - (a.atMs ?? -Infinity);
}

/** Deterministic: every key ends with the newest-first event order. */
export function sortEntries(entries: AuditEntry[], sort: AuditSort): AuditEntry[] {
  const out = [...entries];
  const text = (f: (e: AuditEntry) => string) => (a: AuditEntry, b: AuditEntry) =>
    f(a).localeCompare(f(b)) || newestCmp(a, b);
  switch (sort) {
    case "newest":
      return out.sort(newestCmp);
    case "oldest":
      return out.sort((a, b) => -newestCmp(a, b));
    case "actor":
      return out.sort(text((e) => e.actor.name));
    case "module":
      return out.sort(text((e) => e.moduleLabel));
    case "action":
      return out.sort(text((e) => e.meta.label));
  }
}

// --- Pagination ---------------------------------------------------------------

export const PAGE_SIZES = [10, 25, 50] as const;

export interface PageInfo {
  page: number;
  pageCount: number;
  /** 1-based, inclusive; 0 when empty. */
  start: number;
  end: number;
  total: number;
}

export function pageInfo(total: number, page: number, size: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = total === 0 ? 0 : (p - 1) * size + 1;
  const end = Math.min(total, p * size);
  return { page: p, pageCount, start, end, total };
}

export function pageSlice<T>(rows: T[], info: PageInfo): T[] {
  return info.total === 0 ? [] : rows.slice(info.start - 1, info.end);
}

/** Page numbers with `"…"` gaps: always first, last, and current ± 1. */
export function pageList(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1]! > 1) out.push("…");
    out.push(n);
  });
  return out;
}

// --- KPIs ---------------------------------------------------------------------

export interface AuditKpis {
  total: number;
  user: number;
  system: number;
  /** Rows with no recorded actor (legacy/malformed); user + system + unattributed = total. */
  unattributed: number;
  approvals: number;
}

export function kpis(entries: AuditEntry[]): AuditKpis {
  const k: AuditKpis = { total: entries.length, user: 0, system: 0, unattributed: 0, approvals: 0 };
  for (const e of entries) {
    if (e.actor.type === "human") k.user++;
    else if (e.actor.type === "system") k.system++;
    else k.unattributed++;
    if (e.meta.category === "approval") k.approvals++;
  }
  return k;
}
