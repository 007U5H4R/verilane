/**
 * North Star Metric and its guardrails (TKT-75.07, Discovery §8.1, S42, R8;
 * EXE170–EXE172). Pure: plain rows in, numbers out, no I/O. Every figure is
 * computed from the audit events of the current session; nothing is seeded.
 *
 * NSM = Σ value (paise) of payment exceptions closed by an approved action
 * and not later reversed or reopened, within the current session.
 */
import { actorType } from "./audit/classify";
import { isPaymentExceptionKind, type ExceptionKind } from "./schema";
import { OPEN_DISPUTE } from "./signals";

/** R8 / TC-75.43: shown, verbatim, wherever the NSM figure appears. */
export const NSM_LABEL = "Simulated — one demo session = one analyst-week";
/** Design A1 item 4. */
export const NSM_HEADING = "North Star Metric";

type Row = Record<string, unknown>;

export interface NsmAuditEvent {
  event_id?: number;
  at?: string;
  action: string;
  subject: string;
  actor_role?: unknown;
  actor_label?: unknown;
  invoice_id?: unknown;
  before?: Row;
  /**
   * An Execute-agent write (TKT-75.04, `asExecuteAgent`) carries its
   * PolicyDecision here as `after.policy_decision_id`; the row has no
   * top-level decision field.
   */
  after?: Row;
  evidence_ids?: unknown;
  [key: string]: unknown;
}

export interface NsmInput {
  audit: readonly NsmAuditEvent[];
  payments: readonly { payment_id: string; invoice_id: string | null; amount_paise: number }[];
  exceptions: readonly {
    review_id: string;
    kind: string;
    status: string;
    payment_id?: string;
    candidate_invoice_ids?: readonly string[];
    [key: string]: unknown;
  }[];
  invoices: readonly { invoice_id: string; status: string; amount_paise: number }[];
  disputes: readonly { invoice_id?: string; status: string }[];
  policyDecisions: readonly { decision_id: string; exception_id: string; verdict?: string }[];
}

type ExceptionIn = NsmInput["exceptions"][number];
type ValueOf = (ctx: { event: NsmAuditEvent; exception: ExceptionIn; payments: NsmInput["payments"] }) => number | undefined;

/**
 * Closing actions: an audited action that closes a payment exception, mapped
 * to the value it resolves. Adding a closing kind is one line here — e.g.
 * TKT-75.05's `approve_write_off: (c) => num(c.event.after?.amount_paise)`.
 */
const CLOSING_VALUE: Readonly<Record<string, ValueOf>> = {
  allocate_payment: ({ exception, payments }) =>
    payments.find((p) => p.payment_id === exception.payment_id)?.amount_paise,
};

/** Reminder sends (v1): a human approval, or Copilot under the Manager's autopilot policy. */
const SEND_ACTIONS = new Set(["approve_draft", "autopilot_send"]);
/** Events that start a new session: reset (which also clears the log) and an as-of change. */
const SESSION_BOUNDARY = new Set(["demo_reset", "set_as_of"]);

export interface NsmGuardrails {
  /** Closings (any approved or not) in the session. */
  closings: number;
  /** Of those, how many a later in-session reversal or reopen cancelled. */
  reversedOrReopened: number;
  /** reversedOrReopened ÷ closings; null with no closings. Tracked, lower is better. */
  reversalRate: number | null;
  reminderSends: number;
  /** Sends whose invoice is disputed, paid or an unapplied-cash candidate (current state). Target 0. */
  inappropriateReminders: number;
  inappropriateReminderRate: number | null;
  /** Closings and sends with neither a human actor nor an auto_permitted decision (A1 item 5). Target 0. */
  actionsWithoutApproval: number;
  /** Median ms from raised to resolved over counted closings; null when none is measurable. */
  medianRaisedToResolvedMs: number | null;
  resolutionTimesMeasured: number;
  resolutionTimesUnmeasured: number;
  /** Exceptions whose latest in-session verdict is needs_manager. */
  escalated: number;
  /** Exceptions with at least one in-session Policy evaluation. */
  evaluated: number;
  escalationRate: number | null;
}

