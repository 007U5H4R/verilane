/**
 * The `pnpm eval` pipeline (TASK-21.2, AI-Evaluation.md §3–4).
 *
 * Runs the seed set, the held-out set and the draft cases through the real
 * domain code, offline: the simulated provider, `match`, the review/dispute
 * derivation, then `generate_draft` → `edit_draft` → `submit_draft` →
 * `approve_draft` via `run()` against an in-memory `Tx`. The clock is frozen at
 * AS_OF_DATE and `fetch` is stubbed to throw for the whole run (TC-069).
 *
 * Nothing here decides an outcome itself; it only drives the product code and
 * hands the results to `computeMetrics`, which scores them against labels.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { FAULT_KINDS, faulty, type FaultKind } from "@/ai/faulty";
import type { Provider } from "@/ai/provider";
import { simulatedProvider } from "@/ai/simulated";
import { rejectedExtraction } from "@/ai/validateExtraction";
import { AS_OF_DATE } from "@/domain/clock";
import { recordRejection, run, type AuditEventInput, type Command, type Row, type TableName, type Tx } from "@/domain/commands";
import { locateFootnotes } from "@/domain/draft";
import { ingest, type IngestResult, type Row as CsvRow } from "@/domain/ingest";
import { match } from "@/domain/match";
import { MANAGER_APPROVAL_THRESHOLD, type Role } from "@/domain/permissions";
import { exceptionsFor } from "@/domain/review";
import type { Dispute, EmailMessage, Extraction, Invoice, Match, VerifiedFact } from "@/domain/schema";
import { findUnverifiedTokens, type DraftSources } from "@/domain/validate";
import {
  computeMetrics,
  type ApprovalAttempt,
  type DraftOutcome,
  type Metrics,
  type SetResults,
  type ThreadResult,
} from "./metrics";
import { DraftCaseFile, ThreadLabelFile, type DraftCase, type ThreadLabel } from "./schema";

const ROOT = process.cwd();
const EVAL_DIR = join(ROOT, "eval");

/** Event timestamps inside the in-memory transaction: the frozen as-of day. */
const FROZEN_NOW = `${AS_OF_DATE}T09:00:00.000Z`;

export const SETS = ["seed", "heldout", "heldout-v2"] as const;
export type SetName = (typeof SETS)[number];

interface Corpus {
  labels: string;
  emails: string;
  invoices: string;
  customers: string;
  /** Absent: the set has no payment ledger. */
  payments?: string;
}

const CORPORA: Record<SetName, Corpus> = {
  seed: {
    labels: join(EVAL_DIR, "seed.labels.json"),
    emails: join(ROOT, "public", "seed", "emails.json"),
    invoices: join(ROOT, "public", "seed", "invoices.csv"),
    customers: join(ROOT, "public", "seed", "customers.csv"),
    payments: join(ROOT, "public", "seed", "payments.csv"),
  },
  heldout: {
    labels: join(EVAL_DIR, "heldout", "labels.json"),
    emails: join(EVAL_DIR, "heldout", "emails.json"),
    invoices: join(EVAL_DIR, "heldout", "invoices.csv"),
    customers: join(EVAL_DIR, "heldout", "customers.csv"),
  },
  "heldout-v2": {
    labels: join(EVAL_DIR, "heldout-v2", "labels.json"),
    emails: join(EVAL_DIR, "heldout-v2", "emails.json"),
    invoices: join(EVAL_DIR, "heldout-v2", "invoices.csv"),
    customers: join(EVAL_DIR, "heldout-v2", "customers.csv"),
  },
};

export type Comparator = ">=" | "<=";

export interface Gate {
  name: string;
  set: SetName;
  value: number;
  threshold: number;
  comparator: Comparator;
  passed: boolean;
  /** e.g. "24/24" or "0 of 28 drafts". */
  detail: string;
  failures: string[];
}

