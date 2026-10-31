/**
 * The command core (technical-plan A4.3, TASK-14.3). Pure domain: every
 * workflow mutation goes through `run(cmd, tx)`:
 *
 *   load subject row → `can()` (facts from the stored row) → `transition()`
 *   → writes → exactly one `tx.audit()`.
 *
 * A denial throws `PermissionDenied` before anything is written. The store's
 * `execute()` wraps this in a single read-write transaction, so any throw
 * rolls back the writes and the audit event together.
 */
import { formatInr, paise } from "./money";
import {
  can,
  isRole,
  type Action,
  type Role,
  type Subject,
  type SubjectKind,
} from "./permissions";
import { transition } from "./transitions";

export type Row = Record<string, unknown>;
export type TableName = "invoices" | "drafts" | "disputes" | "reviewItems" | "meta";

export interface Command {
  type: Action;
  subject: { kind: SubjectKind; id: string };
  payload?: Record<string, unknown>;
  actor: Role;
}

export interface AuditEventInput {
  at: string;
  actor_role: Role;
  actor_label: string;
  action: Action;
  /** `${kind}:${id}`, e.g. `invoice:INV-1042`. */
  subject: string;
  subject_kind: SubjectKind;
  subject_id: string;
  /** The invoice this event belongs to, when there is one (Activity log). */
  invoice_id?: string;
  /** Finance-readable one-liner. */
  summary: string;
  before?: Row;
  after?: Row;
  evidence_ids: string[];
}

/** The transaction surface `run()` needs; `src/store/tx.ts` implements it. */
export interface Tx {
  /** `invoices` is looked up by `invoice_id`, the rest by primary key. */
  get(table: TableName, id: string): Promise<Row | undefined>;
  put(table: TableName, row: Row): Promise<void>;
  audit(e: AuditEventInput): Promise<void>;
  /** Event timestamp (ISO). Injected so the domain stays pure. */
  now(): string;
}

export class PermissionDenied extends Error {
  constructor(
    readonly action: Action,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "PermissionDenied";
  }
}

export class InvalidCommand extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommand";
  }
}

export class CommandNotImplemented extends Error {
  constructor(
    readonly action: Action,
    owner: string,
  ) {
    super(`${action} is not available yet (arrives with ${owner}).`);
    this.name = "CommandNotImplemented";
  }
}

export const ROLE_LABEL: Record<Role, string> = {
  analyst: "Analyst",
  manager: "Manager",
};

export const NOTE_MAX_LENGTH = 2000;

const TABLE_FOR: Record<SubjectKind, TableName | null> = {
  invoice: "invoices",
  draft: "drafts",
  dispute: "disputes",
  review: "reviewItems",
  system: null,
};

/** Which subject kind each action applies to. */
const SUBJECT_KIND: Record<Action, SubjectKind> = {
  add_note: "invoice",
  generate_draft: "invoice",
  edit_draft: "draft",
  submit_draft: "draft",
  approve_draft: "draft",
  reject_draft: "draft",
  mark_disputed: "invoice",
  dispute_transition: "dispute",
  resolve_dispute: "dispute",
  dismiss_review: "review",
  action_review: "review",
  import_csv: "system",
  reset_demo: "system",
  switch_role: "system",
  set_as_of: "system",
};

type Effect = {
  summary: string;
  before?: Row;
  after?: Row;
  evidence_ids?: string[];
};

type Ctx = { cmd: Command; row: Row | undefined; tx: Tx; payload: Row };
type Handler = (ctx: Ctx) => Promise<Effect>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const bool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;

/** Permission facts are read from the stored row, never from the caller. */
function subjectFacts(cmd: Command, row: Row | undefined): Subject {
  const s: Subject = { kind: cmd.subject.kind, id: cmd.subject.id };
  if (!row) return s;
  const amount = row.amount_paise;
  if (typeof amount === "number" && Number.isInteger(amount)) {
    s.amount_paise = paise(amount);
  }
  const ambiguous = bool(row.ambiguous_match);
  if (ambiguous !== undefined) s.ambiguous_match = ambiguous;
  const conflict = bool(row.conflicting_payment);
  if (conflict !== undefined) s.conflicting_payment = conflict;
  if (cmd.subject.kind === "review") {
    const k = str(row.kind);
    if (k !== undefined) s.review_kind = k;
  }
  if (isRole(row.requires_role)) s.requires_role = row.requires_role;
  return s;
}

