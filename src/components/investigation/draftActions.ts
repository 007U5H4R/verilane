/**
 * What the Investigation action bar, checks card and Next-step callout say
 * about a reminder draft (TASK-15.5, TC-045). Pure, so the copy and the
 * enable/disable rules are unit-tested; the components only render it.
 */
import { formatInr } from "@/domain/money";
import { MANAGER_APPROVAL_THRESHOLD, type Role } from "@/domain/permissions";
import type { Check, Draft } from "@/domain/schema";

/** "8 of 9 passed" — never a single pass/fail verdict (Design.md §13). */
export function checksSummary(checks: Check[]): string {
  return `${checks.filter((c) => c.passed).length} of ${checks.length} passed`;
}

/** Failures first, then passes; each group in check-id order. */
export function orderChecks(checks: Check[]): { failed: Check[]; passed: Check[] } {
  const byId = [...checks].sort((a, b) => a.id - b.id);
  return { failed: byId.filter((c) => !c.passed), passed: byId.filter((c) => c.passed) };
}

export interface CheckFix {
  label: string;
  /** Where the fix lives; absent when the fix is editing the draft. */
  href?: string;
  /** The fix is to edit the draft text (check 9). */
  edit?: boolean;
}

const INVOICE_FACTS: CheckFix = { label: "Review invoice facts", href: "#ev-invoice-facts" };

/** Where to go to fix a failing check, by check id. */
export function checkFix(id: number): CheckFix {
  switch (id) {
    case 6:
      return { label: "Review disputes", href: "/disputes" };
    case 7:
      return { label: "Review payments", href: "/payments" };
    case 9:
      return { label: "Edit draft", edit: true };
    default:
      return INVOICE_FACTS;
  }
}

export interface PrimaryAction {
  label: "Submit for approval" | "Approve & send";
  action: "submit" | "approve";
  enabled: boolean;
  /** Shown inline next to a disabled primary; null when enabled. */
  reason: string | null;
}

const OPEN_FOR_SUBMIT = new Set<Draft["status"]>(["generated", "edited"]);

function failingReason(n: number): string {
  return n === 1 ? "1 pre-approval check is failing" : `${n} pre-approval checks are failing`;
}

function closedReason(status: Draft["status"]): string | null {
  if (status === "sent_simulated") return "This reminder has been sent";
  if (status === "approved") return "Already approved";
  return null;
}

/**
 * The bar's one primary action: an Analyst submits for approval, a Manager
 * approves and sends. `approveWired` is false until the approve flow
 * (TASK-16) is mounted, so the button says so instead of failing silently.
 * `openDispute` is the live dispute state (TASK-16): a dispute opened after
 * validation blocks the primary even though the stored checks predate it.
 * `editing` is true while the draft editor is open with possibly unsaved text.
 */
export function primaryAction(
  role: Role,
  draft: Draft | null,
  opts: { approveWired: boolean; openDispute?: boolean; editing?: boolean },
): PrimaryAction {
  const base =
    role === "manager"
      ? ({ label: "Approve & send", action: "approve" } as const)
      : ({ label: "Submit for approval", action: "submit" } as const);
  const disabled = (reason: string): PrimaryAction => ({ ...base, enabled: false, reason });

  if (!draft) return disabled("Generate a draft first");
  const closed = closedReason(draft.status);
  if (closed) return disabled(closed);
  const failing = draft.checks.filter((c) => !c.passed).length;
  if (failing > 0) return disabled(failingReason(failing));
  if (opts.openDispute) return disabled("This invoice has an open dispute");
  // CR-001: the stored body, not the unsaved text on screen, would go out.
  if (opts.editing) return disabled("Save or cancel your edits first");

  if (base.action === "submit") {
    if (draft.status === "validated") return disabled("Already submitted for approval");
    if (!OPEN_FOR_SUBMIT.has(draft.status)) return disabled("This draft cannot be submitted");
  } else if (!opts.approveWired) {
    return disabled("Available once approval is enabled");
  }
  return { ...base, enabled: true, reason: null };
}

/** Why a draft needs a Manager's approval, or null. Mirrors `requiresManager`. */
function managerWhy(d: Draft): string | null {
  if (d.amount_paise > MANAGER_APPROVAL_THRESHOLD) {
    return `the amount is above ${formatInr(MANAGER_APPROVAL_THRESHOLD)}`;
  }
  if (d.ambiguous_match) return "it rests on an ambiguous payment match";
  if (d.conflicting_payment) return "the payment information conflicts";
  return null;
}

function withoutStop(s: string): string {
  return s.replace(/[.\s]+$/, "");
}

/** One sentence: what has to happen next on this invoice, and why. */
export function nextStep(role: Role, draft: Draft | null): string {
  if (!draft) {
    return "Generate a reminder from this invoice's verified facts, then submit it for approval.";
  }
  if (draft.status === "sent_simulated") {
    return "Reminder sent (simulated). Generate a new draft if another reminder is due.";
  }
  if (draft.status === "approved") return "Approved: the reminder is ready to send.";

  const { failed } = orderChecks(draft.checks);
  const first = failed[0];
  if (first) {
    const which = failed.length === 1 ? "the failing check" : `the ${failed.length} failing checks`;
    return `Resolve ${which} before this reminder can go out. ${first.name}: ${withoutStop(first.reason)}.`;
  }

  const all = `all ${draft.checks.length} pre-approval checks pass`;
  if (role === "manager") return `Approve and send the reminder: ${all}.`;
  if (draft.status === "validated") {
    const why = managerWhy(draft);
    return why
      ? `Waiting for a Manager to approve, because ${why}.`
      : `Waiting for approval: ${all}.`;
  }
  return `Submit the reminder for approval: ${all}.`;
}