export interface Report {
  generatedAt: string;
  asOf: string;
  provider: string;
  /** Wall-clock time of the run (TC-069, budget 30 s). */
  durationMs: number;
  /** `fetch` calls attempted during the run; the stub throws on each (TC-069). */
  networkCalls: number;
  /** VERILANE_EVAL_FORCE_MISS=1: one result is corrupted on purpose (TC-068). */
  forcedMiss: boolean;
  passed: boolean;
  gates: Gate[];
  metrics: Record<SetName, Metrics>;
  attempts: Record<SetName, ApprovalAttempt[]>;
  /** Fault-injection rate over the seed emails (TASK-22, TC-071). */
  faults: FaultReport;
}

export const GATE_DEFS: { name: string; key: keyof Metrics; threshold: number; comparator: Comparator }[] = [
  { name: "Amount exact match", key: "amount_exact_match", threshold: 1, comparator: ">=" },
  { name: "Invoice number exact match", key: "invoice_ref_exact_match", threshold: 1, comparator: ">=" },
  { name: "Unsupported financial claims", key: "unsupported_financial_claims", threshold: 0, comparator: "<=" },
  { name: "Unambiguous matching", key: "unambiguous_matching", threshold: 1, comparator: ">=" },
  { name: "Dispute recall", key: "dispute_recall", threshold: 0.95, comparator: ">=" },
  { name: "Approval enforcement", key: "approval_enforcement", threshold: 1, comparator: ">=" },
];

// --- Loading -----------------------------------------------------------------

function readCsv(path: string): CsvRow[] {
  return Papa.parse<CsvRow>(readFileSync(path, "utf8"), { header: true, skipEmptyLines: true }).data;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function loadCorpus(c: Corpus): { ledger: IngestResult; labels: ThreadLabel[] } {
  const ledger = ingest({
    invoices: readCsv(c.invoices),
    customers: readCsv(c.customers),
    payments: c.payments ? readCsv(c.payments) : [],
    emails: readJson(c.emails),
  });
  return { ledger, labels: ThreadLabelFile.parse(readJson(c.labels)) };
}

// --- Thread pipeline ---------------------------------------------------------

/**
 * The dispute rows a matched, valid dispute/duplicate email raises. Mirrors
 * the store's private `disputesFor` (src/store/loader.ts), which the eval
 * cannot import without Dexie.
 */
function disputesFor(m: Match, x: Extraction, email: EmailMessage, invoices: Invoice[]): Dispute[] {
  if (m.outcome !== "matched" || x.status !== "valid") return [];
  if (x.email_class !== "dispute" && x.email_class !== "duplicate") return [];
  const invoiceId = x.email_class === "duplicate" ? m.candidates[0] : m.invoice_id;
  const customerId =
    (invoiceId !== undefined ? invoices.find((i) => i.invoice_id === invoiceId)?.customer_id : undefined) ??
    m.customer_id ??
    "";
  return [
    {
      dispute_id: `D-${x.message_id}`,
      ...(invoiceId !== undefined && { invoice_id: invoiceId }),
      customer_id: customerId,
      type: x.dispute_type ?? "unknown",
      source_message_id: x.message_id,
      claim_text: email.body,
      ai_recommendation:
        x.email_class === "duplicate"
          ? "Check whether these invoices bill the same supply; cancel one only after review"
          : "Open a dispute and hold reminders until it is resolved",
      status: "new",
    },
  ];
}

async function extract(provider: Provider, email: EmailMessage): Promise<Extraction> {
  const result = await provider.extract(email);
  return result.ok ? result.value : rejectedExtraction(email, provider.name, "simulated", result.error);
}

async function runThreads(
  ledger: IngestResult,
  provider: Provider,
): Promise<{ threads: ThreadResult[]; sources: DraftSources }> {
  const { invoices, customers, payments, emails } = ledger;
  const extractions: Extraction[] = [];
  const matches: Match[] = [];
  const exceptions: DraftSources["exceptions"] = [];
  const disputes: Dispute[] = [];
  const threads: ThreadResult[] = [];

  // Sorted so thread order (and the report) never depends on file order.
  const ordered = [...emails].sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.message_id.localeCompare(b.message_id));
  const latest = new Map<string, ThreadResult>();
  for (const email of ordered) {
    const x = await extract(provider, email);
    const m = match(x, email, { customers, invoices });
    extractions.push(x);
    matches.push(m);
    exceptions.push(...exceptionsFor(m, x, { invoices, payments }));
    disputes.push(...disputesFor(m, x, email, invoices));
    // Every eval thread is a single message; the latest one stands for it.
    latest.set(email.thread_id, {
      thread_id: email.thread_id,
      extraction_status: x.status,
      email_class: x.email_class,
      dispute_type: x.dispute_type ?? null,
      amounts: [...x.amounts],
      invoice_refs: [...x.invoice_refs],
      commitment_date: x.commitment_date,
      match_outcome: m.outcome,
      customer_id: m.customer_id ?? null,
      invoice_id: m.invoice_id ?? null,
    });
  }
  threads.push(...[...latest.values()].sort((a, b) => a.thread_id.localeCompare(b.thread_id)));

  return {
    threads,
    sources: { asOf: AS_OF_DATE, invoices, customers, payments, extractions, matches, disputes, exceptions },
  };
}

