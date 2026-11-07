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
import {
  AUTOPILOT_KEY,
  autopilotEligibility,
  COPILOT_LABEL,
  isValidCap,
  MAX_AUTOPILOT_CAP,
  parsePolicy,
} from "./autopilot";
import {
  AS_OF_KEY,
  IMPORT_KINDS,
  InvalidCommand,
  NOTE_MAX_LENGTH,
  PermissionDenied,
  ROLE_LABEL,
  type ImportKind,
} from "./commandConstants";
import { formatInr, paise } from "./money";
import { POLICY_VERDICTS, policyInputFingerprint, type PolicyVerdict } from "./policy";
import type { RecommendConfidence } from "./recommend";
import type { PolicyDecisionRow } from "@/store/db";
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
import {
  closingOutcome,
  isDisputeReviewer,
  isResolutionCode,
  RESOLUTION_LABELS,
} from "./disputes/model";
import { buildDraft, factsFor, locateFootnotes } from "./draft";
import { VerifiedFactSchema, type Extraction, type VerifiedFact } from "./schema";
import { draftContextFor, validate, type DraftSources } from "./validate";

export {
  AS_OF_KEY,
  CommandNotImplemented,
  IMPORT_KINDS,
  InvalidCommand,
  NOTE_MAX_LENGTH,
  PermissionDenied,
  ROLE_LABEL,
  type ImportKind,
} from "./commandConstants";

export type Row = Record<string, unknown>;
export type TableName = "invoices" | "drafts" | "disputes" | "exceptions" | "payments" | "meta";


/**
 * What the audit log records: normally the command's own action, but a
 * rejected import is logged as `import_rejected` and a reset as
 * `demo_reset` (TKT-14, TC-057 / TC-060).
 */
export type AuditAction =
  | Action
  | "import_rejected"
  | "demo_reset"
  | "validation_failure"
  | "autopilot_held"
  // TKT-75.03: written by the Recommend/Policy agents (`policy.ts`), not a user command.
  | "recommend_generated"
  | "policy_evaluated"
  // TKT-75.06: a refused attempt at a command in AUDITED_REFUSALS (FS21, EXE141).
  // TKT-75.04 writes the same action for a policy-gated refusal (EXE182).
  | "permission_denied";


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
  /** The newest audit event with `action` on `subject` (TKT-75.06); only the
   * store's transaction provides it. */
  latestAudit?(subject: string, action: AuditAction): Promise<(Row & { event_id: number }) | undefined>;
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


const TABLE_FOR: Record<SubjectKind, TableName | null> = {
  invoice: "invoices",
  draft: "drafts",
  dispute: "disputes",
  review: "exceptions",
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
  assign_dispute: "dispute",
  dismiss_review: "review",
  action_review: "review",
  reconcile_flag: "review",
  reconcile_decide: "review",
  allocate_payment: "review",
  reverse_allocation: "review",
  import_csv: "system",
  reset_demo: "system",
  switch_role: "system",
  set_as_of: "system",
  set_autopilot: "system",
  autopilot_send: "draft",
};

