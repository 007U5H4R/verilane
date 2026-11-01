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
import { AS_OF_DATE } from "./clock";
import { formatInr, paise } from "./money";
import {
  can,
  isRole,
  type Action,
  type Role,
  type Subject,
  type SubjectKind,
} from "./permissions";
import {
  CustomerSchema,
  DataIssueSchema,
  DisputeTypeSchema,
  InvoiceSchema,
  PaymentSchema,
} from "./schema";
import { transition } from "./transitions";
import { buildDraft, factsFor, locateFootnotes } from "./draft";
import { VerifiedFactSchema, type Extraction, type VerifiedFact } from "./schema";
import { draftContextFor, validate, type DraftSources } from "./validate";

export type Row = Record<string, unknown>;
export type TableName = "invoices" | "drafts" | "disputes" | "reviewItems" | "meta";

/** The source tables a CSV import may replace (TASK-19). */
export const IMPORT_KINDS = ["invoices", "customers", "payments"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/**
 * What the audit log records: normally the command's own action, but a
 * rejected import is logged as `import_rejected` and a reset as
 * `demo_reset` (TKT-14, TC-057 / TC-060).
 */
export type AuditAction = Action | "import_rejected" | "demo_reset" | "validation_failure";

/** `meta` key of the per-browser as-of override (clock.ts `asOf()`). */
export const AS_OF_KEY = "asOf";

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
  action: AuditAction;
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
  /** Whole-table operations (import / reset / re-rank); only the store's
   * transaction provides them. */
  data?: DataOps;
  /** Everything the nine draft checks read (TASK-15); only the store's
   * transaction provides it. */
  draftSources?(): Promise<DraftSources>;
}

/**
 * The bulk operations behind `import_csv`, `reset_demo` and `set_as_of`.
 * Each runs inside the command's transaction, so a throw rolls it back
 * together with the audit event.
 */