// --- In-memory transaction ---------------------------------------------------

const KEY_OF: Record<TableName, string> = {
  invoices: "invoice_id",
  drafts: "draft_id",
  disputes: "dispute_id",
  exceptions: "review_id",
  payments: "payment_id",
  creditNotes: "credit_note_id",
  meta: "key",
};

/** A fresh `Tx` over the set's ledger; drafts live only in this instance. */
function memTx(sources: DraftSources): Tx {
  const tables = new Map<TableName, Map<string, Row>>();
  for (const t of Object.keys(KEY_OF) as TableName[]) tables.set(t, new Map());
  const seed = (t: TableName, rows: object[]) => {
    for (const r of rows) tables.get(t)?.set(String((r as Row)[KEY_OF[t]]), { ...(r as Row) });
  };
  seed("invoices", sources.invoices);
  seed("disputes", sources.disputes);
  seed("exceptions", sources.exceptions);
  return {
    get: async (table, id) => {
      const row = tables.get(table)?.get(id);
      return row ? { ...row } : undefined;
    },
    put: async (table, row) => {
      tables.get(table)?.set(String(row[KEY_OF[table]]), { ...row });
    },
    audit: async () => {},
    now: () => FROZEN_NOW,
    draftSources: async () => sources,
  };
}

// --- Drafts and approvals ----------------------------------------------------

interface DraftRow extends Row {
  draft_id: string;
  status: string;
  body: string;
  facts: VerifiedFact[];
  failed_checks: number[];
}

function applyEdit(row: DraftRow, edit: NonNullable<DraftCase["edit"]>): string {
  if (edit.op === "append") return `${row.body}\n${edit.text}`;
  const fact = row.facts.find((f) => f.kind === edit.fact_kind);
  if (!fact) throw new Error(`draft ${row.draft_id} has no ${edit.fact_kind} fact to replace`);
  return row.body.split(fact.value).join(edit.text);
}

function cmd(type: Command["type"], kind: Command["subject"]["kind"], id: string, actor: Role, payload?: Row): Command {
  return { type, subject: { kind, id }, actor, ...(payload && { payload }) };
}

async function draftRow(tx: Tx, id: string): Promise<DraftRow> {
  const row = await tx.get("drafts", id);
  if (!row) throw new Error(`draft ${id} vanished`);
  return row as DraftRow;
}

