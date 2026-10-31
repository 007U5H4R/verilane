import type { ReactNode } from "react";

/** A titled empty state with an optional body and action (TASK-9.4). */
export function EmptyState({
  title,
  children,
  action,
  state = "empty",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** `data-state` value, so tests can tell the empty variants apart. */
  state?: string;
}) {
  return (
    <div data-state={state} className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-6">
      <h2 className="font-semibold text-text">{title}</h2>
      {children && <p className="text-[13px] text-text-muted">{children}</p>}
      {action}
    </div>
  );
}