function status(row: Row | undefined): string {
  return str(row?.status) ?? "";
}

/** Applies one or more state-machine events to `row.status` and writes it. */
async function step(
  ctx: Ctx,
  machine: "draft" | "dispute" | "review",
  table: TableName,
  events: string[],
  extra: Row = {},
): Promise<{ from: string; to: string }> {
  const from = status(ctx.row);
  let to = from;
  for (const e of events) to = transition(machine, to, e);
  await ctx.tx.put(table, { ...ctx.row, ...extra, status: to });
  return { from, to };
}

function amountNote(row: Row | undefined): string {
  const a = row?.amount_paise;
  return typeof a === "number" && Number.isInteger(a)
    ? ` for ${formatInr(paise(a))}`
    : "";
}

const notYet =
  (owner: string): Handler =>
  async ({ cmd }) => {
    throw new CommandNotImplemented(cmd.type, owner);
  };

const DRAFT_TEXT_FIELDS = ["subject", "body"] as const;
const DISPUTE_EVENTS = ["start_review", "await_customer", "customer_replied"];

const HANDLERS: Record<Action, Handler> = {
  add_note: async ({ payload }) => {
    const text = (str(payload.text) ?? "").trim();
    if (text === "") throw new InvalidCommand("A note cannot be empty.");
    if (text.length > NOTE_MAX_LENGTH) {
      throw new InvalidCommand(
        `A note can be at most ${NOTE_MAX_LENGTH} characters.`,
      );
    }
    const preview = text.length > 80 ? `${text.slice(0, 79)}…` : text;
    return { summary: `Note added: “${preview}”`, after: { note: text } };
  },

  switch_role: async ({ tx, payload }) => {
    const next = payload.role;
    if (!isRole(next)) throw new InvalidCommand("Unknown role.");
    const current = (await tx.get("meta", "role"))?.value;
    const prev: Role = isRole(current) ? current : "analyst";
    if (prev === next) {
      throw new InvalidCommand(`You are already the ${ROLE_LABEL[next]}.`);
    }
    await tx.put("meta", { key: "role", value: next });
    return {
      summary: `Switched role from ${ROLE_LABEL[prev]} to ${ROLE_LABEL[next]}`,
      before: { role: prev },
      after: { role: next },
    };
  },

  edit_draft: async (ctx) => {
    const changes: Row = {};
    for (const f of DRAFT_TEXT_FIELDS) {
      const v = str(ctx.payload[f]);
      if (v !== undefined) changes[f] = v;
    }
    const { from, to } = await step(ctx, "draft", "drafts", ["edit"], changes);
    return {
      summary: `Edited reminder ${ctx.cmd.subject.id}; it needs re-validation`,
      before: { status: from },
      after: { status: to, ...changes },
    };
  },

  /**
   * Validation outcome comes from the row's `failed_checks` (the nine checks
   * are TASK-15; it will compute them inside this same transaction).
   */
  submit_draft: async (ctx) => {
    const failed = Array.isArray(ctx.row?.failed_checks)
      ? ctx.row.failed_checks.length
      : 0;
    const { from, to } = await step(ctx, "draft", "drafts", [
      failed === 0 ? "validate_pass" : "validate_fail",
    ]);
    return {
      summary:
        to === "validated"
          ? `Reminder ${ctx.cmd.subject.id} passed validation`
          : `Reminder ${ctx.cmd.subject.id} is blocked by ${failed} failed check${failed === 1 ? "" : "s"}`,
      before: { status: from },
      after: { status: to },
    };
  },

  approve_draft: async (ctx) => {
    const { from, to } = await step(ctx, "draft", "drafts", ["approve", "send"]);
    return {
      summary: `Approved reminder ${ctx.cmd.subject.id}${amountNote(ctx.row)} (simulated send)`,
      before: { status: from },
      after: { status: to },
    };
  },

  reject_draft: async (ctx) => {
    const reason = str(ctx.payload.reason)?.trim();
    const extra: Row = reason ? { reject_reason: reason } : {};
    const { from, to } = await step(ctx, "draft", "drafts", ["reject"], extra);
    return {
      summary: `Rejected reminder ${ctx.cmd.subject.id}${reason ? `: ${reason}` : ""}`,
      before: { status: from },
      after: reason ? { status: to, reason } : { status: to },
    };
  },

  dispute_transition: async (ctx) => {
    const event = str(ctx.payload.event);
    if (!event || !DISPUTE_EVENTS.includes(event)) {
      throw new InvalidCommand(
        "Use resolve_dispute to resolve or reject a dispute.",
      );
    }
    const { from, to } = await step(ctx, "dispute", "disputes", [event]);
    return {
      summary: `Dispute ${ctx.cmd.subject.id} moved to ${to.replace(/_/g, " ")}`,
      before: { status: from },
      after: { status: to },
    };
  },

  resolve_dispute: async (ctx) => {
    const outcome = ctx.payload.outcome;
    if (outcome !== "resolved" && outcome !== "rejected") {
      throw new InvalidCommand("Outcome must be resolved or rejected.");
    }
    const event = outcome === "resolved" ? "resolve" : "reject";
    const { from, to } = await step(ctx, "dispute", "disputes", [event]);
    return {
      summary: `Dispute ${ctx.cmd.subject.id} ${to}`,
      before: { status: from },
      after: { status: to },
    };
  },

  dismiss_review: async (ctx) => {
    const { from, to } = await step(ctx, "review", "reviewItems", ["dismiss"]);
    return {
      summary: `Dismissed review item ${ctx.cmd.subject.id}`,
      before: { status: from },
      after: { status: to },
    };
  },

  action_review: async (ctx) => {
    const { from, to } = await step(ctx, "review", "reviewItems", ["action"]);
    return {
      summary: `Actioned review item ${ctx.cmd.subject.id}`,
      before: { status: from },
      after: { status: to },
    };
  },

  generate_draft: notYet("TASK-15"),
  mark_disputed: notYet("TASK-17"),
  import_csv: notYet("TASK-19"),
  reset_demo: notYet("TASK-19"),
  set_as_of: notYet("TASK-19"),
};

