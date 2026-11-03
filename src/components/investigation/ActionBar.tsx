"use client";

import { Button } from "@/components/ui/button";
import type { Role } from "@/domain/permissions";
import type { Draft } from "@/domain/schema";
import { primaryAction } from "./draftActions";

export interface ActionBarProps {
  role: Role;
  /** The current draft; null when there is none, undefined while loading. */
  draft: Draft | null | undefined;
  busy?: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  /** Wired by the approve flow (TASK-16); absent, Approve & send is disabled. */
  onApprove?: () => void;
  /** Wired by disputes (TASK-17); absent, Mark disputed is disabled. */
  onMarkDisputed?: () => void;
  /** The invoice has an open dispute right now (TASK-16): blocks the primary inline. */
  openDispute?: boolean;
  /** The draft editor is open (CR-001): blocks the primary until saved or cancelled. */
  editing?: boolean;
}

const EDITABLE = new Set<Draft["status"]>(["generated", "edited", "validated", "blocked"]);

/**
 * The Investigation action bar (TASK-15.5, TC-045): right-aligned pills,
 * secondaries first, exactly one primary. A disabled action says why inline,
 * next to it, not only in a tooltip.
 */
export function ActionBar({ role, draft, busy = false, onEdit, onSubmit, onApprove, onMarkDisputed, openDispute = false, editing = false }: ActionBarProps) {
  const loading = draft === undefined;
  const primary = primaryAction(role, draft ?? null, { approveWired: onApprove !== undefined, openDispute, editing });
  const primaryDisabled = loading || busy || !primary.enabled;
  const editable = !!draft && EDITABLE.has(draft.status);

  function onPrimary() {
    if (primaryDisabled) return;
    if (primary.action === "approve") onApprove?.();
    else onSubmit();
  }

  return (
    <div className="mb-4 flex flex-col items-end gap-1" data-testid="action-bar">
      <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Invoice actions">
        <Button
          variant="outline"
          className="rounded-full"
          onClick={onMarkDisputed}
          disabled={!onMarkDisputed}
          aria-describedby={onMarkDisputed ? undefined : "dispute-reason"}
        >
          Mark disputed
        </Button>
        <Button variant="outline" className="rounded-full" onClick={onEdit} disabled={!editable || busy}>
          Edit draft
        </Button>
        {/* aria-disabled (not disabled) keeps the primary focusable, so its reason stays reachable. */}
        <Button
          className={primaryDisabled ? "cursor-not-allowed rounded-full opacity-50" : "rounded-full"}
          data-testid="primary-action"
          onClick={onPrimary}
          aria-disabled={primaryDisabled}
          aria-describedby={primary.reason && !loading ? "primary-reason" : undefined}
        >
          {primary.label}
        </Button>
      </div>
      {primary.reason && !loading ? (
        <p id="primary-reason" className="text-xs text-text-muted" data-testid="primary-reason">
          Unavailable: {primary.reason}
        </p>
      ) : null}
      {onMarkDisputed ? null : (
        <p id="dispute-reason" className="text-xs text-text-muted">
          Mark disputed: Available once disputes are enabled
        </p>
      )}
    </div>
  );
}