/** Runs `approve_draft`; blocked unless the draft ends `sent_simulated`. */
async function attemptApproval(tx: Tx, draftId: string, actor: Role): Promise<{ blocked: boolean; outcome: string }> {
  try {
    const event = await run(cmd("approve_draft", "draft", draftId, actor), tx);
    const after = await draftRow(tx, draftId);
    const outcome = event.action === "validation_failure" ? "validation_failure" : after.status;
    return { blocked: after.status !== "sent_simulated", outcome };
  } catch (e) {
    return { blocked: true, outcome: e instanceof Error ? e.name : "error" };
  }
}

/**
 * The approval attempts for one draft. First the normal path: submit, then
 * approve. If that was blocked, a second "stale validation" attempt forges a
 * `validated` row with no failed checks and no escalation flags, so the block
 * must come from `approve_draft`'s own re-validation and role check.
 */
async function approvalAttempts(
  tx: Tx,
  draftId: string,
  invoiceId: string,
  actor: Role,
  blockReasons: string[],
  idPrefix: string,
): Promise<ApprovalAttempt[]> {
  try {
    await run(cmd("submit_draft", "draft", draftId, actor), tx);
  } catch {
    // A submit refusal leaves the draft unsent; the approval below records it.
  }
  const first = await attemptApproval(tx, draftId, actor);
  const attempts: ApprovalAttempt[] = [
    { id: `${idPrefix}/approve`, invoice_id: invoiceId, role: actor, block_reasons: blockReasons, ...first },
  ];
  if (first.blocked) {
    const row = await draftRow(tx, draftId);
    await tx.put("drafts", {
      ...row,
      status: "validated",
      failed_checks: [],
      ambiguous_match: false,
      conflicting_payment: false,
    });
    const stale = await attemptApproval(tx, draftId, actor);
    attempts.push({ id: `${idPrefix}/stale`, invoice_id: invoiceId, role: actor, block_reasons: blockReasons, ...stale });
  }
  return attempts;
}

function draftOutcome(id: string, row: DraftRow, sources: DraftSources, labelExpectsUnsupported: boolean): DraftOutcome {
  const footnotes = locateFootnotes(row.body, row.facts);
  return {
    id,
    approvable: row.failed_checks.length === 0,
    unverified_tokens: findUnverifiedTokens(
      row.body,
      footnotes,
      sources.customers.map((c) => c.name),
    ),
    label_expects_unsupported: labelExpectsUnsupported,
  };
}

/** Seed: the 28 hand-labelled draft cases, each in a fresh transaction. */
async function runDraftCases(cases: DraftCase[], sources: DraftSources) {
  const drafts: DraftOutcome[] = [];
  const attempts: ApprovalAttempt[] = [];
  for (const c of cases) {
    const tx = memTx(sources);
    await run(cmd("generate_draft", "invoice", c.invoice_id, c.role), tx);
    const draftId = `DR-${c.invoice_id}-1`;
    if (c.edit) {
      const body = applyEdit(await draftRow(tx, draftId), c.edit);
      await run(cmd("edit_draft", "draft", draftId, c.role, { body }), tx);
    }
    const row = await draftRow(tx, draftId);
    drafts.push(draftOutcome(c.case_id, row, sources, c.expected.must_fail.includes(9)));

    const reasons: string[] = [];
    if (!c.expected.approvable) reasons.push(`label: checks ${c.expected.must_fail.join(",")} must fail`);
    if (c.expected.requires_manager === true && c.role === "analyst") reasons.push("label: requires a Manager");
    attempts.push(...(await approvalAttempts(tx, draftId, c.invoice_id, c.role, reasons, c.case_id)));
  }
  return { drafts, attempts };
}

