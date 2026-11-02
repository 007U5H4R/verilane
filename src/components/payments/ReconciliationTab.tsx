"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/domain/clock";
import { formatInr, paise } from "@/domain/money";
import type { Role } from "@/domain/permissions";
import {
  AMOUNT_BUCKETS,
  CASE_SORTS,
  filterCases,
  isAmountBucket,
  isCaseSort,
  paginate,
  sortCases,
  toCsv,
  type CaseRow,
} from "@/domain/payments/listing";
import {
  LEDGER_STATUS_META,
  MISSING,
  STATE_META,
  ledgerStatus,
  type AssessedCase,
  type Candidate,
  type ClaimField,
} from "@/domain/payments/reconcile";
import { useExecute } from "@/store/hooks";
import { cn } from "@/lib/cn";
import { CaseActions, CommandDialog, NoteField } from "./CaseActions";
import { caseAudit, type PaymentsModel } from "./model";
import { CARD, Field, INPUT, LINK, Pager, SELECT, useUrlState } from "./parts";
import { StatusPill, TONE } from "./tone";

const PAGE_SIZE = 4;
const VIEWS = [
  { id: "open", label: "Needs a person" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const isView = (v: unknown): v is View => VIEWS.some((x) => x.id === v);

type Row = CaseRow & { c: AssessedCase };

function rowOf(c: AssessedCase, model: PaymentsModel): Row {
  const invoiceNumbers = c.case.invoiceIds.map((id) => model.data.invoices.get(id)?.invoice_number ?? id);
  return {
    id: c.case.id,
    sentAt: c.email?.sent_at ?? "",
    amount: c.claim.amount_paise,
    discrepancy: c.discrepancy,
    customerId: c.case.customerId,
    haystack: [c.case.id, c.email?.from_address ?? "", c.email?.subject ?? "", c.customer?.name ?? "", ...invoiceNumbers, ...c.case.invoiceIds],
    c,
  };
}

/** Needs Reconciliation: one card per email, newest first, with the investigation inline. */
export function ReconciliationTab({ model, role, onViewLedger }: { model: PaymentsModel; role: Role; onViewLedger: () => void }) {
  const { params, set } = useUrlState();
  const q = params.get("q") ?? "";
  const cust = params.get("cust") ?? "";
  const amtParam = params.get("amt");
  const amt = isAmountBucket(amtParam) ? amtParam : "all";
  const sortParam = params.get("sort");
  const sort = isCaseSort(sortParam) ? sortParam : "latest";
  const viewParam = params.get("view");
  const view: View = isView(viewParam) ? viewParam : "open";
  const pageNum = Number(params.get("page") ?? "1");

  const rows = useMemo(() => model.cases.map((c) => rowOf(c, model)), [model]);
  const inView = rows.filter((r) => (view === "all" ? true : view === "open" ? r.c.open : !r.c.open));
  const shown = sortCases(filterCases(inView, { q, customerId: cust, bucket: amt }), sort);
  const page = paginate(shown, pageNum, PAGE_SIZE);
  const filtered = q !== "" || cust !== "" || amt !== "all";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRows = shown.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const searchId = useId();
  const patch = (p: Record<string, string | null>) => set({ ...p, page: null });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className={cn(CARD, "flex flex-col gap-3 p-3")} role="search" aria-label="Filter reconciliation cases">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search cases
            </label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              id={searchId}
              type="search"
              className={cn(INPUT, "pl-9")}
              placeholder="Search email, sender, customer or invoice"
              defaultValue={q}
              onChange={(e) => patch({ q: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="Show">
              <select className={SELECT} value={view} onChange={(e) => patch({ view: e.target.value === "open" ? null : e.target.value })}>
                {VIEWS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer">
              <select className={SELECT} value={cust} onChange={(e) => patch({ cust: e.target.value })}>
                <option value="">All customers</option>
                {model.customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Claimed amount">
              <select className={SELECT} value={amt} onChange={(e) => patch({ amt: e.target.value === "all" ? null : e.target.value })}>
                {AMOUNT_BUCKETS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort by">
              <select className={SELECT} value={sort} onChange={(e) => patch({ sort: e.target.value === "latest" ? null : e.target.value })}>
                {CASE_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {filtered && (
            <button type="button" className={cn(LINK, "w-fit text-xs")} onClick={() => patch({ q: null, cust: null, amt: null })}>
              Clear filters
            </button>
          )}
        </div>

        {selectedRows.length > 0 && <BulkBar rows={selectedRows} model={model} onDone={() => setSelected(new Set())} />}

        {page.total === 0 ? (
          <p className={cn(CARD, "p-4 text-[13px] text-text-muted")} data-testid="reconcile-empty">
            {filtered
              ? "No cases match these filters."
              : view === "open"
                ? "No claimed payments to reconcile."
                : "No cases here yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Needs reconciliation">
            {page.items.map((r) => (
              <CaseCard key={r.id} c={r.c} model={model} role={role} selected={selected.has(r.id)} onSelect={() => toggle(r.id)} />
            ))}
          </ul>
        )}
        <Pager page={page} onPage={(p) => set({ page: p === 1 ? null : String(p) })} label="Reconciliation pages" />
      </div>

      <RecentLedger model={model} onViewLedger={onViewLedger} />
    </div>
  );
}

/* ---------- one case ---------- */

function CaseCard({
  c,
  model,
  role,
  selected,
  onSelect,
}: {
  c: AssessedCase;
  model: PaymentsModel;
  role: Role;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const meta = STATE_META[c.state];
  const head = c.head;
  const invoiceIds = c.case.invoiceIds;
  const numberOf = (id: string) => model.data.invoices.get(id)?.invoice_number ?? id;
  const emailInvoice = invoiceIds[0];

  return (
    <li
      data-testid="review-item"
      data-kind={head.kind}
      data-message={c.case.id}
      data-state={c.state}
      className={cn(CARD, "relative flex flex-col overflow-hidden")}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", TONE[meta.tone].bar)} />
      <div className="flex flex-col gap-2 p-4 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {c.open && (
              <input
                type="checkbox"
                className="mt-1 size-4 accent-brand"
                checked={selected}
                onChange={onSelect}
                aria-label={`Select case ${c.case.id}`}
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
              <h3 className="text-[15px] font-semibold text-text">{meta.heading}</h3>
            </div>
          </div>
          <span className="text-xs text-text-muted tabular-nums">{c.email ? formatDateTime(c.email.sent_at) : MISSING.na}</span>
        </div>

        <p className="text-xs text-text-muted">
          {c.customer?.name ?? MISSING.na}
          {" · "}
          {c.case.kind === "duplicate_invoice" ? "Invoices " : "Invoice "}
          {invoiceIds.length === 0
            ? MISSING.na
            : invoiceIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link href={`/invoices/${id}`} className={LINK}>
                    {numberOf(id)}
                  </Link>
                </span>
              ))}
          {" · Email "}
          {emailInvoice ? (
            <Link href={`/invoices/${emailInvoice}#ev-communication`} className={cn("font-mono", LINK)} aria-label={`Open email ${c.case.id}`}>
              {c.case.id}
            </Link>
          ) : (
            <span className="font-mono text-text">{c.case.id}</span>
          )}
        </p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-xs text-text-muted">Email says paid</dt>
            {head.email_amount_paise !== undefined ? (
              <dd data-testid="email-amount" className="tabular-nums font-medium text-text">
                {formatInr(paise(head.email_amount_paise))}
              </dd>
            ) : (
              <dd className="text-text-muted">{c.claim.amount.provided ? c.claim.amount.value : MISSING.customer}</dd>
            )}
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-text-muted">Ledger outstanding</dt>
            {head.ledger_outstanding_paise !== undefined ? (
              <dd data-testid="ledger-amount" className="tabular-nums font-medium text-text">
                {formatInr(paise(head.ledger_outstanding_paise))}
              </dd>
            ) : (
              <dd className="text-text-muted">{MISSING.na}</dd>
            )}
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-text-muted">Difference</dt>
            <dd className="tabular-nums text-text">{c.discrepancy !== undefined ? formatInr(c.discrepancy) : MISSING.na}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            {head.recommendation} · {head.requires_role === "manager" ? "Manager" : "Analyst"} review
            {head.assignee && ` · Assigned to ${head.assignee === "manager" ? "Manager" : "Analyst"}`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Hide investigation" : "Investigate"}
            <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-border bg-surface-sunken/40 p-4 pl-5" data-testid="investigation">
          <Investigation c={c} model={model} role={role} />
        </div>
      )}
    </li>
  );
}

/* ---------- investigation, sections A–F ---------- */

function Section({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-text">
        <span aria-hidden className="grid size-5 place-items-center rounded-full bg-mint-pale text-[11px] font-bold text-brand">
          {letter}
        </span>
        {title}
      </h4>
      {children}
    </section>
  );
}

function ClaimRow({ label, f }: { label: string; f: ClaimField }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-xs text-text-muted">{label}</dt>
      <dd className="min-w-0 text-[13px]">
        <span className={f.provided ? "font-medium text-text" : "text-text-muted"}>{f.value}</span>
        {f.quote && <q className="mt-0.5 block text-xs italic text-text-muted">{f.quote}</q>}
      </dd>
    </div>
  );
}

const CHECK_TEXT = (ok: boolean | null) => (ok === null ? MISSING.customer : ok ? "Yes" : "No");

function CandidateRow({ k, model }: { k: Candidate; model: PaymentsModel }) {
  const tierLabel =
    k.tier === "exact"
      ? "Same invoice and amount"
      : k.tier === "same_invoice_amount_differs"
        ? "Same invoice, amount differs"
        : "Same customer and amount, different invoice — never matched on amount alone";
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3" data-testid="candidate">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-mono text-text">{k.payment.payment_id}</span>
        <span className="tabular-nums font-medium text-text">{formatInr(paise(k.payment.amount_paise))}</span>
        <span className="text-text-muted">{formatDate(k.payment.paid_on)}</span>
        <Link href={`/invoices/${k.payment.invoice_id}`} className={cn(LINK, "text-xs")}>
          {model.data.invoices.get(k.payment.invoice_id)?.invoice_number ?? k.payment.invoice_id}
        </Link>
      </div>
      <p className="text-xs text-text-muted">{tierLabel}</p>
      <dl className="grid grid-cols-2 gap-x-3 text-xs sm:grid-cols-5">
        <div>
          <dt className="text-text-muted">Invoice</dt>
          <dd className="text-text">{CHECK_TEXT(k.checks.invoice)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Customer</dt>
          <dd className="text-text">{CHECK_TEXT(k.checks.customer)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">UTR</dt>
          <dd className="text-text-muted">{MISSING.na}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Amount</dt>
          <dd className="text-text">{CHECK_TEXT(k.checks.amount)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Within 3 days</dt>
          <dd className="text-text">{CHECK_TEXT(k.checks.dateWindow)}</dd>
        </div>
      </dl>
    </li>
  );
}

function Investigation({ c, model, role }: { c: AssessedCase; model: PaymentsModel; role: Role }) {
  const invoice = c.invoice;
  const recorded = invoice ? model.data.payments.filter((p) => p.invoice_id === invoice.invoice_id) : [];
  const dupWith = c.claim.utr.provided ? (model.dupRefs.get(c.claim.utr.value) ?? []).filter((id) => id !== c.case.id) : [];
  const audit = caseAudit(
    model,
    c.case.items.map((r) => r.review_id),
  );
  const head = c.head;

  return (
    <div className="flex flex-col gap-5">
      <Section letter="A" title="What the customer says">
        <dl className="flex flex-col gap-2">
          <ClaimRow label="Amount" f={c.claim.amount} />
          <ClaimRow label="Payment date" f={c.claim.date} />
          <ClaimRow label="Method" f={c.claim.method} />
          <ClaimRow label="UTR / reference" f={c.claim.utr} />
          <ClaimRow label="Invoice cited" f={c.claim.invoice} />
          <ClaimRow label="Customer" f={c.claim.customer} />
        </dl>
        {dupWith.length > 0 && (
          <p className="text-xs">
            <StatusPill tone="mismatch">Reference reused</StatusPill>{" "}
            <span className="text-text">The same reference is quoted in {dupWith.join(", ")}. Check both before verifying either.</span>
          </p>
        )}
      </Section>

      <Section letter="B" title="What the ledger shows">
        {invoice ? (
          <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Invoice amount</dt>
              <dd className="tabular-nums text-text">{formatInr(paise(invoice.amount_paise))}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Outstanding (ledger)</dt>
              <dd className="tabular-nums text-text">{c.outstanding !== undefined ? formatInr(c.outstanding) : MISSING.na}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Payments recorded</dt>
              <dd className="text-text">
                {recorded.length === 0
                  ? "None"
                  : recorded.map((p) => `${p.payment_id} · ${formatInr(paise(p.amount_paise))} · ${formatDate(p.paid_on)}`).join("; ")}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-[13px] text-text-muted">{c.case.kind === "duplicate_invoice" ? MISSING.review : MISSING.na}</p>
        )}
      </Section>

      <Section letter="C" title="Ledger match checks">
        <p className="text-xs text-text-muted">
          Checked in order: invoice, customer, UTR, amount, then a 3-day date window. Another customer’s payment is never shown,
          and amount alone never makes a match. The ledger stores no UTR, so it cannot be compared.
        </p>
        {c.candidates.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            {c.case.kind === "duplicate_invoice" ? MISSING.review : MISSING.evidence}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Ledger entries checked">
            {c.candidates.map((k) => (
              <CandidateRow key={k.payment.payment_id} k={k} model={model} />
            ))}
          </ul>
        )}
      </Section>

      <Section letter="D" title="Balance if confirmed">
        {c.remainingIfConfirmed !== undefined ? (
          <p className="text-[13px] text-text">
            <span className="tabular-nums font-medium">{formatInr(c.remainingIfConfirmed)}</span> would remain outstanding
            {c.recordedPaymentId ? ` (already reflected — the ledger has ${c.recordedPaymentId}).` : "."}
            {c.partial && " The claim is below the invoice amount, so it is treated as a part payment, never as full settlement."}
          </p>
        ) : (
          <p className="text-[13px] text-text-muted">
            {c.claim.amount_paise !== undefined && c.outstanding !== undefined
              ? "The claimed amount is more than the outstanding balance. " + MISSING.review
              : MISSING.review}
          </p>
        )}
        {head.requested_partial_paise !== undefined && (
          <p className="text-xs text-text-muted">
            Partial payment of {formatInr(paise(head.requested_partial_paise))} sent for Manager review. The ledger is unchanged until it is
            recorded there.
          </p>
        )}
        {head.verified_payment_id && (
          <p className="text-xs text-text">
            Verified against {head.verified_payment_id}
            {head.verified_reference ? ` · evidence: ${head.verified_reference}` : ""}.
          </p>
        )}
      </Section>

      <Section letter="E" title="Next step">
        {c.open ? <CaseActions c={c} role={role} /> : <p className="text-[13px] text-text-muted">This case is closed. No action is needed.</p>}
      </Section>

      <Section letter="F" title="Activity">
        {audit.length === 0 ? (
          <p className="text-[13px] text-text-muted">No one has acted on this case yet.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 text-[13px]">
            {audit.map((e, i) => (
              <li key={e.event_id ?? i} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="w-40 shrink-0 text-xs tabular-nums text-text-muted">
                  {typeof e.at === "string" ? formatDateTime(e.at) : MISSING.na}
                </span>
                <span className="text-text">
                  {String(e.summary ?? e.action)}
                  {typeof e.actor_label === "string" && <span className="text-text-muted"> · {e.actor_label}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

/* ---------- bulk: assign, export, escalate ---------- */

function BulkBar({ rows, model, onDone }: { rows: Row[]; model: PaymentsModel; onDone: () => void }) {
  const execute = useExecute();
  const [dialog, setDialog] = useState<"assign" | "escalate" | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<"analyst" | "manager">("manager");
  const openItems = rows.flatMap((r) => r.c.case.items.filter((i) => i.status === "open"));

  const flagAll = async (payload: Record<string, unknown>) => {
    for (const item of openItems) {
      await execute({ type: "reconcile_flag", subject: { kind: "review", id: item.review_id }, payload });
    }
    onDone();
  };

  const exportCsv = () => {
    const csv = toCsv(
      ["Email", "State", "Customer", "Invoices", "Claimed (INR)", "Ledger outstanding (INR)", "Difference (INR)"],
      rows.map((r) => [
        r.id,
        STATE_META[r.c.state].label,
        r.c.customer?.name ?? MISSING.na,
        r.c.case.invoiceIds.map((id) => model.data.invoices.get(id)?.invoice_number ?? id).join(" "),
        r.c.claim.amount_paise !== undefined ? (r.c.claim.amount_paise / 100).toFixed(2) : MISSING.customer,
        r.c.outstanding !== undefined ? (r.c.outstanding / 100).toFixed(2) : MISSING.na,
        r.c.discrepancy !== undefined ? (r.c.discrepancy / 100).toFixed(2) : MISSING.na,
      ]),
    );
    download(csv, "reconciliation-cases.csv");
  };

  return (
    <div className={cn(CARD, "flex flex-wrap items-center gap-2 p-3")} role="region" aria-label="Bulk actions">
      <span className="text-sm text-text" aria-live="polite">
        {rows.length} selected
      </span>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDialog("assign")}>
        Assign
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" onClick={exportCsv}>
        Export CSV
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDialog("escalate")}>
        Escalate
      </Button>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
        Clear
      </Button>

      <CommandDialog
        open={dialog === "assign"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Assign ${rows.length} ${rows.length === 1 ? "case" : "cases"}?`}
        description={<p>Records who owns these cases. Nothing else changes.</p>}
        confirmLabel="Assign"
        success="Cases assigned."
        onConfirm={() => flagAll({ step: "assign", assignee })}
      >
        <fieldset className="flex gap-4 text-sm text-text">
          <legend className="mb-1 text-sm font-medium">Assign to</legend>
          {(["analyst", "manager"] as const).map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="radio" name="bulk-assignee" className="accent-brand" checked={assignee === a} onChange={() => setAssignee(a)} />
              {a === "manager" ? "Manager" : "Analyst"}
            </label>
          ))}
        </fieldset>
      </CommandDialog>

      <CommandDialog
        open={dialog === "escalate"}
        onOpenChange={(o) => {
          if (!o) setDialog(null);
          setNote("");
        }}
        title={`Escalate ${rows.length} ${rows.length === 1 ? "case" : "cases"} to a Manager?`}
        description={<p>Each case moves to Manager review with your reason.</p>}
        confirmLabel="Escalate"
        canConfirm={note.trim() !== ""}
        success="Escalated to a Manager."
        onConfirm={() => flagAll({ step: "escalate", note: note.trim() })}
      >
        <NoteField label="Reason" value={note} onChange={setNote} required />
      </CommandDialog>
    </div>
  );
}

export function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- right column ---------- */

function RecentLedger({ model, onViewLedger }: { model: PaymentsModel; onViewLedger: () => void }) {
  const recent = model.data.payments.slice(0, 6);
  return (
    <aside className={cn(CARD, "flex h-fit flex-col gap-3 p-4")} aria-labelledby="recent-ledger-title">
      <h2 id="recent-ledger-title" className="text-sm font-semibold text-text">
        Recent ledger entries
      </h2>
      {recent.length === 0 ? (
        <p className="text-[13px] text-text-muted">No payments recorded in the ledger.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {recent.map((p) => {
            const inv = model.data.invoices.get(p.invoice_id);
            const cust = inv ? model.data.customers.get(inv.customer_id) : undefined;
            const st = LEDGER_STATUS_META[ledgerStatus(p.payment_id, model.verifiedIds, model.candidateIds)];
            return (
              <li key={p.payment_id} className="flex flex-col gap-1 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium text-text">{cust?.name ?? MISSING.na}</span>
                  <span className="tabular-nums text-[13px] font-medium text-text">{formatInr(paise(p.amount_paise))}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                  <span>
                    {formatDate(p.paid_on)} ·{" "}
                    <Link href={`/invoices/${p.invoice_id}`} className={LINK}>
                      {inv?.invoice_number ?? p.invoice_id}
                    </Link>
                  </span>
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={onViewLedger} className={cn(LINK, "inline-flex w-fit items-center gap-1 text-sm")}>
        View full ledger <ArrowRight aria-hidden className="size-4" />
      </button>
    </aside>
  );
}
