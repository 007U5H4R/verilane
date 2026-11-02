"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ACTOR_TYPE_LABEL } from "@/domain/audit/classify";
import type { AuditEntry, AuditSort } from "@/domain/audit/view";
import { cn } from "@/lib/cn";
import { formatAt } from "./AuditRow";
import { ACTION_ICON, MODULE_ICON, TONE_CLASS } from "./icons";

export const TZ_NOTE = "Shown in India Standard Time (IST, UTC+05:30). The stored time is UTC.";

function initials(name: string): string {
  if (name === "System") return "SY";
  if (name === "Not recorded") return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({ entry }: { entry: AuditEntry }) {
  const t = entry.actor.type;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-medium",
        t === "human" ? "bg-brand-tint text-brand-strong" : t === "system" || t === "copilot" ? "bg-info-bg text-info" : "bg-surface-sunken text-text-muted",
      )}
    >
      {initials(entry.actor.name)}
    </span>
  );
}

export function ActionBadge({ entry }: { entry: AuditEntry }) {
  const Icon = ACTION_ICON[entry.meta.icon];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_CLASS[entry.meta.tone])}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {entry.meta.label}
    </span>
  );
}

export function EventTime({ entry, className }: { entry: AuditEntry; className?: string }) {
  if (!entry.at) return <span className={cn("text-text-muted", className)}>Not recorded</span>;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      <time dateTime={entry.at} title={`${TZ_NOTE} UTC: ${new Date(entry.atMs!).toISOString()}`}>
        {formatAt(entry.at)}
      </time>{" "}
      <abbr title="India Standard Time (UTC+05:30)" className="text-[11px] text-text-muted no-underline">
        IST
      </abbr>
    </span>
  );
}

const TH = "px-3 py-2.5 text-left text-xs font-medium text-text-muted";
const TD = "px-3 py-3 align-top max-md:px-0 max-md:py-1";

/**
 * The audit table. One DOM at every width: below md each row restyles as a
 * card (headers visually hidden, cells stacked) so controls are never doubled.
 */
export function AuditTable({
  rows,
  sort,
  pageSize,
  onOpen,
}: {
  rows: AuditEntry[];
  sort: AuditSort;
  pageSize: number;
  onOpen: (entry: AuditEntry, trigger: HTMLElement) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card max-md:border-0 max-md:bg-transparent max-md:shadow-none">
      <table className="w-full border-collapse text-[13px] max-md:block" data-sort={sort} data-page-size={pageSize} aria-label="Audit events">
        <thead className="border-b border-border bg-surface-sunken max-md:sr-only">
          <tr>
            <th scope="col" className={TH}>
              Time <span className="font-normal">(IST)</span>
            </th>
            <th scope="col" className={TH}>User</th>
            <th scope="col" className={TH}>Action</th>
            <th scope="col" className={TH}>Details</th>
            <th scope="col" className={TH}>Module</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
          {rows.map((e) => (
            <Row key={e.eventId ?? `${e.subject}-${e.at}`} entry={e} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ entry: e, onOpen }: { entry: AuditEntry; onOpen: (entry: AuditEntry, trigger: HTMLElement) => void }) {
  const ModIcon = MODULE_ICON[e.meta.module];
  return (
    <tr
      data-testid="audit-row"
      data-action={e.action}
      className="border-b border-border last:border-b-0 hover:bg-surface-sunken/60 max-md:flex max-md:flex-col max-md:gap-1 max-md:rounded-lg max-md:border max-md:bg-surface max-md:p-3 max-md:shadow-card max-md:last:border-b"
    >
      <td className={cn(TD, "text-text-muted")}>
        <EventTime entry={e} />
      </td>
      <td className={TD}>
        <span className="flex items-center gap-2">
          <Avatar entry={e} />
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-text">{e.actor.name}</span>
            {e.actor.type !== "unknown" && <span className="text-[11px] text-text-muted">{ACTOR_TYPE_LABEL[e.actor.type]}</span>}
          </span>
        </span>
      </td>
      <td className={TD}>
        <ActionBadge entry={e} />
      </td>
      <td className={cn(TD, "min-w-0 md:max-w-[22rem]")}>
        <span className="block text-text">{e.summary ?? "Not recorded"}</span>
        <span className="block break-all font-mono text-[11px] text-text-muted">{e.subject}</span>
      </td>
      <td className={TD}>
        {e.moduleHref ? (
          <Link href={e.moduleHref} className="inline-flex items-center gap-1.5 text-interactive hover:underline">
            <ModIcon className="size-4 shrink-0" aria-hidden="true" />
            {e.moduleLabel}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <ModIcon className="size-4 shrink-0" aria-hidden="true" />
            {e.moduleLabel}
          </span>
        )}
      </td>
      <td className={cn(TD, "text-right max-md:text-left")}>
        <button
          type="button"
          onClick={(ev) => onOpen(e, ev.currentTarget)}
          aria-haspopup="dialog"
          aria-label={`View details of ${e.id ?? "this activity"}`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium text-interactive hover:bg-brand-tint"
        >
          View details
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}