/** Why an approval for `invoiceId` must be blocked, from labels + ledger only. */
function heldOutBlockReasons(invoice: Invoice, sources: DraftSources, labels: ThreadLabel[], actor: Role): string[] {
  const id = invoice.invoice_id;
  const reasons: string[] = [];
  for (const l of labels) {
    if (l.email_class === "dispute" && l.invoice_id === id) {
      reasons.push(
        l.dispute_type === "payment_already_completed" ? `payment claim (${l.thread_id})` : `unresolved dispute (${l.thread_id})`,
      );
    }
    if (l.email_class === "duplicate" && l.invoice_ids.includes(id)) reasons.push(`unresolved duplicate (${l.thread_id})`);
    if (l.email_class === "confirmation" && l.invoice_id === id) reasons.push(`payment claim (${l.thread_id})`);
    if (actor === "analyst" && l.ambiguous && l.invoice_ids.includes(id)) {
      reasons.push(`ambiguous match needs a Manager (${l.thread_id})`);
    }
  }
  const paid = sources.payments.filter((p) => p.invoice_id === id).reduce((s, p) => s + p.amount_paise, 0);
  const outstanding = invoice.amount_paise - paid;
  if (invoice.status === "paid" || invoice.status === "written_off" || outstanding <= 0) reasons.push("invoice not open");
  if (actor === "analyst" && outstanding > MANAGER_APPROVAL_THRESHOLD) reasons.push("over ₹5,00,000 as Analyst");
  return reasons;
}

/**
 * Held-out: one reminder per ledger invoice, approved as an Analyst; where
 * the labels give a dispute or payment claim, a Manager tries too (no role
 * may send a reminder on a disputed or claimed-paid invoice).
 */
async function runHeldOutApprovals(sources: DraftSources, labels: ThreadLabel[]) {
  const drafts: DraftOutcome[] = [];
  const attempts: ApprovalAttempt[] = [];
  const invoices = [...sources.invoices].sort((a, b) => a.invoice_id.localeCompare(b.invoice_id));
  for (const invoice of invoices) {
    for (const actor of ["analyst", "manager"] as const) {
      const reasons = heldOutBlockReasons(invoice, sources, labels, actor);
      if (actor === "manager" && reasons.length === 0) continue;
      const tx = memTx(sources);
      await run(cmd("generate_draft", "invoice", invoice.invoice_id, actor), tx);
      const draftId = `DR-${invoice.invoice_id}-1`;
      const row = await draftRow(tx, draftId);
      if (actor === "analyst") drafts.push(draftOutcome(invoice.invoice_id, row, sources, false));
      const all = row.failed_checks.length > 0 ? [...reasons, `checks ${row.failed_checks.join(",")} failed`] : reasons;
      attempts.push(...(await approvalAttempts(tx, draftId, invoice.invoice_id, actor, all, `${invoice.invoice_id}/${actor}`)));
    }
  }
  return { drafts, attempts };
}

// --- Fault injection (TASK-22, FS11) -----------------------------------------

export interface FaultKindResult {
  kind: FaultKind;
  emails: number;
  /** Corrupted outputs the validator rejected. */
  rejected: number;
  rate: number;
  /** Rejected emails with an open review item (needs_review). */
  needs_review: number;
  /** Rejections recorded as one `validation_failure` audit event. */
  audited: number;
  approvals_attempted: number;
  /** Approvals that reached `sent_simulated`; must be 0. */
  approvable: number;
  failures: string[];
}

export interface FaultReport {
  rate: number;
  approvable: number;
  kinds: FaultKindResult[];
}

/** The simulated provider, with only `messageId` corrupted by `kind`. */
function faultOne(kind: FaultKind, messageId: string): Provider {
  const bad = faulty(simulatedProvider, kind);
  return {
    name: "faulty",
    extract: (m) => (m.message_id === messageId ? bad.extract(m) : simulatedProvider.extract(m)),
  };
}

/**
 * Each seed email, once per fault kind, with only that email corrupted. The
 * invoices it could concern (what the clean run matched, plus what the
 * faulted run names or lists as candidates) each get a reminder that a
 * Manager then tries to approve, normally and with a forged validated row.
 */
