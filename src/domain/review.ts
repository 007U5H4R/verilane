/**
 * Review items an email raises (TASK-13.2). Pure. Every non-matched outcome
 * becomes an `uncertain_match` item; a matched payment claim or duplicate
 * claim becomes a `reconciliation` item carrying the email's figure beside
 * the ledger's. The ledger is never overridden — these items only ask a
 * person to look.
 */
import { paise } from "./money";
import { outstandingOf } from "./priority";
import type { Extraction, Invoice, Match, Payment, Exception } from "./schema";

export interface ReviewLedger {
  invoices: Invoice[];
  payments: Payment[];
}

const evidenceId = (x: Extraction, field: string) => `${x.message_id}:emails.json:${field}`;

function emailEvidence(x: Extraction): string[] {
  if (x.status !== "valid") return [evidenceId(x, "status")];
  return [
    evidenceId(x, "email_class"),
    ...x.invoice_refs.map((_, i) => evidenceId(x, `invoice_refs[${i}]`)),
    ...x.amounts.map((_, i) => evidenceId(x, `amounts[${i}]`)),
  ];
}

function base(x: Extraction, review_id: string) {
  return {
    review_id,
    message_id: x.message_id,
    linked_review_ids: [] as string[],
    evidence_ids: emailEvidence(x),
    status: "open" as const,
  };
}

function uncertain(m: Match, x: Extraction): Exception {
  const recommendation =
    m.outcome === "unresolved"
      ? "Identify the sender before linking this email to any invoice"
      : "Confirm which invoice this email is about";
  return {
    ...base(x, `RV-${m.message_id}-match`),
    kind: "uncertain_match",
    recommendation,
    validation_status: m.outcome === "ambiguous" ? "conflict" : "missing",
    escalation_reason: m.reason,
    requires_role: "analyst",
  };
}

export function exceptionsFor(m: Match, x: Extraction, ledger: ReviewLedger): Exception[] {
  if (m.outcome !== "matched" || !m.invoice_id) return [uncertain(m, x)];
  if (x.status !== "valid") return [];

  const outstanding = (id: string) => {
    const inv = ledger.invoices.find((i) => i.invoice_id === id);
    return inv ? outstandingOf(inv, ledger) : undefined;
  };

  switch (x.email_class) {
    case "dispute":
      return [
        {
          ...base(x, `RV-${m.message_id}-dispute`),
          kind: "dispute",
          invoice_id: m.invoice_id,
          recommendation: "Open a dispute and hold reminders until it is resolved",
          validation_status: "verified",
          escalation_reason: `Customer disputes the invoice${x.dispute_type ? ` (${x.dispute_type.replace(/_/g, " ")})` : ""}`,
          requires_role: "manager",
        },
      ];

    case "duplicate": {
      // FS6: one item per invoice of the pair, linked; neither is marked paid.
      const ids = m.candidates.map((id) => `RV-${m.message_id}-${id}`);
      return m.candidates.map((invoiceId, i) => {
        const ledgerOutstanding = outstanding(invoiceId);
        return {
          ...base(x, ids[i]!),
          kind: "reconciliation" as const,
          invoice_id: invoiceId,
          linked_review_ids: ids.filter((_, j) => j !== i),
          recommendation: "Check whether these invoices bill the same supply; cancel one only after review",
          validation_status: "conflict" as const,
          escalation_reason: "Customer says this invoice duplicates another",
          requires_role: "manager" as const,
          ...(ledgerOutstanding !== undefined && { ledger_outstanding_paise: ledgerOutstanding }),
        };
      });
    }

    case "confirmation": {
      const ledgerOutstanding = outstanding(m.invoice_id);
      // Already settled in the ledger: nothing to reconcile.
      if (ledgerOutstanding === undefined || ledgerOutstanding <= 0) return [];
      const claimed = x.payment_claim?.amount_paise ?? null;
      const differs = claimed !== null && claimed !== ledgerOutstanding;
      return [
        {
          ...base(x, `RV-${m.message_id}-reconcile`),
          kind: "reconciliation",
          invoice_id: m.invoice_id,
          recommendation: "Match the claimed payment against the bank statement before any reminder",
          validation_status: differs ? "conflict" : "verified",
          escalation_reason: differs
            ? "Email's paid amount differs from the ledger outstanding"
            : "Email says paid; the ledger shows no matching payment",
          requires_role: "manager",
          ...(claimed !== null && { email_amount_paise: paise(claimed) }),
          ledger_outstanding_paise: ledgerOutstanding,
        },
      ];
    }

    default:
      return [];
  }
}

const paymentEvidence = (p: Payment) => [
  `${p.payment_id}:payments.csv:amount_paise`,
  `${p.payment_id}:payments.csv:invoice_id`,
];

/**
 * Unallocated-payment exceptions (TKT-75.02, EXE124). Pure and deterministic:
 * one per unapplied payment, id `RV-PAY-<payment_id>`. Candidates are the open
 * invoices (not paid / written off) whose outstanding equals the payment, in
 * ledger order. Exactly one candidate is named as `invoice_id`; the Analyst
 * still confirms it before `allocate_payment` runs.
 */
export function paymentExceptionsFor(ledger: ReviewLedger): Exception[] {
  return ledger.payments
    .filter((p) => p.invoice_id === null)
    .map((p) => {
      const candidates = ledger.invoices
        .filter((inv) => inv.status !== "paid" && inv.status !== "written_off")
        .filter((inv) => {
          const out = outstandingOf(inv, ledger);
          return out > 0 && out === p.amount_paise;
        })
        .map((inv) => inv.invoice_id);
      const only = candidates.length === 1 ? candidates[0] : undefined;
      return {
        review_id: `RV-PAY-${p.payment_id}`,
        kind: "unallocated_payment" as const,
        payment_id: p.payment_id,
        ...(only !== undefined && { invoice_id: only }),
        candidate_invoice_ids: candidates,
        linked_review_ids: [],
        recommendation:
          only !== undefined
            ? `Allocate this payment to ${only} after checking the bank line`
            : candidates.length === 0
              ? "Find the invoice this payment settles before allocating it"
              : "Choose which of the matching invoices this payment settles",
        evidence_ids: paymentEvidence(p),
        validation_status: only !== undefined ? "verified" : candidates.length === 0 ? "missing" : "conflict",
        escalation_reason:
          only !== undefined
            ? "Bank line has no invoice; its amount matches exactly one open invoice"
            : candidates.length === 0
              ? "Bank line has no invoice and matches no open invoice"
              : "Bank line has no invoice; its amount matches several open invoices",
        requires_role: "analyst" as const,
        status: "open" as const,
      };
    });
}
