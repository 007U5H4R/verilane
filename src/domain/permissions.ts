import { paise, type Paise } from "./money";

/**
 * Role-based permissions (Solution-PRD S4, A6). Pure domain: no I/O.
 * `can()` is the single source of truth for both the UI (disabled controls
 * with a reason) and the command core (which refuses denied commands).
 */

export const ROLES = ["analyst", "manager"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "add_note",
  "generate_draft",
  "edit_draft",
  "submit_draft",
  "approve_draft",
  "reject_draft",
  "mark_disputed",
  "dispute_transition",
  "resolve_dispute",
  "assign_dispute",
  "dismiss_review",
  "action_review",
  "reconcile_flag",
  "reconcile_decide",
  "allocate_payment",
  "import_csv",
  "reset_demo",
  "switch_role",
  "set_as_of",
  "set_autopilot",
  "autopilot_send",
] as const;
export type Action = (typeof ACTIONS)[number];

export type SubjectKind = "invoice" | "dispute" | "draft" | "review" | "system";

/**
 * What an action is applied to, plus the facts the permission rules read.
 * The command core fills the facts from the stored row, never from a caller.
 */
export type Subject = {
  kind: SubjectKind;
  id: string;
  /** Reminder amount for a draft. */
  amount_paise?: Paise;
  /** The draft rests on an ambiguous payment match. */
  ambiguous_match?: boolean;
  /** The draft has conflicting payment information. */
  conflicting_payment?: boolean;
  /** Review item kind, e.g. "reconciliation". */
  review_kind?: string;
  /** An item explicitly escalated to a role. */
  requires_role?: Role;
};

export type Permission = { allowed: true } | { allowed: false; reason: string };

/** Reminders strictly above ₹5,00,000 need a Manager (S4). */
export const MANAGER_APPROVAL_THRESHOLD: Paise = paise(50_000_000);

const ALLOW: Permission = { allowed: true };
const deny = (reason: string): Permission => ({ allowed: false, reason });

type Rule = (subject: Subject) => Permission;

/** Analyst-specific restrictions; a Manager may do everything. */
const ANALYST_RULES: Record<Action, Rule> = {
  add_note: () => ALLOW,
  generate_draft: () => ALLOW,
  edit_draft: () => ALLOW,
  submit_draft: () => ALLOW,
  approve_draft: (s) => {
    if (
      s.amount_paise !== undefined &&
      s.amount_paise > MANAGER_APPROVAL_THRESHOLD
    ) {
      return deny("Only a Manager can approve reminders above ₹5,00,000.");
    }
    if (s.ambiguous_match) {
      return deny(
        "Only a Manager can approve a reminder that rests on an ambiguous payment match.",
      );
    }
    if (s.conflicting_payment) {
      return deny(
        "Only a Manager can approve a reminder with conflicting payment information.",
      );
    }
    if (s.requires_role === "manager") {
      return deny("This reminder was escalated to a Manager.");
    }
    return ALLOW;
  },
  reject_draft: () => ALLOW,
  mark_disputed: () => ALLOW,
  dispute_transition: () => ALLOW,
  resolve_dispute: () =>
    deny("Only a Manager can resolve or reject a dispute."),
  assign_dispute: () => ALLOW,
  dismiss_review: (s) => {
    if (s.review_kind === "reconciliation") {
      return deny("Only a Manager can dismiss a reconciliation item.");
    }
    if (s.requires_role === "manager") {
      return deny("This item was escalated to a Manager.");
    }
    return ALLOW;
  },
  action_review: (s) =>
    s.requires_role === "manager"
      ? deny("This item was escalated to a Manager.")
      : ALLOW,
  // TASK-38: workflow steps on a payment claim (request proof, escalate,
  // assign, request a partial / a link for Manager review). They never touch
  // the ledger, so an Analyst may take them even on a Manager-only item.
  reconcile_flag: () => ALLOW,
  reconcile_decide: () =>
    deny("Only a Manager can verify or reject a payment claim."),
  // TKT-75.02: an Analyst allocates unapplied cash to the invoice it settles,
  // unless the item was escalated to a Manager.
  allocate_payment: (s) =>
    s.requires_role === "manager"
      ? deny("This item was escalated to a Manager.")
      : ALLOW,
  import_csv: () => ALLOW,
  reset_demo: () => ALLOW,
  switch_role: () => ALLOW,
  set_as_of: () => ALLOW,
  set_autopilot: () => deny("Only a Manager can change Copilot autopilot."),
  // TASK-41: whichever role has the app open, the handler caps Copilot at
  // Analyst authority (autopilotEligibility), so the role grants nothing here.
  autopilot_send: () => ALLOW,
};

export function can(role: Role, action: Action, subject: Subject): Permission {
  if (role === "manager") return ALLOW;
  return ANALYST_RULES[action](subject);
}

export function isRole(value: unknown): value is Role {
  return value === "analyst" || value === "manager";
}

export function isAction(value: unknown): value is Action {
  return (ACTIONS as readonly unknown[]).includes(value);
}
