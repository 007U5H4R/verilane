/**
 * TASK-38 · The one central mapping from a recorded audit event to how the
 * Audit Log presents it: label, badge tone, icon, module, category and actor
 * type. Every view (table, drawer, KPIs, filters, CSV) reads this module;
 * nothing else decides what an event "is".
 *
 * Exhaustive over `AuditAction` (the type forces a row for every recorded
 * action). Rows the log can't classify — a legacy or malformed row — fall
 * back to a neutral "unknown" description; nothing is ever guessed.
 */
import type { AuditAction } from "@/domain/commands";

export type AuditTone = "success" | "danger" | "warning" | "info" | "dispute" | "neutral";

export type AuditModule = "queue" | "drafts" | "disputes" | "payments" | "settings" | "workspace" | "unknown";

export type AuditCategory = "note" | "draft" | "approval" | "dispute" | "review" | "data" | "workspace" | "unknown";

/** Icon keys; `src/components/audit/icons.tsx` maps each to a lucide icon. */
export type AuditIcon =
  | "note"
  | "draft"
  | "edit"
  | "send"
  | "approve"
  | "reject"
  | "blocked"
  | "flag"
  | "transition"
  | "resolve"
  | "dismiss"
  | "review"
  | "import"
  | "import_rejected"
  | "reset"
  | "role"
  | "clock"
  | "unknown";

/**
 * Who performed an event:
 * - `human` — a person acting in the app under their session role;
 * - `system` — automated processing (e.g. an email extraction rejected by
 *   the pipeline), recorded with the session role it ran under;
 * - `copilot` — Copilot autopilot (TASK-41): a simulated AI send the Manager
 *   switched on, capped at Analyst authority. Its own type, so an AI action is
 *   never presented as a human approval;
 * - `unknown` — the row doesn't say (never assumed to be a person).
 */
export type ActorType = "human" | "system" | "copilot" | "unknown";

export interface ActionMeta {
  label: string;
  tone: AuditTone;
  icon: AuditIcon;
  module: AuditModule;
  category: AuditCategory;
  /** How the actor type is derived for this action. */
  actor: "human" | "system" | "copilot";
}

export const MODULES: Record<AuditModule, { label: string; href: string | null }> = {
  queue: { label: "Queue", href: "/queue" },
  drafts: { label: "Drafts", href: "/drafts" },
  disputes: { label: "Disputes", href: "/disputes" },
  payments: { label: "Payments", href: "/payments" },
  settings: { label: "Settings", href: "/settings" },
  workspace: { label: "Workspace", href: null },
  unknown: { label: "Other", href: null },
};

/** Exhaustive: TypeScript rejects this object if an AuditAction is missing. */
export const ACTION_META: Record<AuditAction, ActionMeta> = {
  add_note: { label: "Note", tone: "neutral", icon: "note", module: "queue", category: "note", actor: "human" },
  generate_draft: { label: "Draft generated", tone: "info", icon: "draft", module: "drafts", category: "draft", actor: "human" },
  edit_draft: { label: "Draft edited", tone: "info", icon: "edit", module: "drafts", category: "draft", actor: "human" },
  submit_draft: { label: "Draft submitted", tone: "info", icon: "send", module: "drafts", category: "draft", actor: "human" },
  approve_draft: { label: "Draft approved", tone: "success", icon: "approve", module: "drafts", category: "approval", actor: "human" },
  reject_draft: { label: "Draft rejected", tone: "danger", icon: "reject", module: "drafts", category: "approval", actor: "human" },
  validation_failure: {
    label: "Approval blocked: checks failed",
    tone: "warning",
    icon: "blocked",
    module: "drafts",
    category: "approval",
    actor: "human",
  },
  mark_disputed: { label: "Marked disputed", tone: "dispute", icon: "flag", module: "disputes", category: "dispute", actor: "human" },
  dispute_transition: { label: "Dispute updated", tone: "dispute", icon: "transition", module: "disputes", category: "dispute", actor: "human" },
  resolve_dispute: { label: "Dispute closed", tone: "success", icon: "resolve", module: "disputes", category: "dispute", actor: "human" },
  assign_dispute: { label: "Dispute assigned", tone: "dispute", icon: "role", module: "disputes", category: "dispute", actor: "human" },
  dismiss_review: { label: "Review dismissed", tone: "neutral", icon: "dismiss", module: "payments", category: "review", actor: "human" },
  action_review: { label: "Review actioned", tone: "success", icon: "review", module: "payments", category: "review", actor: "human" },
  reconcile_flag: { label: "Reconciliation step", tone: "warning", icon: "flag", module: "payments", category: "review", actor: "human" },
  reconcile_decide: { label: "Reconciliation decided", tone: "info", icon: "review", module: "payments", category: "review", actor: "human" },
  allocate_payment: { label: "Payment allocated", tone: "success", icon: "review", module: "payments", category: "review", actor: "human" },
  import_csv: { label: "CSV imported", tone: "info", icon: "import", module: "settings", category: "data", actor: "human" },
  import_rejected: { label: "CSV rejected", tone: "danger", icon: "import_rejected", module: "settings", category: "data", actor: "human" },
  reset_demo: { label: "Demo reset", tone: "warning", icon: "reset", module: "settings", category: "data", actor: "human" },
  demo_reset: { label: "Demo reset", tone: "warning", icon: "reset", module: "settings", category: "data", actor: "human" },
  switch_role: { label: "Role switched", tone: "neutral", icon: "role", module: "workspace", category: "workspace", actor: "human" },
  set_as_of: { label: "As-of date changed", tone: "neutral", icon: "clock", module: "settings", category: "data", actor: "human" },
  set_autopilot: { label: "Autopilot policy changed", tone: "neutral", icon: "role", module: "settings", category: "workspace", actor: "human" },
  autopilot_send: { label: "Auto-sent by Copilot", tone: "success", icon: "send", module: "drafts", category: "approval", actor: "copilot" },
  autopilot_held: { label: "Held for review by Copilot", tone: "warning", icon: "blocked", module: "drafts", category: "approval", actor: "copilot" },
  recommend_generated: { label: "Recommend Agent generated facts", tone: "info", icon: "review", module: "payments", category: "review", actor: "system" },
  policy_evaluated: { label: "Policy Agent evaluated exception", tone: "info", icon: "review", module: "payments", category: "review", actor: "system" },
};