function invoiceIdOf(cmd: Command, row: Row | undefined): string | undefined {
  if (cmd.subject.kind === "invoice") return cmd.subject.id;
  return str(row?.invoice_id);
}

/** Runs one command against `tx`. Returns the single audit event written. */
export async function run(cmd: Command, tx: Tx): Promise<AuditEventInput> {
  const expected = SUBJECT_KIND[cmd.type];
  if (cmd.subject.kind !== expected) {
    throw new InvalidCommand(`${cmd.type} applies to a ${expected}.`);
  }
  const table = TABLE_FOR[cmd.subject.kind];
  const row = table ? await tx.get(table, cmd.subject.id) : undefined;
  if (table && !row) {
    throw new InvalidCommand(`No ${cmd.subject.kind} ${cmd.subject.id}.`);
  }

  const permission = can(cmd.actor, cmd.type, subjectFacts(cmd, row));
  if (!permission.allowed) throw new PermissionDenied(cmd.type, permission.reason);

  const effect = await HANDLERS[cmd.type]({
    cmd,
    row,
    tx,
    payload: cmd.payload ?? {},
  });

  const event: AuditEventInput = {
    at: tx.now(),
    actor_role: cmd.actor,
    actor_label: ROLE_LABEL[cmd.actor],
    action: cmd.type,
    subject: `${cmd.subject.kind}:${cmd.subject.id}`,
    subject_kind: cmd.subject.kind,
    subject_id: cmd.subject.id,
    summary: effect.summary,
    evidence_ids: effect.evidence_ids ?? [],
  };
  const invoiceId = invoiceIdOf(cmd, row);
  if (invoiceId !== undefined) event.invoice_id = invoiceId;
  if (effect.before) event.before = effect.before;
  if (effect.after) event.after = effect.after;

  await tx.audit(event);
  return event;
}