type Effect = {
  /** Overrides the audited action (defaults to the command's own). */
  action?: AuditAction;
  /** Overrides the audited actor label (TASK-41: Copilot, never a person). */
  actor_label?: string;
  summary: string;
  before?: Row;
  after?: Row;
  evidence_ids?: string[];
  /** Overrides the audited invoice (defaults to the subject row's). */
  invoice_id?: string;
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
const CLOSED_DISPUTE: ReadonlySet<string> = new Set(["resolved", "rejected"]);

/** An optional free-text field: trimmed, capped, `undefined` when blank. */
function optionalText(v: unknown, what: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new InvalidCommand(`${what} must be text.`);
  const text = v.trim();
  if (text === "") return undefined;
  if (text.length > NOTE_MAX_LENGTH) {
    throw new InvalidCommand(`${what} can be at most ${NOTE_MAX_LENGTH} characters.`);
  }
  return text;
}

/**
 * Validates `resolve_dispute`'s optional `resolution` payload (TASK-38).
 * The outcome code must agree with the closing outcome and notes are
 * required. "Payment reconciled" needs a real ledger payment for the
 * disputed invoice: a customer saying they paid is never proof.
 */
async function resolutionRecord(
  ctx: Ctx,
  outcome: "resolved" | "rejected",
): Promise<{ record: Row; label: string }> {
  const r = ctx.payload.resolution;
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    throw new InvalidCommand("A resolution needs an outcome and notes.");
  }
  const res = r as Row;
  const code = res.code;
  if (!isResolutionCode(code)) throw new InvalidCommand("Choose a resolution outcome.");
  if (closingOutcome(code) !== outcome) {
    throw new InvalidCommand("That outcome does not match how the dispute is being closed.");
  }
  const notes = optionalText(res.notes, "Resolution notes");
  if (!notes) throw new InvalidCommand("Resolution notes are required.");
  const evidence = optionalText(res.evidence, "Evidence");
  const date = res.date === undefined || res.date === "" ? undefined : res.date;
  if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new InvalidCommand("The resolution date must be a date (YYYY-MM-DD).");
  }
  const reviewer = res.reviewer === undefined || res.reviewer === null ? undefined : res.reviewer;
  if (reviewer !== undefined && !isDisputeReviewer(reviewer)) {
    throw new InvalidCommand("Choose a reviewer from the dispute team.");
  }
  if (code === "payment_reconciled") {
    const invoiceId = str(ctx.row?.invoice_id);
    const sources = ctx.tx.draftSources ? await ctx.tx.draftSources() : undefined;
    const paid =
      invoiceId !== undefined &&
      (sources?.payments ?? []).some((p) => p.invoice_id === invoiceId);
    if (!paid) {
      throw new InvalidCommand(
        "No payment for this invoice is in the ledger. A customer saying they paid is not proof.",
      );
    }
  }
  const record: Row = { code, notes };
  if (evidence) record.evidence = evidence;
  if (date) record.date = date;
  if (reviewer) record.reviewer = reviewer;
  return { record, label: RESOLUTION_LABELS[code] };
}

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

  /**
   * TASK-41: Copilot sends one low-risk reminder on its own (simulated).
   * Re-runs the nine checks against the live ledger and the Manager's policy
   * at Analyst authority. A draft that no longer qualifies is held, with the
   * re-check stored so it is never retried, and waits for a person.
   */
  autopilot_send: async (ctx) => {
    const policy = parsePolicy((await ctx.tx.get("meta", AUTOPILOT_KEY))?.value);
    if (!policy.enabled) throw new InvalidCommand("Copilot autopilot is off.");
    transition("draft", status(ctx.row), "approve");
    const rechecked = await recheckDraft(ctx, str(ctx.row?.body));
    if (!rechecked) throw new InvalidCommand("Copilot can only send against the ledger.");
    const verdict = autopilotEligibility({ ...ctx.row, ...rechecked }, policy);
    const trace = {
      authority: "analyst",
      cap_paise: policy.max_amount_paise,
      checks: passedNote(rechecked),
      passed: verdict.passed,
    };
    if (!verdict.eligible) {
      await ctx.tx.put("drafts", { ...ctx.row, ...rechecked, autopilot_hold: verdict.reason });
      return {
        action: "autopilot_held",
        actor_label: COPILOT_LABEL,
        summary: `Copilot held reminder ${ctx.cmd.subject.id} for a person: ${verdict.reason}`,
        before: { status: status(ctx.row) },
        after: { status: status(ctx.row), autopilot: { ...trace, held: verdict.reason } },
      };
    }
    const { from, to } = await step(ctx, "draft", "drafts", ["approve", "send"], {
      ...rechecked,
      sent_by: "copilot",
    });
    return {
      actor_label: COPILOT_LABEL,
      summary: `Copilot auto-sent reminder ${ctx.cmd.subject.id}${amountNote(ctx.row)} (simulated send)`,
      before: { status: from },
      after: { status: to, autopilot: trace },
    };
  },

  set_autopilot: async ({ tx, payload }) => {
    if (typeof payload.enabled !== "boolean") {
      throw new InvalidCommand("Say whether autopilot is on or off.");
    }
    if (!isValidCap(payload.max_amount_paise)) {
      throw new InvalidCommand(
        `The autopilot cap must be more than ₹0 and at most ${formatInr(MAX_AUTOPILOT_CAP)}.`,
      );
    }
    const prev = parsePolicy((await tx.get("meta", AUTOPILOT_KEY))?.value);
    const next = { enabled: payload.enabled, max_amount_paise: payload.max_amount_paise };
    if (prev.enabled === next.enabled && prev.max_amount_paise === next.max_amount_paise) {
      throw new InvalidCommand("Autopilot is already set that way.");
    }
    await tx.put("meta", { key: AUTOPILOT_KEY, value: next });
    const state = next.enabled ? `on, up to ${formatInr(next.max_amount_paise)}` : "off";
    return {
      summary: `Turned Copilot autopilot ${state}`,
      before: { ...prev },
      after: { ...next },
    };
  },

  reject_draft: async (ctx) => {
    const reason = optionalText(ctx.payload.reason, "A reject reason");
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
    // TASK-38: an optional note, recorded on the audit event only.
    const note = optionalText(ctx.payload.note, "A note");
    const { from, to } = await step(ctx, "dispute", "disputes", [event]);
    return {
      summary: `Dispute ${ctx.cmd.subject.id} moved to ${to.replace(/_/g, " ")}`,
      before: { status: from },
      after: note ? { status: to, note } : { status: to },
    };
  },

  resolve_dispute: async (ctx) => {
    const outcome = ctx.payload.outcome;
    if (outcome !== "resolved" && outcome !== "rejected") {
      throw new InvalidCommand("Outcome must be resolved or rejected.");
    }
    const event = outcome === "resolved" ? "resolve" : "reject";
    // TASK-38: an optional resolution record, validated before any write.
    // It lands on the audit event only; the invoice is never touched.
    const resolution =
      ctx.payload.resolution === undefined
        ? undefined
        : await resolutionRecord(ctx, outcome);
    const { from, to } = await step(ctx, "dispute", "disputes", [event]);
    return {
      summary: `Dispute ${ctx.cmd.subject.id} ${to}${resolution ? `: ${resolution.label}` : ""}`,
      before: { status: from },
      after: resolution ? { status: to, resolution: resolution.record } : { status: to },
    };
  },

  /**
   * TASK-38: sets or clears the dispute's owner, from the fixed synthetic
   * review team only. Writes nothing but `assigned_reviewer`.
   */
  assign_dispute: async (ctx) => {
    const raw = ctx.payload.reviewer;
    if (raw !== null && !isDisputeReviewer(raw)) {
      throw new InvalidCommand("Choose someone from the dispute team.");
    }
    if (CLOSED_DISPUTE.has(status(ctx.row))) {
      throw new InvalidCommand("This dispute is closed.");
    }
    const prev = str(ctx.row?.assigned_reviewer) ?? null;
    if (prev === raw) {
      throw new InvalidCommand(
        raw === null ? "This dispute is already unassigned." : `Already assigned to ${raw}.`,
      );
    }
    const next: Row = { ...ctx.row };
    if (raw === null) delete next.assigned_reviewer;
    else next.assigned_reviewer = raw;
    await ctx.tx.put("disputes", next);
    return {
      summary:
        raw === null
          ? `Dispute ${ctx.cmd.subject.id} unassigned`
          : `Dispute ${ctx.cmd.subject.id} assigned to ${raw}`,
      before: { assigned_reviewer: prev },
      after: { assigned_reviewer: raw },
    };
  },

  dismiss_review: async (ctx) => {
    const { from, to } = await step(ctx, "review", "exceptions", ["dismiss"]);
    return {
      summary: `Dismissed review item ${ctx.cmd.subject.id}`,
      before: { status: from },
      after: { status: to },
    };
  },

  action_review: async (ctx) => {
    const { from, to } = await step(ctx, "review", "exceptions", ["action"]);
    return {
      summary: `Actioned review item ${ctx.cmd.subject.id}`,
      before: { status: from },
      after: { status: to },
    };
  },

  reconcile_flag: (ctx) => reconcileFlag(ctx),
  reconcile_decide: (ctx) => reconcileDecide(ctx),
  allocate_payment: (ctx) => allocatePayment(ctx),
  reverse_allocation: (ctx) => reverseAllocation(ctx),

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
    // CR-002: one open dispute per invoice. "Open" matches useHasOpenDispute
    // (anything not resolved or rejected). Skipped when the tx has no ledger
    // access (pure tests).
    if (ctx.tx.draftSources) {
      const { disputes } = await ctx.tx.draftSources();
      const alreadyOpen = disputes.some(
        (d) => d.invoice_id === invoiceId && d.status !== "resolved" && d.status !== "rejected",
      );
      if (alreadyOpen) {
        throw new InvalidCommand("This invoice already has an open dispute.");
      }
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
    actor_label: effect.actor_label ?? ROLE_LABEL[cmd.actor],
    action: effect.action ?? cmd.type,
    subject: `${cmd.subject.kind}:${cmd.subject.id}`,
    subject_kind: cmd.subject.kind,
    subject_id: cmd.subject.id,
    summary: effect.summary,
    evidence_ids: effect.evidence_ids ?? [],
  };
  const invoiceId = effect.invoice_id ?? invoiceIdOf(cmd, row);
  if (invoiceId !== undefined) event.invoice_id = invoiceId;
  if (effect.before) event.before = effect.before;
  if (effect.after) event.after = effect.after;

  await tx.audit(event);
  return event;
}