export async function runFaults(): Promise<FaultReport> {
  const { ledger } = loadCorpus(CORPORA.seed);
  const clean = await runThreads(ledger, simulatedProvider);
  const kinds: FaultKindResult[] = [];
  for (const kind of FAULT_KINDS) {
    const r: FaultKindResult = {
      kind,
      emails: 0,
      rejected: 0,
      rate: 0,
      needs_review: 0,
      audited: 0,
      approvals_attempted: 0,
      approvable: 0,
      failures: [],
    };
    for (const email of [...ledger.emails].sort((a, b) => a.message_id.localeCompare(b.message_id))) {
      const id = email.message_id;
      r.emails++;
      const { sources } = await runThreads(ledger, faultOne(kind, id));
      const x = sources.extractions.find((e) => e.message_id === id);
      if (x?.status !== "rejected") {
        r.failures.push(`${id}: not rejected`);
        continue;
      }
      r.rejected++;
      if (sources.exceptions.some((i) => i.message_id === id && i.status === "open")) r.needs_review++;
      else r.failures.push(`${id}: no open review item`);

      const events: AuditEventInput[] = [];
      await recordRejection(x, "analyst", { ...memTx(sources), audit: async (e) => void events.push(e) });
      if (events.length === 1 && events[0]?.action === "validation_failure") r.audited++;
      else r.failures.push(`${id}: no validation_failure audit`);

      const m = sources.matches.find((e) => e.message_id === id);
      const before = clean.sources.matches.find((e) => e.message_id === id);
      const targets = new Set([m?.invoice_id, ...(m?.candidates ?? []), before?.invoice_id]);
      for (const invoiceId of [...targets].filter((t): t is string => t !== undefined).sort()) {
        const tx = memTx(sources);
        await run(cmd("generate_draft", "invoice", invoiceId, "manager"), tx);
        const draftId = `DR-${invoiceId}-1`;
        const attempts = await approvalAttempts(tx, draftId, invoiceId, "manager", [`rejected ${id}`], `${kind}/${id}/${invoiceId}`);
        r.approvals_attempted += attempts.length;
        for (const a of attempts.filter((a) => !a.blocked)) {
          r.approvable++;
          r.failures.push(`${a.id}: approvable (${a.outcome})`);
        }
      }
    }
    r.rate = r.emails === 0 ? 0 : r.rejected / r.emails;
    kinds.push(r);
  }
  const emails = kinds.reduce((n, k) => n + k.emails, 0);
  return {
    rate: emails === 0 ? 0 : kinds.reduce((n, k) => n + k.rejected, 0) / emails,
    approvable: kinds.reduce((n, k) => n + k.approvable, 0),
    kinds,
  };
}

// --- Gates and the report ----------------------------------------------------

function gateValue(m: Metrics, key: keyof Metrics): { value: number; detail: string; failures: string[] } {
  if (key === "unsupported_financial_claims") {
    const u = m.unsupported_financial_claims;
    return { value: u.count, detail: `${u.count} of ${u.drafts} drafts`, failures: u.failures };
  }
  const r = m[key] as Metrics["amount_exact_match"];
  return { value: r.value, detail: `${r.numerator}/${r.denominator}`, failures: r.failures };
}

export function gatesFor(set: SetName, m: Metrics): Gate[] {
  return GATE_DEFS.map((d) => {
    const { value, detail, failures } = gateValue(m, d.key);
    const passed = d.comparator === ">=" ? value >= d.threshold : value <= d.threshold;
    return { name: d.name, set, value, threshold: d.threshold, comparator: d.comparator, passed, detail, failures };
  });
}

/** Breaks the first amount-bearing thread so the amount gate must miss. */
function forceMiss(threads: ThreadResult[], labels: ThreadLabel[]): ThreadResult[] {
  const target = labels.find((l) => l.amounts.length > 0)?.thread_id;
  return threads.map((t) => (t.thread_id === target ? { ...t, amounts: [...t.amounts, 1] } : t));
}

export interface RunOptions {
  provider?: Provider;
  forceMiss?: boolean;
  /** Wall clock for `generatedAt` (the domain clock stays frozen). */
  clock?: () => Date;
}

