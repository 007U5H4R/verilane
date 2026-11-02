"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { ACTOR_TYPE_LABEL } from "@/domain/audit/classify";
import { changeRows, metadataOf, relatedRefs, resultOf } from "@/domain/audit/detail";
import type { AuditEntry } from "@/domain/audit/view";
import { useRelatedExists, type RelatedExists } from "@/store/auditHooks";
import { ActionBadge, EventTime } from "./AuditTable";

export const IMMUTABLE_NOTE = "Audit records are immutable. Corrections and subsequent actions are recorded as new events.";
const NR = "Not recorded";

type Kind = keyof RelatedExists;
const HREF: Record<Kind, (id: string) => string> = {
  invoice: (id) => `/invoices/${encodeURIComponent(id)}`,
  dispute: (id) => `/disputes/${encodeURIComponent(id)}`,
  draft: () => "/drafts",
  review: () => "/payments",
};
const KIND_LABEL: Record<Kind, string> = { invoice: "Invoice", dispute: "Dispute", draft: "Draft", review: "Review item" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Item({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1 text-[13px]">
      <dt className="text-text-muted">{label}</dt>
      <dd className={mono ? "min-w-0 break-all font-mono text-xs text-text" : "min-w-0 text-text"}>{children}</dd>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Read-only detail drawer for one event: right-side sheet on desktop, full
 * screen on mobile. Modal: focus is trapped, Esc or the close button
 * dismisses it, and focus returns to the row's "View details" button.
 */
export function AuditDrawer({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const refs = relatedRefs(entry);
  const exists = useRelatedExists(refs);

  useEffect(() => {
    close.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      onClose();
      return;
    }
    if (ev.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  };

  const raw = entry.raw as Record<string, unknown>;
  const changes = changeRows(raw);
  const result = resultOf(raw);
  const meta = metadataOf(raw);
  const related = (Object.keys(HREF) as Kind[])
    .map((k) => ({ kind: k, id: refs[`${k}Id` as const] }))
    .filter((r): r is { kind: Kind; id: string } => r.id !== null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-text/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-drawer-title"
        data-testid="audit-drawer"
        className="relative flex h-full w-full flex-col bg-surface shadow-card md:max-w-[30rem] md:border-l md:border-border"
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="audit-drawer-title" className="font-display text-lg font-semibold text-text">
              Activity details
            </h2>
            <span className="font-mono text-xs text-text-muted">{entry.id ?? NR}</span>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="ml-auto grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-sunken"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">Overview</h3>
            <dl>
              <Item label="Audit ID" mono>{entry.id ?? NR}</Item>
              <Item label="Action"><ActionBadge entry={entry} /></Item>
              <Item label="Timestamp"><EventTime entry={entry} /></Item>
              <Item label="Actor">{entry.actor.name}</Item>
              <Item label="Actor type">{ACTOR_TYPE_LABEL[entry.actor.type]}</Item>
              <Item label="Role">{entry.actor.role ?? NR}</Item>
              <Item label="Module">{entry.moduleLabel}</Item>
              <Item label="Result">{result ?? NR}</Item>
            </dl>
          </section>

          <Section title="Description">
            <p className="text-[13px] text-text">{entry.summary ?? NR}</p>
          </Section>

          {related.length > 0 && (
            <Section title="Related">
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {related.map((r) => (
                  <li key={r.kind} className="flex flex-wrap items-baseline gap-2">
                    <span className="w-24 text-text-muted">{KIND_LABEL[r.kind]}</span>
                    {exists?.[r.kind] ? (
                      <Link href={HREF[r.kind](r.id)} className="font-mono text-xs text-interactive hover:underline">
                        {r.id}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-text">
                        {r.id}
                        {exists && <span className="ml-2 font-sans text-text-muted">(no longer in this workspace)</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {changes.length > 0 && (
            <Section title="Change details">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-text-muted">
                    <th scope="col" className="py-1 pr-2 font-medium">Field</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Previous</th>
                    <th scope="col" className="py-1 font-medium">New</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field} className="border-t border-border align-top">
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-text-muted">{c.field}</th>
                      <td className="break-all py-1.5 pr-2 font-mono text-xs text-text">{c.before}</td>
                      <td className="break-all py-1.5 font-mono text-xs text-text">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="Metadata">
            <dl>
              <Item label="Event ID" mono>{entry.eventId ?? NR}</Item>
              <Item label="Correlation ID" mono>{meta.correlationId ?? NR}</Item>
              <Item label="Time (UTC)" mono>{entry.atMs === null ? NR : new Date(entry.atMs).toISOString()}</Item>
              <Item label="Actor ID" mono>{meta.actorId ?? NR}</Item>
              <Item label="Source system">{meta.source ?? NR}</Item>
              <Item label="Schema version" mono>{meta.schemaVersion ?? NR}</Item>
              {meta.evidence.length > 0 && <Item label="Evidence" mono>{meta.evidence.join(", ")}</Item>}
            </dl>
          </Section>

          <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-xs text-text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {IMMUTABLE_NOTE}
          </p>
        </div>
      </div>
    </div>
  );
}