// --- Payment allocation (TKT-75.02, EXE125) ---------------------------------

/**
 * Applies an unapplied bank line to the invoice the Analyst picked from the
 * exception's candidates. One ledger write (the payment's `invoice_id`), the
 * exception moves open → actioned, then the derived tables are recomputed in
 * the same transaction, so the invoice's outstanding and its priority (closed
 * at G1 once settled) change with it. Invoice rows themselves are immutable
 * source data: their balance and status are always derived.
 */
async function allocatePayment(ctx: Ctx): Promise<Effect> {
  requireOpen(ctx);
  if (ctx.row?.kind !== "unallocated_payment") {
    throw new InvalidCommand("Only an unallocated payment can be allocated.");
  }
  const paymentId = str(ctx.row.payment_id);
  const candidates = Array.isArray(ctx.row.candidate_invoice_ids)
    ? ctx.row.candidate_invoice_ids.filter((c): c is string => typeof c === "string")
    : [];
  const invoiceId = str(ctx.payload.invoice_id);
  if (invoiceId === undefined || !candidates.includes(invoiceId)) {
    throw new InvalidCommand("Choose one of the candidate invoices for this payment.");
  }
  const payment = paymentId === undefined ? undefined : await ctx.tx.get("payments", paymentId);
  if (!payment) throw new InvalidCommand(`No payment ${paymentId ?? ""} in the ledger.`);
  if (payment.invoice_id !== null) {
    throw new InvalidCommand(`Payment ${paymentId} is already applied to an invoice.`);
  }
  if (!ctx.tx.data) throw new InvalidCommand("Allocation needs the store's transaction.");

  await ctx.tx.put("payments", { ...payment, invoice_id: invoiceId });
  const { from, to } = await step(ctx, "review", "exceptions", ["action"], { invoice_id: invoiceId });
  await ctx.tx.data.recompute();

  return {
    summary: `Allocated payment ${paymentId} (${formatInr(paise(Number(payment.amount_paise)))}) to ${invoiceId}`,
    before: { status: from, invoice_id: null },
    after: { status: to, invoice_id: invoiceId },
    evidence_ids: Array.isArray(ctx.row.evidence_ids) ? (ctx.row.evidence_ids as string[]) : [],
    invoice_id: invoiceId,
  };
}