export interface DataOps {
  /** Replaces one source table wholesale (for invoices, the data issues
   * too), then recomputes the derived tables. */
  replaceSource(kind: ImportKind, rows: Row[], dataIssues: Row[]): Promise<void>;
  /** Clears every table (the audit log included), keeps the demo role,
   * loads `seed`, then recomputes. Returns row counts for the audit. */
  resetToSeed(seed: unknown, seedVersion: string): Promise<Row>;
  /** Recomputes the derived tables, e.g. after the as-of date moves. */
  recompute(): Promise<void>;
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
  /** Overrides the audited action (defaults to the command's own). */
  action?: AuditAction;
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
    // FS12: an edit re-runs all nine checks on the new text.
    const rechecked = await recheckDraft(ctx, str(changes.body) ?? str(ctx.row?.body));
    const { from, to } = await step(ctx, "draft", "drafts", ["edit"], { ...changes, ...rechecked });
    return {
      summary: rechecked
        ? `Edited reminder ${ctx.cmd.subject.id}; ${passedNote(rechecked)}`
        : `Edited reminder ${ctx.cmd.subject.id}; it needs re-validation`,
      before: { status: from },
      after: rechecked
        ? { status: to, ...changes, failed_checks: rechecked.failed_checks }
        : { status: to, ...changes },
    };
  },

  /**
   * Validation outcome comes from the row's `failed_checks` (the nine checks
   * are TASK-15; it will compute them inside this same transaction).
   */
  submit_draft: async (ctx) => {
    // With the ledger in reach the nine checks are re-run here, in this
    // transaction; otherwise the stored `failed_checks` decide.
    const rechecked = await recheckDraft(ctx, str(ctx.row?.body));
    const stored = rechecked?.failed_checks ?? ctx.row?.failed_checks;
    const failed = Array.isArray(stored) ? stored.length : 0;
    const { from, to } = await step(
      ctx,
      "draft",
      "drafts",
      [failed === 0 ? "validate_pass" : "validate_fail"],
      rechecked ?? {},
    );
    return {
      summary:
        to === "validated"
          ? `Reminder ${ctx.cmd.subject.id} passed validation`
          : `Reminder ${ctx.cmd.subject.id} is blocked by ${failed} failed check${failed === 1 ? "" : "s"}`,
      before: { status: from },
      after: { status: to },
    };
  },

  /**
   * TASK-16: the nine checks are re-run against the live ledger inside this
   * transaction before a draft is approved and sent (simulated). A check
   * that fails now — e.g. a payment since recorded changed the outstanding
   * amount — blocks the approval; the draft stays `validated` with its
   * `failed_checks` refreshed, and the audit event is a `validation_failure`
   * rather than `approve_draft`.
   */
  approve_draft: async (ctx) => {
    // An illegal approval stays an IllegalTransition, whatever the checks say.
    transition("draft", status(ctx.row), "approve");
    const rechecked = await recheckDraft(ctx, str(ctx.row?.body));
    // T16-3: no ledger, no re-validation — never send unchecked.
    if (!rechecked) throw new InvalidCommand("A reminder can only be approved against the ledger.");
    // T16-1: `run()` gated on the stored facts; an ambiguous match or a
    // payment conflict that appeared since makes this Manager-only now.
    const permission = can(ctx.cmd.actor, "approve_draft", {
      ...subjectFacts(ctx.cmd, ctx.row),
      ambiguous_match: rechecked.ambiguous_match === true,
      conflicting_payment: rechecked.conflicting_payment === true,
    });
    if (!permission.allowed) throw new PermissionDenied("approve_draft", permission.reason);
    const failed = rechecked.failed_checks.length;
    if (failed > 0) {
      await ctx.tx.put("drafts", { ...ctx.row, ...rechecked });
      return {
        action: "validation_failure",
        summary: `Reminder ${ctx.cmd.subject.id} failed re-validation on approval (${failed} failed check${failed === 1 ? "" : "s"})`,
        before: { status: status(ctx.row) },
        after: { status: status(ctx.row), failed_checks: rechecked.failed_checks },
      };
    }
    const { from, to } = await step(ctx, "draft", "drafts", ["approve", "send"], rechecked);
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

  generate_draft: (ctx) => generateDraft(ctx),

  /**
   * Opens a Dispute by hand (no source email), so it's bespoke rather than
   * `step()`-based: it creates the row instead of transitioning an existing
   * one. `disputes`' state machine still governs it from here on
   * (dispute_transition / resolve_dispute).
   */
  mark_disputed: async (ctx) => {
    const invoiceId = ctx.cmd.subject.id;
    const customerId = str(ctx.row?.customer_id) ?? "";
    const typeResult = DisputeTypeSchema.safeParse(ctx.payload.type ?? "unknown");
    if (!typeResult.success) {
      throw new InvalidCommand("Choose a valid dispute type.");
    }
    const claimText = (str(ctx.payload.claim_text) ?? "").trim();
    if (claimText === "") {
      throw new InvalidCommand("A dispute needs a reason.");
    }
    // Sanitized, not the raw ISO string: `/disputes/[id]` puts this in a URL
    // path segment, and a literal `:` there breaks Next's PPR dynamic-param
    // substitution (the detail page would 404 on its own freshly-created row).
    const disputeId = `D-manual-${invoiceId}-${ctx.tx.now().replace(/[^0-9A-Za-z]/g, "")}`;
    const dispute: Row = {
      dispute_id: disputeId,
      invoice_id: invoiceId,
      customer_id: customerId,
      type: typeResult.data,
      claim_text: claimText,
      ai_recommendation: "Opened manually; review and resolve or reject.",
      status: "new",
    };
    await ctx.tx.put("disputes", dispute);
    return {
      summary: `Marked invoice ${invoiceId} as disputed${amountNote(ctx.row)}`,
      after: { dispute_id: disputeId, status: "new" },
    };
  },

  import_csv: async ({ tx, payload }) => {
    const kind = payload.kind;
    if (!isImportKind(kind)) {
      throw new InvalidCommand("Choose invoices, customers or payments.");
    }
    const file = str(payload.file_name) ?? "file";

    // A rejected file is still audited (SR11): nothing is written and the
    // event lists why, so this returns instead of throwing.
    if (Array.isArray(payload.errors)) {
      const errors = payload.errors.filter(isRowError);
      if (errors.length === 0) {
        throw new InvalidCommand("A rejected import must list its errors.");
      }
      return {
        action: "import_rejected",
        summary: `Rejected ${file}: ${errors.length} problem${errors.length === 1 ? "" : "s"}, nothing imported`,
        after: { kind, file_name: file, errors },
      };
    }

    const rows = IMPORT_ROW_SCHEMA[kind].safeParse(payload.rows);
    if (!rows.success || rows.data.length === 0) {
      throw new InvalidCommand(`The ${kind} rows are not valid; nothing was imported.`);
    }
    const issues = DataIssueSchema.array().safeParse(payload.data_issues ?? []);
    if (!issues.success) {
      throw new InvalidCommand("The import's data issues are not valid.");
    }
    await dataOps(tx).replaceSource(kind, rows.data as Row[], issues.data as Row[]);
    return {
      summary: `Imported ${rows.data.length} ${kind} from ${file}, replacing the previous ${kind}`,
      after: { kind, file_name: file, rows: rows.data.length },
    };
  },

  reset_demo: async ({ tx, payload }) => {
    const version = str(payload.seed_version);
    if (!version || payload.seed === undefined) {
      throw new InvalidCommand("Reset needs the demo seed.");
    }
    const counts = await dataOps(tx).resetToSeed(payload.seed, version);
    return {
      action: "demo_reset",
      summary: `Reset the demo data to seed ${version}`,
      after: { seed_version: version, ...counts },
    };
  },

  set_as_of: async ({ tx, payload }) => {
    const raw = payload.as_of;
    if (raw !== null && !(typeof raw === "string" && isIsoDay(raw))) {
      throw new InvalidCommand("The as-of date must be a real date (YYYY-MM-DD).");
    }
    const stored = (await tx.get("meta", AS_OF_KEY))?.value;
    const prev = typeof stored === "string" ? stored : AS_OF_DATE;
    const next = raw ?? AS_OF_DATE;
    if (prev === next) {
      throw new InvalidCommand(`The as-of date is already ${next}.`);
    }
    await tx.put("meta", { key: AS_OF_KEY, value: next });
    await dataOps(tx).recompute();
    return {
      summary: `Moved the as-of date from ${prev} to ${next}; the queue was re-ranked`,
      before: { as_of: prev },
      after: { as_of: next },
    };
  },
};