/** Runs every set with `fetch` stubbed to throw; restores it afterwards. */
export async function runEval(opts: RunOptions = {}): Promise<Report> {
  const provider = opts.provider ?? simulatedProvider;
  const clock = opts.clock ?? (() => new Date());
  const forced = opts.forceMiss ?? process.env.VERILANE_EVAL_FORCE_MISS === "1";

  const realFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (() => {
    networkCalls++;
    throw new Error("network access is not allowed during the eval (TC-069)");
  }) as typeof fetch;

  const started = performance.now();
  try {
    const metrics = {} as Record<SetName, Metrics>;
    const attempts = {} as Record<SetName, ApprovalAttempt[]>;
    const cases = DraftCaseFile.parse(readJson(join(EVAL_DIR, "drafts.cases.json")));

    for (const set of SETS) {
      const { ledger, labels } = loadCorpus(CORPORA[set]);
      const { threads, sources } = await runThreads(ledger, provider);
      const approvals =
        set === "seed" ? await runDraftCases(cases, sources) : await runHeldOutApprovals(sources, labels);
      const results: SetResults = {
        threads: forced ? forceMiss(threads, labels) : threads,
        drafts: approvals.drafts,
        attempts: approvals.attempts,
      };
      metrics[set] = computeMetrics(results, labels);
      attempts[set] = approvals.attempts;
    }

    const gates = SETS.flatMap((s) => gatesFor(s, metrics[s]));
    const faults = await runFaults();
    return {
      generatedAt: clock().toISOString(),
      asOf: AS_OF_DATE,
      provider: provider.name,
      durationMs: Math.round(performance.now() - started),
      networkCalls,
      forcedMiss: forced,
      passed: gates.every((g) => g.passed),
      gates,
      metrics,
      attempts,
      faults,
    };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Fields that legitimately differ between two runs (TC-067). */
export const VOLATILE_KEYS = ["generatedAt", "durationMs"] as const;

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)) : v;
}

/** The report minus `VOLATILE_KEYS`, so the committed files only change when a result does. */
function stableFields(report: Report): Omit<Report, (typeof VOLATILE_KEYS)[number]> {
  const copy: Partial<Report> = { ...report };
  for (const k of VOLATILE_KEYS) delete copy[k];
  return copy as Omit<Report, (typeof VOLATILE_KEYS)[number]>;
}

/**
 * `report.json`: keys sorted at every level, ratios to 4 places. The volatile
 * keys are left out so two runs write identical bytes; `pnpm eval` prints them.
 */