// --- Allocation reversal (TKT-75.06, EXE140–EXE142) -------------------------

/**
 * The inverse of `allocatePayment`, Manager only. In the same one
 * transaction: the payment's `invoice_id` goes back to null, the derived
 * tables are recomputed (so the invoice's outstanding and status come back),
 * and the exception moves actioned → open (`reopen`) with reason `reversed`
 * and a sticky `reversed` marker. The audit event names the allocation event
 * it reverses. Anything else is refused before a write.
 */
async function reverseAllocation(ctx: Ctx): Promise<Effect> {
  const row = ctx.row ?? {};
  if (row.kind !== "unallocated_payment") {
    throw new InvalidCommand("Only an allocated payment can be reversed.");
  }
  // Throws IllegalTransition unless the item is actioned.
  const to = transition("review", status(row), "reopen");
  const paymentId = str(row.payment_id);
  const invoiceId = str(row.invoice_id);
  const payment = paymentId === undefined ? undefined : await ctx.tx.get("payments", paymentId);
  if (!payment) throw new InvalidCommand(`No payment ${paymentId ?? ""} in the ledger.`);
  if (typeof payment.invoice_id !== "string" || payment.invoice_id !== invoiceId) {
    throw new InvalidCommand(`Payment ${paymentId} is not applied to the invoice this item allocated it to.`);
  }
  if (!ctx.tx.data || !ctx.tx.latestAudit) {
    throw new InvalidCommand("Reversal needs the store's transaction.");
  }
  const subject = `review:${ctx.cmd.subject.id}`;
  const allocation = await ctx.tx.latestAudit(subject, "allocate_payment");
  if (!allocation) throw new InvalidCommand(`No allocation of payment ${paymentId} is in the audit log.`);
  const allocatedTo = (allocation.after as Row | undefined)?.invoice_id;
  if (allocatedTo !== invoiceId) {
    throw new InvalidCommand(`The latest allocation of payment ${paymentId} is not to ${invoiceId ?? "this invoice"}.`);
  }

  await ctx.tx.put("payments", { ...payment, invoice_id: null });
  // The invoice is the allocation's, not the item's: the recompute re-derives
  // the candidates (EXE142).
  const reopened: Row = { ...row, status: to, reopen_reason: "reversed", reversed: true };
  delete reopened.invoice_id;
  await ctx.tx.put("exceptions", reopened);
  await ctx.tx.data.recompute();

  return {
    summary: `Reversed allocation of payment ${paymentId} (${formatInr(paise(Number(payment.amount_paise)))}) from ${invoiceId} (audit event #${allocation.event_id})`,
    before: { status: status(row), invoice_id: invoiceId, payment_id: paymentId },
    after: { status: to, invoice_id: null, reopen_reason: "reversed", reverses_event_id: allocation.event_id },
    evidence_ids: Array.isArray(row.evidence_ids) ? (row.evidence_ids as string[]) : [],
    invoice_id: invoiceId,
  };
}

/** Commands whose refusal is itself audited (FS21, EXE141); v1 denials are not. */
export const AUDITED_REFUSALS: ReadonlySet<Action> = new Set<Action>(["reverse_allocation"]);

/**
 * Records a refused command as one `permission_denied` event. The store runs
 * it in its own transaction after the command's has rolled back, so nothing
 * the command would have written survives — only the refusal.
 *
 * TKT-75.04 (EXE182): a policy-gated `allocate_payment` refusal uses this same
 * format, passing the PolicyDecision it was refused against as `policy`.
 */
