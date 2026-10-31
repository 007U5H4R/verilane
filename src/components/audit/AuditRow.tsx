import type { AuditEventRow } from "@/store/db";

const ACTION_LABEL: Record<string, string> = {
  add_note: "Note",
  generate_draft: "Draft generated",
  edit_draft: "Draft edited",
  submit_draft: "Draft submitted",
  approve_draft: "Draft approved",
  reject_draft: "Draft rejected",
  mark_disputed: "Marked disputed",
  dispute_transition: "Dispute updated",
  resolve_dispute: "Dispute closed",
  dismiss_review: "Review dismissed",
  action_review: "Review actioned",
  import_csv: "CSV imported",
  reset_demo: "Demo reset",
  demo_reset: "Demo reset",
  switch_role: "Role switched",
  set_as_of: "As-of date changed",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

export function formatAt(at: unknown): string {
  const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One read-only audit entry: summary, then actor · action · subject · time. */
export function AuditRow({ event }: { event: AuditEventRow }) {
  const actor = typeof event.actor_label === "string" ? event.actor_label : "—";
  const summary = typeof event.summary === "string" ? event.summary : actionLabel(event.action);
  const at = typeof event.at === "string" ? event.at : undefined;
  return (
    <li
      className="flex flex-col gap-0.5 border-b border-border py-3 text-[13px] last:border-b-0"
      data-testid="audit-row"
      data-action={event.action}
    >
      <span className="text-text">{summary}</span>
      <span className="text-xs text-text-muted">
        <span className="font-semibold">{actor}</span> · {actionLabel(event.action)} ·{" "}
        <span className="font-mono">{event.subject}</span> ·{" "}
        <time dateTime={at}>{formatAt(at)}</time>
      </span>
    </li>
  );
}
