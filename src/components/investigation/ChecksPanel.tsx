"use client";

import type { Check } from "@/domain/schema";
import { checkFix, checksSummary, orderChecks } from "./draftActions";

/**
 * Pre-approval checks (TASK-15.5, TC-045): "N of 9 passed", failures first
 * and expanded with their reason and a fix, passes as one line each. Never a
 * single pass/fail pill.
 */
export function ChecksPanel({ checks, onEdit }: { checks: Check[] | null | undefined; onEdit: () => void }) {
  return (
    <section
      className="mb-6 rounded-lg border border-border bg-surface shadow-card p-4"
      aria-labelledby="checks-title"
      data-testid="checks-panel"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="checks-title" className="text-sm font-semibold text-text">
          Pre-approval checks
        </h2>
        {checks && checks.length > 0 ? (
          <span className="text-xs tabular-nums text-text-muted" data-testid="checks-summary">
            {checksSummary(checks)}
          </span>
        ) : null}
      </div>
      {checks === undefined ? (
        <p className="py-2 text-[13px] text-text-muted" aria-busy="true">
          Loading checks…
        </p>
      ) : checks === null || checks.length === 0 ? (
        <p className="py-2 text-[13px] text-text-muted">The nine checks run when a draft is generated.</p>
      ) : (
        <CheckList checks={checks} onEdit={onEdit} />
      )}
    </section>
  );
}

function CheckList({ checks, onEdit }: { checks: Check[]; onEdit: () => void }) {
  const { failed, passed } = orderChecks(checks);
  return (
    <ul className="text-[13px]" aria-label="Check results">
      {failed.map((c) => {
        const fix = checkFix(c.id);
        return (
          <li key={c.id} className="mb-2 rounded-md bg-high-bg p-3" data-testid="check-failed">
            <span className="font-medium text-text">
              <span aria-hidden="true" className="mr-1 text-high">
                ✕
              </span>
              <span className="sr-only">Failed: </span>
              {c.name}
            </span>
            <span className="mt-1 block text-text">{c.reason}</span>
            {fix.edit ? (
              <button type="button" onClick={onEdit} className="mt-1 font-medium text-brand hover:underline">
                {fix.label}
              </button>
            ) : (
              <a href={fix.href} className="mt-1 inline-block font-medium text-brand hover:underline">
                {fix.label}
              </a>
            )}
          </li>
        );
      })}
      {passed.map((c) => (
        <li key={c.id} className="py-1 text-text-muted" data-testid="check-passed">
          <span aria-hidden="true" className="mr-1 text-brand">
            ✓
          </span>
          <span className="sr-only">Passed: </span>
          {c.name}
        </li>
      ))}
    </ul>
  );
}