export async function recordRefusal(
  cmd: Command,
  denied: PermissionDenied,
  tx: Tx,
  policy?: { decision_id: string },
): Promise<AuditEventInput> {
  const table = TABLE_FOR[cmd.subject.kind];
  const row = table ? await tx.get(table, cmd.subject.id) : undefined;
  const event: AuditEventInput = {
    at: tx.now(),
    actor_role: cmd.actor,
    actor_label: ROLE_LABEL[cmd.actor],
    action: "permission_denied",
    subject: `${cmd.subject.kind}:${cmd.subject.id}`,
    subject_kind: cmd.subject.kind,
    subject_id: cmd.subject.id,
    summary: `Refused ${cmd.type.replace(/_/g, " ")} on ${cmd.subject.id}: ${denied.reason}`,
    after: policy
      ? { refused_action: cmd.type, reason: denied.reason, policy_decision_id: policy.decision_id }
      : { refused_action: cmd.type, reason: denied.reason },
    evidence_ids: policy ? [policy.decision_id] : [],
  };
  // An unallocated payment has no invoice yet; the refused target is the one named.
  const invoiceId = invoiceIdOf(cmd, row) ?? str(cmd.payload?.invoice_id);
  if (invoiceId !== undefined) event.invoice_id = invoiceId;
  await tx.audit(event);
  return event;
}

// --- Payment reconciliation workflow (TASK-38) ------------------------------
//
// Both commands write only the review item and the one audit event. They
// never create or edit a ledger (payments) row, and never change an
// invoice's status or balance: a claim is not proof.

const FLAG_STEPS = [
  "request_proof",
  "bank_verification",
  "escalate",
  "assign",
  "request_partial",
  "request_link",
] as const;
type FlagStep = (typeof FLAG_STEPS)[number];
const FLAG_STATE: Partial<Record<FlagStep, string>> = {
  request_proof: "awaiting_evidence",
  bank_verification: "bank_verification",
  escalate: "manager_review",
  request_partial: "manager_review",
  request_link: "manager_review",
};
const WORKFLOW_FIELDS = [
  "workflow_state",
  "workflow_note",
  "assignee",
  "requested_partial_paise",
  "proposed_invoice_id",
] as const;

function workflowSnapshot(row: Row | undefined): Row {
  const out: Row = {};
  for (const k of WORKFLOW_FIELDS) {
    if (row?.[k] !== undefined) out[k] = row[k];
  }
  if (out.workflow_state === undefined) out.workflow_state = null;
  return out;
}

function requireOpen(ctx: Ctx): void {
  if (status(ctx.row) !== "open") {
    throw new InvalidCommand(`Review item ${ctx.cmd.subject.id} is closed.`);
  }
}

function requiredText(v: unknown, message: string): string {
  const text = (str(v) ?? "").trim();
  if (text === "") throw new InvalidCommand(message);
  if (text.length > NOTE_MAX_LENGTH) {
    throw new InvalidCommand(`Keep it under ${NOTE_MAX_LENGTH} characters.`);
  }
  return text;
}

function clippedText(v: unknown): string | undefined {
  const text = (str(v) ?? "").trim();
  return text === "" ? undefined : text.slice(0, NOTE_MAX_LENGTH);
}

async function sourcesFor(ctx: Ctx): Promise<DraftSources> {
  if (!ctx.tx.draftSources) {
    throw new InvalidCommand("This needs the ledger, which is not available here.");
  }
  return ctx.tx.draftSources();
}