const IMPORT_ROW_SCHEMA = {
  invoices: InvoiceSchema.array(),
  customers: CustomerSchema.array(),
  payments: PaymentSchema.array(),
} as const;

function isImportKind(v: unknown): v is ImportKind {
  return typeof v === "string" && (IMPORT_KINDS as readonly string[]).includes(v);
}

function isRowError(v: unknown): v is Row {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Row;
  return typeof e.field === "string" && typeof e.reason === "string";
}

function isIsoDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function dataOps(tx: Tx): DataOps {
  if (!tx.data) throw new InvalidCommand("Data operations are not available here.");
  return tx.data;
}

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
    action: effect.action ?? cmd.type,
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

// --- Reminder drafts (TASK-15) ----------------------------------------------

/**
 * FS11 (TASK-22): records that a provider's output for one email was
 * rejected. The email itself goes to review as an `uncertain_match` item
 * (`RV-<message_id>-match`, raised by `reviewItemsFor`, since a rejected
 * extraction never matches); this writes the one `validation_failure` audit
 * event that says why. Call it inside the same transaction that stores the
 * rejected row.
 */
export async function recordRejection(
  x: Pick<Extraction, "message_id" | "thread_id" | "rejection_reason">,
  actor: Role,
  tx: Tx,
): Promise<AuditEventInput> {
  const reviewId = `RV-${x.message_id}-match`;
  const event: AuditEventInput = {
    at: tx.now(),
    actor_role: actor,
    actor_label: ROLE_LABEL[actor],
    action: "validation_failure",
    subject: `review:${reviewId}`,
    subject_kind: "review",
    subject_id: reviewId,
    summary: `Email ${x.message_id} could not be read (${x.rejection_reason ?? "extraction rejected"}); sent to review`,
    evidence_ids: [`${x.message_id}:emails.json:status`],
  };
  await tx.audit(event);
  return event;
}