/**
 * `validation_failure` has two sources: an approval blocked on re-validation
 * (subject `draft:…`, a person clicked Approve) and `recordRejection()` — an
 * email the extraction pipeline couldn't read (subject `review:…`), which is
 * automated processing.
 */
const EXTRACTION_REJECTED: ActionMeta = {
  label: "Email extraction rejected",
  tone: "warning",
  icon: "blocked",
  module: "payments",
  category: "review",
  actor: "system",
};

const UNKNOWN_META: Omit<ActionMeta, "label"> = {
  tone: "neutral",
  icon: "unknown",
  module: "unknown",
  category: "unknown",
  actor: "human",
};

export function isAuditAction(action: unknown): action is AuditAction {
  return typeof action === "string" && Object.hasOwn(ACTION_META, action);
}

/** The minimal shape the mapping reads; an `AuditEventRow` satisfies it. */
export interface ClassifiableEvent {
  action: string;
  subject_kind?: unknown;
  actor_role?: unknown;
  actor_label?: unknown;
}

/** The presentation of one event; never throws, never guesses. */
export function describe(event: ClassifiableEvent): ActionMeta & { known: boolean } {
  if (event.action === "validation_failure" && event.subject_kind === "review") {
    return { ...EXTRACTION_REJECTED, known: true };
  }
  if (isAuditAction(event.action)) return { ...ACTION_META[event.action], known: true };
  return { ...UNKNOWN_META, label: event.action.replace(/_/g, " "), known: false };
}

/** A label for a bare action string (dropdowns, the Activity log). */
export function labelFor(action: string): string {
  return isAuditAction(action) ? ACTION_META[action].label : action.replace(/_/g, " ");
}

const ROLE_NAMES: Record<string, string> = { analyst: "Analyst", manager: "Manager" };

/**
 * Actor type, from the event alone. A known human action needs a recorded
 * role; without one the actor is `unknown`, not assumed to be a person.
 */
export function actorType(event: ClassifiableEvent): ActorType {
  const meta = describe(event);
  if (!meta.known) return typeof event.actor_role === "string" && event.actor_role in ROLE_NAMES ? "human" : "unknown";
  if (meta.actor === "system") return "system";
  if (meta.actor === "copilot") return "copilot";
  return typeof event.actor_role === "string" && event.actor_role in ROLE_NAMES ? "human" : "unknown";
}

export interface ActorView {
  type: ActorType;
  /** Who, as shown in the User column. */
  name: string;
  /** The recorded role, as a label; `null` when not recorded. */
  role: string | null;
  /** The filter key (`analyst` | `manager` | `system` | `copilot` | `unknown`). */
  key: string;
}

export function actorOf(event: ClassifiableEvent): ActorView {
  const type = actorType(event);
  const role =
    typeof event.actor_label === "string" && event.actor_label
      ? event.actor_label
      : typeof event.actor_role === "string"
        ? (ROLE_NAMES[event.actor_role] ?? null)
        : null;
  if (type === "system") return { type, name: "System", role, key: "system" };
  if (type === "copilot") return { type, name: "Copilot", role, key: "copilot" };
  if (type === "unknown") return { type, name: "Not recorded", role, key: "unknown" };
  return { type, name: role ?? "Not recorded", role, key: String(event.actor_role) };
}

export const ACTOR_TYPE_LABEL: Record<ActorType, string> = {
  human: "User",
  system: "System (automated processing)",
  copilot: "Copilot (AI, simulated autopilot)",
  unknown: "Not recorded",
};