async function reconcileFlag(ctx: Ctx): Promise<Effect> {
  requireOpen(ctx);
  const stepName = ctx.payload.step;
  if (!(FLAG_STEPS as readonly unknown[]).includes(stepName)) {
    throw new InvalidCommand("Unknown reconciliation step.");
  }
  const s = stepName as FlagStep;
  const id = ctx.cmd.subject.id;
  const kind = str(ctx.row?.kind);
  const extra: Row = {};
  const afterExtra: Row = {};
  let summary: string;

  switch (s) {
    case "request_proof":
      summary = `Requested payment proof for ${id}`;
      break;
    case "bank_verification":
      summary = `Sent ${id} for bank verification`;
      break;
    case "escalate":
      extra.workflow_note = requiredText(ctx.payload.note, "Give a reason for the escalation.");
      summary = `Escalated ${id} to a Manager`;
      break;
    case "assign": {
      const assignee = ctx.payload.assignee;
      if (!isRole(assignee)) {
        throw new InvalidCommand("Assign to an Analyst or a Manager.");
      }
      extra.assignee = assignee;
      summary = `Assigned ${id} to ${ROLE_LABEL[assignee]}`;
      break;
    }
    case "request_partial": {
      if (kind !== "reconciliation") {
        throw new InvalidCommand("A partial payment applies to a reconciliation item.");
      }
      const outstanding = ctx.row?.ledger_outstanding_paise;
      const amount = ctx.payload.amount_paise;
      if (typeof outstanding !== "number" || !Number.isInteger(outstanding)) {
        throw new InvalidCommand("The ledger outstanding is not available.");
      }
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > outstanding) {
        throw new InvalidCommand("Enter an amount above zero and no more than the outstanding.");
      }
      extra.requested_partial_paise = amount;
      afterExtra.remaining_paise = outstanding - amount;
      summary = `Requested Manager review of a partial payment of ${formatInr(paise(amount))} on ${id}; ${formatInr(paise(outstanding - amount))} would remain`;
      break;
    }
    case "request_link": {
      if (kind !== "uncertain_match") {
        throw new InvalidCommand("A link request applies to an unmatched email.");
      }
      const invoiceId = str(ctx.payload.invoice_id) ?? "";
      const src = await sourcesFor(ctx);
      const messageId = str(ctx.row?.message_id);
      const match = src.matches.find((m) => m.message_id === messageId);
      const invoice = src.invoices.find((i) => i.invoice_id === invoiceId);
      if (!invoice) throw new InvalidCommand(`No invoice ${invoiceId}.`);
      const customerId = match?.customer_id;
      if (customerId === undefined) {
        throw new InvalidCommand("The sender's customer is unknown, so no link can be proposed.");
      }
      if (invoice.customer_id !== customerId) {
        throw new InvalidCommand(`${invoiceId} belongs to another customer.`);
      }
      extra.proposed_invoice_id = invoiceId;
      summary = `Proposed linking ${id} to ${invoiceId} for Manager review`;
      break;
    }
  }

  const state = FLAG_STATE[s];
  if (state !== undefined) extra.workflow_state = state;
  const note = clippedText(ctx.payload.note);
  if (note !== undefined && extra.workflow_note === undefined) extra.workflow_note = note;

  const before = workflowSnapshot(ctx.row);
  const next = { ...ctx.row, ...extra };
  await ctx.tx.put("exceptions", next);
  return {
    summary,
    before,
    after: { ...workflowSnapshot(next), step: s, ...afterExtra },
  };
}

async function reconcileDecide(ctx: Ctx): Promise<Effect> {
  requireOpen(ctx);
  const id = ctx.cmd.subject.id;
  const before = { status: status(ctx.row), ...workflowSnapshot(ctx.row) };
  const decision = ctx.payload.decision;

  if (decision === "verify") {
    const reference = requiredText(
      ctx.payload.reference,
      "Verification needs evidence: a bank statement line or reference.",
    );
    if (ctx.payload.confirmed !== true) {
      throw new InvalidCommand("Please confirm the verification explicitly.");
    }
    const paymentId = str(ctx.payload.payment_id) ?? "";
    const src = await sourcesFor(ctx);
    const payment = src.payments.find((p) => p.payment_id === paymentId);
    if (!payment) {
      throw new InvalidCommand(`No ledger entry ${paymentId}; only a recorded payment can be verified.`);
    }
    // An unapplied payment (invoice_id null, TASK-79.1) is recorded against no invoice.
    if (payment.invoice_id === null || payment.invoice_id !== str(ctx.row?.invoice_id)) {
      throw new InvalidCommand(`${paymentId} is not recorded against this invoice.`);
    }
    const extra: Row = {
      workflow_state: "verified",
      verified_payment_id: paymentId,
      verified_reference: reference,
    };
    const note = clippedText(ctx.payload.note);
    if (note !== undefined) extra.workflow_note = note;
    const { to } = await step(ctx, "review", "exceptions", ["action"], extra);
    return {
      summary: `Verified ${id} against ledger entry ${paymentId}`,
      before,
      after: { status: to, ...extra },
      evidence_ids: [paymentId],
    };
  }

  if (decision === "reject") {
    const reason = requiredText(ctx.payload.reason, "Give a reason for rejecting the claim.");
    const extra: Row = { workflow_state: "rejected", workflow_note: reason };
    const { to } = await step(ctx, "review", "exceptions", ["dismiss"], extra);
    return {
      summary: `Rejected payment claim ${id}`,
      before,
      after: { status: to, ...extra },
    };
  }

  if (decision === "approve_link") {
    const proposed = str(ctx.row?.proposed_invoice_id);
    if (proposed === undefined) {
      throw new InvalidCommand("There is no proposed invoice to approve.");
    }
    if (ctx.payload.confirmed !== true) {
      throw new InvalidCommand("Please confirm the link explicitly.");
    }
    const extra: Row = { workflow_state: "verified", linked_invoice_id: proposed };
    const { to } = await step(ctx, "review", "exceptions", ["action"], extra);
    return {
      summary: `Approved linking ${id} to ${proposed}`,
      before,
      after: { status: to, ...extra },
      evidence_ids: [proposed],
    };
  }

  throw new InvalidCommand("The decision must be verify, reject or approve_link.");
}