export function toJson(report: Report): string {
  return `${JSON.stringify(sortKeys(stableFields(report)), null, 2)}\n`;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function fmtGate(g: Gate): string {
  const v = g.comparator === "<=" ? String(g.value) : pct(g.value);
  return `${v} (${g.detail})`;
}

function fmtThreshold(g: Gate): string {
  return g.comparator === "<=" ? `= ${g.threshold}` : `≥ ${pct(g.threshold)}`;
}

/** `report.md`: the human-readable report linked from Settings. */
export function toMarkdown(report: Report): string {
  const lines: string[] = [];
  const seed = report.gates.filter((g) => g.set === "seed");
  const held = report.gates.filter((g) => g.set === "heldout");
  const held2 = report.gates.filter((g) => g.set === "heldout-v2");
  lines.push(
    "# Evaluation report",
    "",
    `As-of ${report.asOf} · provider \`${report.provider}\` · network calls ${report.networkCalls}`,
    "",
    report.passed ? "**All gates pass.**" : "**One or more gates missed — the run fails.**",
    "",
    "## Gates",
    "",
    "| Gate | Threshold | Seed (25 threads) | Held-out (30 threads; inspected 2026-11-01, no longer blind) | Held-out v2 (30 threads) |",
    "| --- | --- | --- | --- | --- |",
  );
  seed.forEach((g, i) => {
    const h = held[i];
    const h2 = held2[i];
    const mark = (x: Gate | undefined) => (x ? `${x.passed ? "PASS" : "FAIL"} ${fmtGate(x)}` : "—");
    lines.push(`| ${g.name} | ${fmtThreshold(g)} | ${mark(g)} | ${mark(h)} | ${mark(h2)} |`);
  });
  const missed = report.gates.filter((g) => !g.passed);
  if (missed.length > 0) {
    lines.push("", "### Misses", "");
    for (const g of missed) lines.push(`- ${g.name} (${g.set}): ${g.failures.join(", ") || "—"}`);
  }

  lines.push("", "## Reported, not gated", "", "| Metric | Seed | Held-out (no longer blind) | Held-out v2 |", "| --- | --- | --- | --- |");
  const ratioRow = (label: string, pick: (m: Metrics) => { value: number; numerator: number; denominator: number }) => {
    const s = pick(report.metrics.seed);
    const h = pick(report.metrics.heldout);
    const h2 = pick(report.metrics["heldout-v2"]);
    lines.push(`| ${label} | ${pct(s.value)} (${s.numerator}/${s.denominator}) | ${pct(h.value)} (${h.numerator}/${h.denominator}) | ${pct(h2.value)} (${h2.numerator}/${h2.denominator}) |`);
  };
  ratioRow("Ambiguous threads escalated", (m) => m.ambiguous_escalation);
  ratioRow("Allowed approvals blocked (false blocks)", (m) => m.false_blocks);
  ratioRow("Email class exact match", (m) => m.field_exact_match.email_class);
  ratioRow("Dispute type exact match", (m) => m.field_exact_match.dispute_type);
  ratioRow("Commitment date exact match", (m) => m.field_exact_match.commitment_date);
  ratioRow("Customer exact match", (m) => m.field_exact_match.customer_id);

  for (const [title, pick] of [
    ["Per email class", (m: Metrics) => m.per_class],
    ["Per dispute type", (m: Metrics) => m.per_dispute_type],
  ] as const) {
    lines.push("", `## ${title}`, "", "| Class | Set | TP | FP | FN | TN | Precision | Recall | F1 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const k of Object.keys(pick(report.metrics.seed))) {
      for (const set of SETS) {
        const c = pick(report.metrics[set])[k];
        if (!c || c.tp + c.fp + c.fn === 0) continue;
        lines.push(`| ${k} | ${set} | ${c.tp} | ${c.fp} | ${c.fn} | ${c.tn} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.f1)} |`);
      }
    }
  }

  lines.push(
    "",
    "## Fault injection (TASK-22)",
    "",
    `Each seed email, corrupted one way at a time, must be rejected, sent to review and leave no approvable reminder. Rejection rate ${pct(report.faults.rate)}; approvable drafts ${report.faults.approvable}.`,
    "",
    "| Fault | Rejected | Needs review | Audited | Approvals tried | Approvable |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const k of report.faults.kinds) {
    lines.push(
      `| ${k.kind} | ${pct(k.rate)} (${k.rejected}/${k.emails}) | ${k.needs_review}/${k.emails} | ${k.audited}/${k.emails} | ${k.approvals_attempted} | ${k.approvable} |`,
    );
  }

  lines.push(
    "",
    "## Method",
    "",
    "- Simulated provider, frozen clock, `fetch` stubbed to throw: the run is offline and deterministic.",
    "- Amount and invoice-number match use set equality in paise over threads whose label states one.",
    "- Approval enforcement drives `approve_draft` through the real command code. A blocked approval is retried with a forged `validated` row, so the block must come from re-validation and the role check.",
    "- Fault injection wraps the simulated provider; each corrupted output goes through the same validator and cross-check as a live one.",
    "- Live-provider quality (`eval/report.live.json`) is reported separately.",
    "",
  );
  return lines.join("\n");
}
