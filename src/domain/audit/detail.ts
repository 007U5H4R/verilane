/**
 * TASK-38 · Pure helpers for the audit detail drawer. They only read what an
 * event recorded; a missing field stays missing (never inferred).
 */
import type { AuditEntry } from "./view";

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export interface EventRefs {
  invoiceId: string | null;
  disputeId: string | null;
  draftId: string | null;
  reviewId: string | null;
}

/** The entities an event points at, from its recorded subject / invoice_id. */
export function relatedRefs(e: Pick<AuditEntry, "subjectKind" | "subjectId" | "invoiceId">): EventRefs {
  const id = (k: string) => (e.subjectKind === k ? e.subjectId : null);
  return { invoiceId: e.invoiceId ?? id("invoice"), disputeId: id("dispute"), draftId: id("draft"), reviewId: id("review") };
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

/** Previous vs new, field by field — empty unless the event recorded before/after. */
export function changeRows(raw: Row): ChangeRow[] {
  const before = isRow(raw.before) ? raw.before : null;
  const after = isRow(raw.after) ? raw.after : null;
  if (!before && !after) return [];
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys.map((k) => ({ field: k.replace(/_/g, " "), before: show(before?.[k]), after: show(after?.[k]) }));
}

/** The recorded outcome status (`after.status`), or null when none was recorded. */
export function resultOf(raw: Row): string | null {
  const after = isRow(raw.after) ? raw.after : null;
  const s = str(after?.status);
  return s === null ? null : s.replace(/_/g, " ");
}

/** Metadata fields; each null when the event didn't record it. */
export function metadataOf(raw: Row): {
  correlationId: string | null;
  actorId: string | null;
  source: string | null;
  schemaVersion: string | null;
  evidence: string[];
} {
  return {
    correlationId: str(raw.correlation_id),
    actorId: str(raw.actor_role),
    source: str(raw.source),
    schemaVersion: str(raw.schema_version),
    evidence: Array.isArray(raw.evidence_ids) ? raw.evidence_ids.filter((x): x is string => typeof x === "string") : [],
  };
}