// --- Reminder drafts (TASK-15) ----------------------------------------------

/**
 * FS11 (TASK-22): records that a provider's output for one email was
 * rejected. The email itself goes to review as an `uncertain_match` item
 * (`RV-<message_id>-match`, raised by `exceptionsFor`, since a rejected
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

// --- Execute agent (TKT-75.04, D75-1, EXE180–EXE182) -------------------------
//
// Stage 3. Execute never computes a verdict: it reads the latest PERSISTED
// PolicyDecision (R6) and, only for `auto_permitted`, writes through `run()`
// (R11) — the same `allocate_payment` handler, permission check and single
// audit event a human submit uses. The audit keeps action `allocate_payment`
// (so reversal and the NSM find it) and is re-labelled to the agent, citing
// the decision id and config_version.

/** The audit `actor_label` of every Execute-agent write. */
export const EXECUTE_LABEL = "Execute Agent";

/** What Execute and the gated submit read, inside the command's transaction. */
export interface PolicyFacts {
  /** The latest persisted PolicyDecision for the exception, if any. */
  latest: PolicyDecisionRow | undefined;
  /** The exception's audit events (`review:<id>`), any order. */
  history: Array<{ event_id?: number; action: string; after?: Row }>;
}

/** `Tx` plus the persisted policy facts; `src/store/tx.ts` implements it. */
export interface PolicyTx extends Tx {
  policyFacts(exceptionId: string): Promise<PolicyFacts>;
}

export interface ExecuteAgentInput {
  subject: { kind: "review"; id: string };
  /** `policyInputsFor(detail).fingerprint`: the inputs as the caller sees them
   * now. A latest decision with another fingerprint is stale (risk a). */
  expected_fingerprint: string;
  /** Any verdict the caller holds in memory. Deliberately ignored (R6). */
  observed?: unknown;
}

export type HandoffQueue = "analyst" | "manager" | "blocked";

/** Where a non-permitted verdict goes instead of a write. */
export const HANDOFF_QUEUE: Record<Exclude<PolicyVerdict, "auto_permitted">, HandoffQueue> = {
  needs_analyst: "analyst",
  needs_manager: "manager",
  blocked: "blocked",
};

export type ExecuteOutcome =
  | { kind: "executed"; decision_id: string; config_version: string; event: AuditEventInput }
  | { kind: "handed_off"; decision_id: string; verdict: PolicyVerdict; queue: HandoffQueue; reason: string }
  | { kind: "refused"; reason: string }
  | { kind: "not_applicable"; reason: string };

/**
 * Risk (b), EXE181: true when an `allocate_payment` event in `history` has a
 * later event whose `after.reverses_event_id` points at it. Paired by id, not
 * by a sticky `reversed` flag on the exception.
 */
export function hasReversedAllocation(history: PolicyFacts["history"]): boolean {
  const allocations = new Set(
    history.filter((e) => e.action === "allocate_payment" && typeof e.event_id === "number").map((e) => e.event_id),
  );
  return history.some((e) => {
    const target = e.after?.reverses_event_id;
    return typeof target === "number" && allocations.has(target);
  });
}

/** A stored decision with every field Execute relies on present and in-enum. */
interface ActionableDecision {
  decision_id: string;
  config_version: string;
  verdict: PolicyVerdict;
  reason: string;
  confidence: RecommendConfidence | undefined;
  input_fingerprint: string;
}

const CONFIDENCES: readonly unknown[] = ["high", "low"] satisfies RecommendConfidence[];

/** `undefined` for a malformed row: it is refused, never acted on. */
function actionable(d: PolicyDecisionRow): ActionableDecision | undefined {
  const { decision_id, config_version, verdict, reason, confidence, input_fingerprint } = d;
  if (typeof config_version !== "string" || typeof reason !== "string" || typeof input_fingerprint !== "string") {
    return undefined;
  }
  if (!(POLICY_VERDICTS as readonly unknown[]).includes(verdict)) return undefined;
  if (confidence !== null && confidence !== undefined && !CONFIDENCES.includes(confidence)) return undefined;
  return {
    decision_id,
    config_version,
    verdict: verdict as PolicyVerdict,
    reason,
    confidence: (confidence ?? undefined) as RecommendConfidence | undefined,
    input_fingerprint,
  };
}

type CurrentDecision =
  | { ok: true; row: Row; decision: ActionableDecision; facts: PolicyFacts }
  | { ok: false; closed: boolean; reason: string };

/**
 * The persisted decision Execute or a gated submit may act on, or why none.
 * Stale (risk a) when its fingerprint differs from the caller's current
 * inputs OR from the inputs re-read inside this transaction (amount,
 * candidates, kind) — so a row written before an import is never trusted.
 */