export interface NsmResult {
  valuePaise: number;
  resolvedCount: number;
  label: typeof NSM_LABEL;
  /** The boundary event the session starts after; null = the whole log. */
  sessionStartEventId: number | null;
  sessionStartedAt: string | null;
  guardrails: NsmGuardrails;
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);
const eventId = (e: NsmAuditEvent, i: number): number => (typeof e.event_id === "number" ? e.event_id : i);
const subjectId = (subject: string): string | undefined =>
  subject.startsWith("review:") ? subject.slice("review:".length) : undefined;
const timeOf = (iso: unknown): number | undefined => {
  if (typeof iso !== "string") return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const hi = s[mid] ?? 0;
  return s.length % 2 ? hi : ((s[mid - 1] ?? hi) + hi) / 2;
}

const EXECUTE_LABEL = "Execute Agent";

/**
 * Approved (A1 item 5, EXE173). A row that names a PolicyDecision
 * (`after.policy_decision_id`) or is labelled "Execute Agent" is judged by that
 * decision alone: approved only when it is `auto_permitted`. The actor
 * classifier is never consulted for such a row: 79.4 runs Execute as the
 * Analyst, so `actorType()` would call it human. Otherwise: Copilot's
 * `autopilot_send` under the Manager's standing policy (v1 TASK-41), or a
 * human acting under a recorded role (the store only audits a write `can()`
 * allowed; a Manager's approval of a `needs_manager` item carries no decision id).
 */
function isApproved(e: NsmAuditEvent, verdictOf: Map<string, string | undefined>): boolean {
  const decisionId = e.after?.policy_decision_id;
  if (typeof decisionId === "string" || e.actor_label === EXECUTE_LABEL) {
    return typeof decisionId === "string" && verdictOf.get(decisionId) === "auto_permitted";
  }
  if (e.action === "autopilot_send") return true;
  return actorType(e) === "human";
}

interface Closing {
  event: NsmAuditEvent;
  id: number;
  exception: ExceptionIn;
  approved: boolean;
  cancelled: boolean;
  /** When the item was (re)raised: the session start or the reopen before this closing. */
  raisedAt: number | undefined;
}

