"use client";

import { Component, useContext, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DbContext, useAudit } from "@/store/hooks";
import { AuditRow, actionLabel } from "./AuditRow";

/**
 * The Audit log (TASK-14.6): every recorded action, newest first. Read-only
 * by design — there are no edit or delete controls. Four states: loading,
 * empty (no data / filtered), error, working.
 */
export function AuditView() {
  const db = useContext(DbContext);
  const [attempt, setAttempt] = useState(0);
  return (
    <section className="flex flex-col gap-4 p-7" aria-labelledby="audit-title">
      <header className="flex flex-col gap-1">
        <h1 id="audit-title" className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
          Audit log
        </h1>
        <p className="text-text-muted">Every action taken in this workspace, newest first. Entries can’t be edited or deleted.</p>
      </header>
      {db ? (
        <AuditBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
          <AuditList />
        </AuditBoundary>
      ) : (
        <AuditError onRetry={() => window.location.reload()} />
      )}
    </section>
  );
}

function AuditList() {
  const events = useAudit();
  const [action, setAction] = useState("");
  const [subject, setSubject] = useState("");

  const actions = useMemo(
    () => [...new Set((events ?? []).map((e) => e.action))].sort(),
    [events],
  );
  const filtered = useMemo(() => {
    const q = subject.trim().toLowerCase();
    return (events ?? []).filter(
      (e) => (!action || e.action === action) && (!q || e.subject.toLowerCase().includes(q)),
    );
  }, [events, action, subject]);

  if (!events) return <AuditSkeleton />;

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6" data-state="empty">
        <p className="font-semibold text-text">No activity yet</p>
        <p className="text-[13px] text-text-muted">Notes, approvals and role switches will appear here as they happen.</p>
      </div>
    );
  }

  const filtering = action !== "" || subject !== "";
  return (
    <div className="flex flex-col gap-3" data-state="working">
      <div className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter audit log">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Action
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-[13px] text-text"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Subject
          <input
            type="search"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. INV-1042"
            className="min-h-9 w-56 max-w-full rounded-md border border-border bg-surface px-2 text-[13px] text-text"
          />
        </label>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => { setAction(""); setSubject(""); }}>
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-xs text-text-muted" aria-live="polite">
          {filtered.length} of {events.length} events
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6" data-state="empty-filtered">
          <p className="font-semibold text-text">No events match these filters</p>
        </div>
      ) : (
        <ol className="rounded-lg border border-border bg-surface px-4" aria-label="Audit events">
          {filtered.map((e) => (
            <AuditRow key={e.event_id} event={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface px-4" data-state="loading" aria-busy="true" aria-label="Loading audit log">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0">
          <span className="h-3.5 w-2/3 animate-pulse rounded bg-surface-sunken" />
          <span className="h-3 w-1/3 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}

function AuditError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4" data-state="error">
      <p className="text-text">Couldn’t load the audit log.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

class AuditBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[verilane] audit log failed to load", error);
  }
  render() {
    return this.state.failed ? <AuditError onRetry={this.props.onRetry} /> : this.props.children;
  }
}