async function currentDecision(id: string, expected: string, tx: PolicyTx): Promise<CurrentDecision> {
  const row = await tx.get("exceptions", id);
  if (!row) return { ok: false, closed: true, reason: `No review ${id}.` };
  if (row.status !== "open") return { ok: false, closed: true, reason: "Already resolved" };
  if (row.kind !== "unallocated_payment") {
    return { ok: false, closed: true, reason: "Only an unallocated payment can be allocated." };
  }
  const facts = await tx.policyFacts(id);
  if (!facts.latest) return { ok: false, closed: false, reason: "No policy decision yet; nothing to execute." };
  const decision = actionable(facts.latest);
  if (!decision) return { ok: false, closed: false, reason: `Policy decision ${facts.latest.decision_id} is malformed.` };
  const paymentId = str(row.payment_id);
  const payment = paymentId === undefined ? undefined : await tx.get("payments", paymentId);
  if (!payment) return { ok: false, closed: false, reason: `No payment ${paymentId ?? ""} in the ledger.` };
  const now = policyInputFingerprint(
    {
      exception: { kind: "unallocated_payment", candidate_invoice_ids: row.candidate_invoice_ids as string[] | undefined },
      amountPaise: Number(payment.amount_paise),
      confidence: decision.confidence,
    },
    decision.config_version,
  );
  if (decision.input_fingerprint !== expected || decision.input_fingerprint !== now) {
    return { ok: false, closed: false, reason: `Policy decision ${decision.decision_id} is out of date; re-evaluate first.` };
  }
  return { ok: true, row, decision, facts };
}

/** Re-labels the one audit event `run()` writes as the Execute agent's. */
function asExecuteAgent(tx: PolicyTx, decision: ActionableDecision): Tx {
  return {
    ...tx,
    async audit(e) {
      await tx.audit({
        ...e,
        actor_label: EXECUTE_LABEL,
        summary: `${e.summary} · policy ${decision.config_version} (${decision.decision_id})`,
        after: { ...e.after, policy_decision_id: decision.decision_id, config_version: decision.config_version },
        evidence_ids: [decision.decision_id, ...e.evidence_ids.filter((x) => x !== decision.decision_id)],
      });
    },
  };
}

/**
 * Stage 3. Acts on the persisted verdict only: `auto_permitted` allocates the
 * single candidate through `run()`; every other verdict is handed off with
 * the policy's reason and writes nothing. The actor is the Analyst role —
 * Execute's authority is capped at what an Analyst may do (as Copilot's is),
 * and the audit label names the agent.
 */
export async function runExecuteAgent(input: ExecuteAgentInput, tx: PolicyTx): Promise<ExecuteOutcome> {
  const current = await currentDecision(input.subject.id, input.expected_fingerprint, tx);
  if (!current.ok) return { kind: current.closed ? "not_applicable" : "refused", reason: current.reason };
  const { row, decision, facts } = current;
  if (decision.verdict !== "auto_permitted") {
    return {
      kind: "handed_off",
      decision_id: decision.decision_id,
      verdict: decision.verdict,
      queue: HANDOFF_QUEUE[decision.verdict],
      reason: decision.reason,
    };
  }
  if (hasReversedAllocation(facts.history)) {
    return { kind: "refused", reason: "A Manager reversed this allocation; it stays with a human." };
  }
  const candidates = Array.isArray(row.candidate_invoice_ids) ? row.candidate_invoice_ids : [];
  if (candidates.length !== 1 || typeof candidates[0] !== "string") {
    return { kind: "refused", reason: "Execute allocates only a single-candidate match." };
  }
  const event = await run(
    { type: "allocate_payment", actor: "analyst", subject: input.subject, payload: { invoice_id: candidates[0] } },
    asExecuteAgent(tx, decision),
  );
  return { kind: "executed", decision_id: decision.decision_id, config_version: decision.config_version, event };
}

/**
 * The human "Submit for approval" path (A1 matrix, EXE182): `run()` gated by
 * the persisted verdict. `blocked` refuses every role with the policy reason;
 * `needs_manager` refuses an Analyst. Throws `PermissionDenied` (the caller
 * audits it, FS21) or `InvalidCommand` for a missing or stale decision.
 */
export async function runPolicyGated(cmd: Command, expected: string, tx: PolicyTx): Promise<AuditEventInput> {
  if (cmd.type !== "allocate_payment" || cmd.subject.kind !== "review") return run(cmd, tx);
  const current = await currentDecision(cmd.subject.id, expected, tx);
  if (!current.ok) {
    if (current.closed) return run(cmd, tx); // run() gives the precise refusal (closed, wrong kind)
    throw new InvalidCommand(current.reason);
  }
  const { decision } = current;
  if (decision.verdict === "blocked") throw new PermissionDenied(cmd.type, decision.reason);
  if (decision.verdict === "needs_manager" && cmd.actor !== "manager") {
    throw new PermissionDenied(cmd.type, "Manager approval required");
  }
  return run(cmd, tx);
}
