"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Draft, VerifiedFact } from "@/domain/schema";

export interface DraftPanelProps {
  /** The current draft; null when there is none, undefined while loading. */
  draft: Draft | null | undefined;
  editing: boolean;
  busy: boolean;
  /** Absent outside the command provider: actions are disabled. */
  canRun: boolean;
  onGenerate: () => void;
  onSave: (body: string) => void;
  onCancel: () => void;
}

interface Cited {
  n: number;
  fact: VerifiedFact;
  span: [number, number];
}

/** Footnotes in body order, numbered from 1, each with the fact it cites. */
function cited(draft: Draft): Cited[] {
  const facts = new Map(draft.facts.map((f) => [f.claimId, f]));
  const out: Cited[] = [];
  for (const fn of [...draft.footnotes].sort((a, b) => a.span[0] - b.span[0])) {
    const fact = facts.get(fn.claimId);
    if (fact) out.push({ n: out.length + 1, fact, span: fn.span });
  }
  return out;
}

/** The body with every verified fact marked and footnoted. */
function renderBody(body: string, notes: Cited[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const c of notes) {
    const [start, end] = c.span;
    if (start < at || end > body.length) continue;
    if (start > at) parts.push(body.slice(at, start));
    parts.push(
      <span key={c.n}>
        <mark className="rounded-sm bg-brand-tint px-0.5 text-text">{body.slice(start, end)}</mark>
        <sup className="ml-0.5 text-[10px] text-text-muted">{c.n}</sup>
      </span>,
    );
    at = end;
  }
  if (at < body.length) parts.push(body.slice(at));
  return parts;
}

/**
 * The reminder draft (TASK-15.5): built from verified facts only, each one
 * highlighted and footnoted to its evidence. Generate and edit go through
 * `execute()`; the nine checks re-run on every edit (FS12).
 */
export function DraftPanel({ draft, editing, busy, canRun, onGenerate, onSave, onCancel }: DraftPanelProps) {
  return (
    <section className="mt-6" aria-labelledby="draft-title" data-testid="draft-panel">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="draft-title" className="text-sm font-semibold text-text">
          Reminder draft
        </h2>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted">Simulated LLM</span>
      </div>
      {draft === undefined ? (
        <div className="h-32 animate-pulse rounded-md bg-surface-sunken" aria-busy="true" aria-label="Loading draft" />
      ) : draft === null ? (
        <div className="rounded-md border border-dashed border-border p-4 text-[13px] text-text-muted">
          <p>No reminder drafted yet. A draft states only facts verified against the ledger.</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={onGenerate} disabled={!canRun || busy}>
            Generate draft
          </Button>
        </div>
      ) : editing ? (
        <DraftEditor key={draft.draft_id} draft={draft} busy={busy} canRun={canRun} onSave={onSave} onCancel={onCancel} />
      ) : (
        <DraftView draft={draft} />
      )}
    </section>
  );
}

function DraftView({ draft }: { draft: Draft }) {
  const notes = cited(draft);
  return (
    <div className="rounded-md border border-border p-4 text-[13px]" data-testid="draft-body">
      <p className="mb-2 font-medium text-text">{draft.subject}</p>
      <p className="whitespace-pre-wrap leading-relaxed text-text">{renderBody(draft.body, notes)}</p>
      {notes.length > 0 ? (
        <ol className="mt-3 border-t border-border pt-2 text-xs text-text-muted" aria-label="Sources">
          {notes.map((c) => (
            <li key={c.n}>
              <sup>{c.n}</sup> {c.fact.value} <span className="font-mono">({c.fact.evidenceId})</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function DraftEditor({
  draft,
  busy,
  canRun,
  onSave,
  onCancel,
}: {
  draft: Draft;
  busy: boolean;
  canRun: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(draft.body);
  return (
    <div>
      <label htmlFor="draft-body-edit" className="mb-1 block text-xs font-medium text-text-muted">
        Draft text (the nine checks re-run when you save)
      </label>
      <Textarea id="draft-body-edit" value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => onSave(body)}
          disabled={!canRun || busy || body === draft.body}
        >
          Save draft
        </Button>
      </div>
    </div>
  );
}