/** A draft in one of these states no longer blocks a new one. */
const CLOSED_DRAFT = new Set(["rejected", "sent_simulated"]);
/** Stop rule for the draft-id probe: no invoice gets this many drafts. */
const MAX_DRAFTS_PER_INVOICE = 500;

type Recheck = Row & { failed_checks: number[] };

function passedNote(r: Recheck): string {
  const total = Array.isArray(r.checks) ? r.checks.length : 9;
  return `${total - r.failed_checks.length} of ${total} checks pass`;
}

function storedFacts(row: Row | undefined): VerifiedFact[] {
  const parsed = VerifiedFactSchema.array().safeParse(row?.facts);
  return parsed.success ? parsed.data : [];
}

/**
 * Re-runs the nine checks for a draft row against the current ledger:
 * footnotes are re-located in `body`, so an edited-away fact loses its
 * citation and check 9 sees whatever replaced it. Null when the tx has no
 * ledger access (pure tests); the stored outcome then stands.
 */
async function recheckDraft(ctx: Ctx, body: string | undefined): Promise<Recheck | null> {
  const invoiceId = str(ctx.row?.invoice_id);
  if (!ctx.tx.draftSources || invoiceId === undefined) return null;
  const sources = await ctx.tx.draftSources();
  const facts = storedFacts(ctx.row);
  const text = body ?? "";
  const footnotes = locateFootnotes(text, facts);
  const context = draftContextFor(invoiceId, sources);
  const checks = validate({ body: text, facts, footnotes }, context);
  return {
    footnotes,
    checks,
    failed_checks: checks.filter((c) => !c.passed).map((c) => c.id),
    ambiguous_match: context.ambiguousMatch,
    conflicting_payment: context.conflictingPayment,
  };
}

/** Builds a reminder for the subject invoice from verified facts only. */
async function generateDraft(ctx: Ctx): Promise<Effect> {
  if (!ctx.tx.draftSources) {
    throw new InvalidCommand("Drafts can only be generated against the ledger.");
  }
  const invoiceId = ctx.cmd.subject.id;

  // Ids are sequential per invoice, so probing them also finds any open draft.
  let draftId: string | undefined;
  for (let n = 1; n <= MAX_DRAFTS_PER_INVOICE; n++) {
    const id = `DR-${invoiceId}-${n}`;
    const existing = await ctx.tx.get("drafts", id);
    if (!existing) {
      draftId = id;
      break;
    }
    if (!CLOSED_DRAFT.has(status(existing))) {
      throw new InvalidCommand(`${invoiceId} already has an open reminder (${id}).`);
    }
  }
  if (draftId === undefined) {
    throw new InvalidCommand(`${invoiceId} has too many reminders.`);
  }

  const sources = await ctx.tx.draftSources();
  const context = draftContextFor(invoiceId, sources);
  if (!context.invoice) throw new InvalidCommand(`No invoice ${invoiceId}.`);
  const outstanding = paise(Math.max(0, context.outstanding));
  const facts = factsFor(context.invoice, context.customer, outstanding, sources.asOf);
  const built = buildDraft(facts);
  const checks = validate({ body: built.body, facts, footnotes: built.footnotes }, context);
  const failed = checks.filter((c) => !c.passed).map((c) => c.id);

  await ctx.tx.put("drafts", {
    draft_id: draftId,
    invoice_id: invoiceId,
    customer_id: context.invoice.customer_id,
    status: "generated",
    subject: built.subject,
    body: built.body,
    facts,
    footnotes: built.footnotes,
    checks,
    failed_checks: failed,
    amount_paise: outstanding,
    ambiguous_match: context.ambiguousMatch,
    conflicting_payment: context.conflictingPayment,
    created_at: ctx.tx.now(),
  });
  return {
    summary: `Generated reminder ${draftId} for ${formatInr(outstanding)}; ${checks.length - failed.length} of ${checks.length} checks pass`,
    after: { draft_id: draftId, status: "generated", failed_checks: failed },
    evidence_ids: [...new Set(facts.map((f) => f.evidenceId))],
  };
}