export function computeNsm(input: NsmInput): NsmResult {
  const ordered = input.audit
    .map((e, i) => ({ e, id: eventId(e, i) }))
    .sort((a, b) => a.id - b.id);

  let startIdx = -1;
  ordered.forEach(({ e }, i) => {
    if (SESSION_BOUNDARY.has(e.action)) startIdx = i;
  });
  const boundary = startIdx >= 0 ? ordered[startIdx] : undefined;
  const session = ordered.slice(startIdx + 1);
  const sessionStart = timeOf(boundary?.e.at);

  const verdictOf = new Map(input.policyDecisions.map((d) => [d.decision_id, d.verdict]));
  const exceptionById = new Map(
    input.exceptions.filter((x) => isPaymentExceptionKind(x.kind as ExceptionKind)).map((x) => [x.review_id, x]),
  );

  const closings: Closing[] = [];
  const bySubject = new Map<string, Closing[]>();
  const raisedBySubject = new Map<string, number | undefined>();
  let actionsWithoutApproval = 0;
  let reminderSends = 0;
  let inappropriateReminders = 0;
  const latestVerdict = new Map<string, string | undefined>();
  const inappropriate = inappropriateInvoices(input);

  for (const { e, id } of session) {
    const review = subjectId(e.subject);

    if (SEND_ACTIONS.has(e.action)) {
      reminderSends++;
      // Judged against CURRENT state (today's invoices, disputes, exceptions),
      // not the state when the reminder was sent: a send that was fine then can
      // read as inappropriate now, and the reverse. A point-in-time check needs
      // a snapshot on the send event (EXE171 limitation, EXE172 follow-up).
      if (typeof e.invoice_id === "string" && inappropriate.has(e.invoice_id)) inappropriateReminders++;
      if (!isApproved(e, verdictOf)) actionsWithoutApproval++;
      continue;
    }

    if (e.action === "policy_evaluated" && review !== undefined) {
      const ids = Array.isArray(e.evidence_ids) ? e.evidence_ids : [];
      const decision = ids.find((x): x is string => typeof x === "string" && verdictOf.has(x));
      if (decision !== undefined) latestVerdict.set(review, verdictOf.get(decision));
      continue;
    }

    if (review === undefined) continue;
    const exception = exceptionById.get(review);

    if (e.action in CLOSING_VALUE) {
      if (!exception) continue;
      const approved = isApproved(e, verdictOf);
      if (!approved) actionsWithoutApproval++;
      const c: Closing = {
        event: e,
        id,
        exception,
        approved,
        cancelled: false,
        raisedAt: raisedBySubject.has(review) ? raisedBySubject.get(review) : sessionStart,
      };
      closings.push(c);
      bySubject.set(review, [...(bySubject.get(review) ?? []), c]);
      continue;
    }

    // A reversal names the closing it undoes; any other actioned → open
    // reopen cancels the latest still-standing closing on the same subject.
    const pointer = e.after?.reverses_event_id;
    const reopens = e.after?.status === "open";
    if (typeof pointer === "number" || reopens) {
      const mine = bySubject.get(review) ?? [];
      const target =
        typeof pointer === "number"
          ? mine.find((c) => c.id === pointer)
          : [...mine].reverse().find((c) => !c.cancelled);
      if (target) target.cancelled = true;
      if (reopens) raisedBySubject.set(review, timeOf(e.at));
    }
  }

  // Counted: the latest standing approved closing per subject, on an item that is still closed.
  let valuePaise = 0;
  let resolvedCount = 0;
  const durations: number[] = [];
  let unmeasured = 0;
  for (const mine of bySubject.values()) {
    const latest = [...mine].reverse().find((c) => !c.cancelled);
    if (!latest || !latest.approved || latest.exception.status !== "actioned") continue;
    const valueOf = CLOSING_VALUE[latest.event.action];
    const value = valueOf?.({ event: latest.event, exception: latest.exception, payments: input.payments });
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    valuePaise += value;
    resolvedCount++;
    const resolvedAt = timeOf(latest.event.at);
    if (latest.raisedAt !== undefined && resolvedAt !== undefined) durations.push(resolvedAt - latest.raisedAt);
    else unmeasured++;
  }

  const verdicts = [...latestVerdict.values()];
  const escalated = verdicts.filter((v) => v === "needs_manager").length;
  const cancelled = closings.filter((c) => c.cancelled).length;

  return {
    valuePaise,
    resolvedCount,
    label: NSM_LABEL,
    sessionStartEventId: boundary ? boundary.id : null,
    sessionStartedAt: typeof boundary?.e.at === "string" ? boundary.e.at : null,
    guardrails: {
      closings: closings.length,
      reversedOrReopened: cancelled,
      reversalRate: ratio(cancelled, closings.length),
      reminderSends,
      inappropriateReminders,
      inappropriateReminderRate: ratio(inappropriateReminders, reminderSends),
      actionsWithoutApproval,
      medianRaisedToResolvedMs: median(durations),
      resolutionTimesMeasured: durations.length,
      resolutionTimesUnmeasured: unmeasured,
      escalated,
      evaluated: verdicts.length,
      escalationRate: ratio(escalated, verdicts.length),
    },
  };
}

/**
 * Invoices a reminder must not go to (Discovery §8.1): disputed, paid, or open
 * unapplied cash could settle them. Built from current rows only, so it says
 * what is inappropriate now, not at send time (see the reminder loop). "Paid" is the source status or a derived
 * outstanding <= 0, the same closed test as priority.ts G1 (`outstandingOf`:
 * amount minus the payments applied to the invoice; unapplied cash never matches).
 */
function inappropriateInvoices(input: NsmInput): Set<string> {
  const out = new Set<string>();
  const applied = new Map<string, number>();
  for (const p of input.payments) {
    if (p.invoice_id !== null) applied.set(p.invoice_id, (applied.get(p.invoice_id) ?? 0) + p.amount_paise);
  }
  for (const inv of input.invoices) {
    if (inv.status === "paid" || inv.amount_paise - (applied.get(inv.invoice_id) ?? 0) <= 0) out.add(inv.invoice_id);
  }
  for (const d of input.disputes) {
    if (d.invoice_id && OPEN_DISPUTE.has(d.status)) out.add(d.invoice_id);
  }
  for (const x of input.exceptions) {
    if (x.kind === "unallocated_payment" && x.status === "open") {
      for (const id of x.candidate_invoice_ids ?? []) out.add(id);
    }
  }
  return out;
}
