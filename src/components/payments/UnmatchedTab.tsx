"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/domain/clock";
import { can, type Role } from "@/domain/permissions";
import { MISSING, type StoredReviewItem, type Tone } from "@/domain/payments/reconcile";
import type { Invoice, Match } from "@/domain/schema";
import { useExecute } from "@/store/hooks";
import { cn } from "@/lib/cn";
import { CommandDialog, NoteField } from "./CaseActions";
import type { PaymentsModel } from "./model";
import { CARD, DeniedReason, LINK } from "./parts";
import { StatusPill } from "./tone";

const OUTCOME: Record<Match["outcome"], { label: string; tone: Tone }> = {
  matched: { label: "Matched", tone: "verified" },
  ambiguous: { label: "Ambiguous", tone: "ambiguous" },
  customer_only: { label: "Customer only", tone: "pending" },
  unresolved: { label: "Unresolved sender", tone: "unknown" },
};

/** Emails the strict matcher could not tie to exactly one invoice. Nothing is linked automatically. */
export function UnmatchedTab({ model, role }: { model: PaymentsModel; role: Role }) {
  const items = [...model.unmatched].sort((a, b) => {
    const sa = model.data.emails.get(a.message_id)?.sent_at ?? "";
    const sb = model.data.emails.get(b.message_id)?.sent_at ?? "";
    return sb.localeCompare(sa) || a.review_id.localeCompare(b.review_id);
  });
  if (items.length === 0) {
    return (
      <p className={cn(CARD, "p-4 text-[13px] text-text-muted")} data-testid="unmatched-empty">
        Every email is tied to one invoice.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Unmatched emails">
      {items.map((item) => (
        <UnmatchedItem key={item.review_id} item={item} model={model} role={role} />
      ))}
    </ul>
  );
}

type DialogId = "assign" | "link" | "irrelevant" | "escalate" | "approve";

function UnmatchedItem({ item, model, role }: { item: StoredReviewItem; model: PaymentsModel; role: Role }) {
  const execute = useExecute();
  const deniedId = useId();
  const email = model.data.emails.get(item.message_id);
  const match = model.data.matches.get(item.message_id);
  const invoices = model.data.invoices;
  const invoiceIds = item.invoice_id ? [item.invoice_id] : (match?.candidates ?? []);
  const emailInvoice = invoiceIds[0];
  const outcome = OUTCOME[match?.outcome ?? "unresolved"];
  const customer = match?.customer_id ? model.data.customers.get(match.customer_id) : undefined;
  const numberOf = (id: string) => invoices.get(id)?.invoice_number ?? id;

  // Link targets: only the sender's own customer's invoices (never across customers).
  const linkTargets: Invoice[] = (() => {
    const cid = match?.customer_id;
    if (!cid) return [];
    const cited = invoiceIds.map((id) => invoices.get(id)).filter((i): i is Invoice => !!i && i.customer_id === cid);
    if (cited.length > 0) return cited;
    return [...invoices.values()].filter((i) => i.customer_id === cid).sort((a, b) => (a.invoice_number ?? a.invoice_id).localeCompare(b.invoice_number ?? b.invoice_id));
  })();

  const subject = { kind: "review" as const, id: item.review_id, review_kind: item.kind, requires_role: item.requires_role };
  const dismiss = can(role, "dismiss_review", subject);
  const decide = can(role, "reconcile_decide", subject);

  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<"analyst" | "manager">("manager");
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const open = (d: DialogId) => {
    setNote("");
    setConfirmed(false);
    setTarget(linkTargets.length === 1 ? linkTargets[0]!.invoice_id : "");
    setDialog(d);
  };
  const close = (o: boolean) => {
    if (!o) setDialog(null);
  };
  const flag = (payload: Record<string, unknown>) =>
    execute({ type: "reconcile_flag", subject: { kind: "review", id: item.review_id }, payload }).then(() => undefined);

  const btn = "rounded-full";
  const radioName = `link-${item.review_id}`;

  return (
    <li data-testid="review-item" data-kind={item.kind} data-message={item.message_id} className={cn(CARD, "flex flex-col gap-2 p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={outcome.tone}>{outcome.label}</StatusPill>
          {item.workflow_state === "manager_review" && <StatusPill tone="pending">Manager review</StatusPill>}
          {item.proposed_invoice_id && <StatusPill tone="info">Link proposed: {numberOf(item.proposed_invoice_id)}</StatusPill>}
        </div>
        <span className="text-xs tabular-nums text-text-muted">{email ? formatDateTime(email.sent_at) : MISSING.na}</span>
      </div>
      <p className="text-[13px] font-medium text-text">{item.escalation_reason}</p>

      <p className="text-xs text-text-muted">
        Email{" "}
        {emailInvoice ? (
          <Link href={`/invoices/${emailInvoice}#ev-communication`} className={cn("font-mono", LINK)} aria-label={`Open email ${item.message_id}`}>
            {item.message_id}
          </Link>
        ) : (
          <span className="font-mono text-text">{item.message_id}</span>
        )}
        {email && (
          <>
            {" · "}
            <span className="text-text">{email.subject}</span>
            {" · "}
            {email.from_address}
          </>
        )}
        {" · Customer "}
        <span className="text-text">{customer?.name ?? MISSING.na}</span>
      </p>

      {/* No invoice to link to: the email is still reachable inline (M-002 R14). */}
      {!emailInvoice && email && (
        <details className="text-xs">
          <summary aria-label={`Open email ${item.message_id}`} className={cn("w-fit cursor-pointer", LINK)}>
            Open email {item.message_id}
          </summary>
          <article
            data-testid="communication-message"
            data-thread={email.thread_id}
            className="mt-1 rounded-md border border-border bg-canvas p-2 text-text"
          >
            <p className="font-medium">{email.subject}</p>
            <p className="text-text-muted">
              {email.from_address} · {formatDate(email.sent_at.slice(0, 10))} · {email.thread_id}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{email.body}</p>
          </article>
        </details>
      )}

      <p className="text-xs text-text-muted">
        {item.invoice_id ? "Invoice " : invoiceIds.length > 0 ? "Possible invoices " : "No invoice identified"}
        {invoiceIds.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            <Link href={`/invoices/${id}`} className={LINK}>
              {numberOf(id)}
            </Link>
          </span>
        ))}
      </p>
      <p className="text-xs text-text-muted">
        {item.recommendation} · {item.requires_role === "manager" ? "Manager" : "Analyst"} review
        {item.assignee && ` · Assigned to ${item.assignee === "manager" ? "Manager" : "Analyst"}`}
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${item.message_id}`}>
        <Button size="sm" variant="outline" className={btn} onClick={() => open("assign")}>
          Assign
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={btn}
          onClick={() => open("link")}
          disabled={linkTargets.length === 0}
          title={linkTargets.length === 0 ? "The sender’s customer is unknown, so no link can be proposed." : undefined}
        >
          Propose invoice link
        </Button>
        {dismiss.allowed ? (
          <Button size="sm" variant="outline" className={btn} onClick={() => open("irrelevant")}>
            Mark irrelevant
          </Button>
        ) : (
          <Button size="sm" variant="outline" className={btn} aria-disabled="true" aria-describedby={deniedId} onClick={(e) => e.preventDefault()}>
            Mark irrelevant
          </Button>
        )}
        <Button size="sm" variant="outline" className={btn} onClick={() => open("escalate")}>
          Escalate to Manager
        </Button>
        {item.proposed_invoice_id && decide.allowed && (
          <Button size="sm" className={btn} onClick={() => open("approve")}>
            Approve link
          </Button>
        )}
      </div>
      {!dismiss.allowed && <DeniedReason id={deniedId}>{dismiss.reason}</DeniedReason>}
      {linkTargets.length === 0 && (
        <p className="text-xs text-text-muted">The sender’s customer is unknown, so no invoice link can be proposed. {MISSING.review}</p>
      )}

      <CommandDialog
        open={dialog === "assign"}
        onOpenChange={close}
        title={`Assign ${item.message_id}?`}
        description={<p>Records who owns this email. Nothing else changes.</p>}
        confirmLabel="Assign"
        success="Email assigned."
        onConfirm={() => flag({ step: "assign", assignee })}
      >
        <fieldset className="flex gap-4 text-sm text-text">
          <legend className="mb-1 text-sm font-medium">Assign to</legend>
          {(["analyst", "manager"] as const).map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="radio" name={`assign-${item.review_id}`} className="accent-brand" checked={assignee === a} onChange={() => setAssignee(a)} />
              {a === "manager" ? "Manager" : "Analyst"}
            </label>
          ))}
        </fieldset>
      </CommandDialog>

      <CommandDialog
        open={dialog === "link"}
        onOpenChange={close}
        title={`Propose a link for ${item.message_id}?`}
        description={
          <p>
            Sends the link to a Manager for approval. Only {customer?.name ?? "the sender’s customer"}’s invoices are offered — an email is
            never linked across customers, and nothing is linked until a Manager approves.
          </p>
        }
        confirmLabel="Send for approval"
        canConfirm={target !== ""}
        success="Link proposed for Manager review."
        onConfirm={() => flag({ step: "request_link", invoice_id: target, ...(note.trim() ? { note: note.trim() } : {}) })}
      >
        <fieldset className="flex flex-col gap-2 text-sm text-text">
          <legend className="mb-1 text-sm font-medium">Invoice</legend>
          {linkTargets.map((inv) => (
            <label key={inv.invoice_id} className="flex items-center gap-2">
              <input
                type="radio"
                name={radioName}
                className="accent-brand"
                checked={target === inv.invoice_id}
                onChange={() => setTarget(inv.invoice_id)}
              />
              {inv.invoice_number ?? inv.invoice_id}
            </label>
          ))}
        </fieldset>
        <NoteField label="Note" value={note} onChange={setNote} />
      </CommandDialog>

      <CommandDialog
        open={dialog === "irrelevant"}
        onOpenChange={close}
        title={`Mark ${item.message_id} as irrelevant?`}
        description={<p>Closes this review item. The email stays on record and no invoice or ledger entry changes.</p>}
        confirmLabel="Mark irrelevant"
        success="Marked irrelevant."
        onConfirm={() => execute({ type: "dismiss_review", subject: { kind: "review", id: item.review_id } }).then(() => undefined)}
      />

      <CommandDialog
        open={dialog === "escalate"}
        onOpenChange={close}
        title={`Escalate ${item.message_id} to a Manager?`}
        description={<p>The email moves to Manager review with your reason.</p>}
        confirmLabel="Escalate"
        canConfirm={note.trim() !== ""}
        success="Escalated to a Manager."
        onConfirm={() => flag({ step: "escalate", note: note.trim() })}
      >
        <NoteField label="Reason" value={note} onChange={setNote} required />
      </CommandDialog>

      {item.proposed_invoice_id && (
        <CommandDialog
          open={dialog === "approve"}
          onOpenChange={close}
          title={`Approve linking ${item.message_id} to ${numberOf(item.proposed_invoice_id)}?`}
          description={<p>Records the link on this review item. The ledger and the invoice balance do not change.</p>}
          confirmLabel="Approve link"
          canConfirm={confirmed}
          success="Link approved."
          onConfirm={() =>
            execute({
              type: "reconcile_decide",
              subject: { kind: "review", id: item.review_id },
              payload: { decision: "approve_link", confirmed: true },
            }).then(() => undefined)
          }
        >
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="accent-brand" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I have checked this email belongs to {numberOf(item.proposed_invoice_id)}.
          </label>
        </CommandDialog>
      )}
    </li>
  );
}
