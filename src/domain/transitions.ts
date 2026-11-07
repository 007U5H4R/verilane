/**
 * Workflow state machines (Data-Model). Pure domain: no I/O.
 *
 * - invoice: `active ⇄ disputed` (derived workflow state; source invoice rows
 *   stay immutable).
 * - dispute: `new → under_review → awaiting_customer ⇄ under_review →
 *   resolved | rejected`.
 * - draft: `generated → (edited →)* validated | blocked → approved →
 *   sent_simulated`, `→ rejected` from any pre-approved state; any edit returns
 *   the draft to validation.
 * - review: `open → actioned | dismissed`; `actioned → open` (`reopen`) only
 *   when a Manager reverses an applied allocation (TKT-75.06, EXE140).
 */

type Table = Record<string, Record<string, string>>;

const TABLES = {
  invoice: {
    active: { mark_disputed: "disputed" },
    disputed: { release: "active" },
  },
  dispute: {
    new: { start_review: "under_review" },
    under_review: {
      await_customer: "awaiting_customer",
      resolve: "resolved",
      reject: "rejected",
    },
    awaiting_customer: { customer_replied: "under_review" },
    resolved: {},
    rejected: {},
  },
  draft: {
    generated: {
      edit: "edited",
      validate_pass: "validated",
      validate_fail: "blocked",
      reject: "rejected",
    },
    edited: {
      edit: "edited",
      validate_pass: "validated",
      validate_fail: "blocked",
      reject: "rejected",
    },
    validated: { edit: "edited", approve: "approved", reject: "rejected" },
    blocked: { edit: "edited", reject: "rejected" },
    approved: { send: "sent_simulated" },
    sent_simulated: {},
    rejected: {},
  },
  review: {
    open: { action: "actioned", dismiss: "dismissed" },
    // TKT-75.06: reversing an allocation reopens the item (reason `reversed`).
    actioned: { reopen: "open" },
    dismissed: {},
  },
} satisfies Record<string, Table>;

export type Machine = keyof typeof TABLES;

function describeMachine(t: Table) {
  const states = Object.keys(t);
  const events = [...new Set(Object.values(t).flatMap((m) => Object.keys(m)))];
  return { states, events } as const;
}

/** Declared states and events per machine (for exhaustive tests and UI). */
export const MACHINES: Record<
  Machine,
  { states: readonly string[]; events: readonly string[] }
> = {
  invoice: describeMachine(TABLES.invoice),
  dispute: describeMachine(TABLES.dispute),
  draft: describeMachine(TABLES.draft),
  review: describeMachine(TABLES.review),
};

export class IllegalTransition extends Error {
  constructor(
    readonly machine: Machine,
    readonly from: string,
    readonly event: string,
  ) {
    super(`Cannot ${event.replace(/_/g, " ")} a ${machine} that is ${from.replace(/_/g, " ")}.`);
    this.name = "IllegalTransition";
  }
}

/** Returns the next state, or throws `IllegalTransition`. */
export function transition(
  machine: Machine,
  from: string,
  event: string,
): string {
  const table: Table = TABLES[machine];
  const row = Object.hasOwn(table, from) ? table[from] : undefined;
  const to = row && Object.hasOwn(row, event) ? row[event] : undefined;
  if (to === undefined) throw new IllegalTransition(machine, from, event);
  return to;
}
