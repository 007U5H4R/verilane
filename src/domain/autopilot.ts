/**
 * TASK-41 · Copilot autopilot: simulated auto-send for low-risk reminders.
 * Pure domain, no I/O, light enough for the UI to import.
 *
 * Trust model: Copilot never gets more authority than an Analyst. A draft is
 * auto-sent only when a Manager has switched autopilot on, the draft is
 * awaiting approval with all nine checks passing, its amount is at or under
 * the Manager's cap, and an Analyst could approve it (no ambiguous or
 * conflicting payment, no Manager escalation). Anything else waits for a person.
 */
import { formatInr, paise, type Paise } from "./money";
import { can, MANAGER_APPROVAL_THRESHOLD } from "./permissions";

/** `meta` key of the autopilot policy. */
export const AUTOPILOT_KEY = "autopilot";

/** Copilot's audit label: never presented as a person. */
export const COPILOT_LABEL = "Copilot (autopilot)";

export interface AutopilotPolicy {
  enabled: boolean;
  /** Largest reminder Copilot may send on its own. */
  max_amount_paise: Paise;
}

/** Off by default; ₹50,000 cap when first switched on. */
export const DEFAULT_AUTOPILOT: AutopilotPolicy = {
  enabled: false,
  max_amount_paise: paise(5_000_000),
};

/** The cap can never exceed what an Analyst may approve. */
export const MAX_AUTOPILOT_CAP: Paise = MANAGER_APPROVAL_THRESHOLD;

export function isValidCap(v: unknown): v is Paise {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_AUTOPILOT_CAP;
}

/** Reads a stored policy; anything malformed falls back to the (off) default. */
export function parsePolicy(value: unknown): AutopilotPolicy {
  if (typeof value !== "object" || value === null) return DEFAULT_AUTOPILOT;
  const v = value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    max_amount_paise: isValidCap(v.max_amount_paise) ? v.max_amount_paise : DEFAULT_AUTOPILOT.max_amount_paise,
  };
}

/** The draft facts eligibility reads (a stored row or a parsed Draft). */
export interface AutopilotDraft {
  draft_id?: unknown;
  status?: unknown;
  amount_paise?: unknown;
  failed_checks?: unknown;
  ambiguous_match?: unknown;
  conflicting_payment?: unknown;
  requires_role?: unknown;
}

export type Eligibility =
  | { eligible: true; passed: string[] }
  | { eligible: false; reason: string; passed: string[] };

/**
 * Whether Copilot may send this draft under `policy`. Returns the first
 * reason it may not, plus the gates it passed (the decision trace).
 */
export function autopilotEligibility(draft: AutopilotDraft, policy: AutopilotPolicy): Eligibility {
  const passed: string[] = [];
  const no = (reason: string): Eligibility => ({ eligible: false, reason, passed });

  if (!policy.enabled) return no("Autopilot is off.");
  passed.push("Autopilot is on");

  if (draft.status !== "validated") return no("Not submitted for approval.");
  const failed = Array.isArray(draft.failed_checks) ? draft.failed_checks.length : 0;
  if (failed > 0) return no(`${failed} check${failed === 1 ? "" : "s"} failed.`);
  passed.push("All nine checks pass");

  const amount = draft.amount_paise;
  if (typeof amount !== "number" || !Number.isInteger(amount)) return no("Amount unknown.");
  if (amount > policy.max_amount_paise) {
    return no(`Over the ${formatInr(policy.max_amount_paise)} autopilot cap.`);
  }
  passed.push(`Amount within the ${formatInr(policy.max_amount_paise)} cap`);

  const permission = can("analyst", "approve_draft", {
    kind: "draft",
    id: typeof draft.draft_id === "string" ? draft.draft_id : "",
    amount_paise: paise(amount),
    ambiguous_match: draft.ambiguous_match === true,
    conflicting_payment: draft.conflicting_payment === true,
    ...(draft.requires_role === "manager" ? { requires_role: "manager" as const } : {}),
  });
  if (!permission.allowed) return no(permission.reason);
  passed.push("Within Analyst approval authority");

  return { eligible: true, passed };
}
