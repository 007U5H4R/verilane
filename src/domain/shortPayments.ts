/**
 * Short payments (TKT-75.05, Discovery F14, FS18, FS19). Pure: no I/O.
 *
 * A short payment is a PAID invoice whose applied bank lines add up to less
 * than its amount — the customer settled it and kept the gap as a deduction.
 * (An invoice still open with a partial payment is FS8, not a deduction.)
 * Every short payment is its own `short_payment` exception instance; a
 * customer with {@link PATTERN_MIN} or more of them inside any
 * {@link SHORT_PAYMENT_WINDOW_DAYS}-day window also gets exactly one
 * `short_payment_pattern`, linked to all of that customer's instances.
 *
 * FS18: the reason is the payer's own words (`payments.deduction_reason`),
 * verbatim. When none was stated the item says "Needs review" and no
 * deduction type is assumed (EXE150).
 */
import { daysBetween } from "./clock";
import { formatInr, paise, type Paise } from "./money";
import type { Exception, Invoice, Payment } from "./schema";

export const SHORT_PAYMENT_WINDOW_DAYS = 90;
export const PATTERN_MIN = 3;

export interface ShortPaymentLedger {
  invoices: readonly Invoice[];
  payments: readonly Payment[];
}

export interface ShortPayment {
  invoice_id: string;
  customer_id: string;
  /** The latest bank line applied to the invoice: the one that closed it short. */
  payment_id: string;
  paid_on: string;
  invoice_paise: Paise;
  paid_paise: Paise;
  deducted_paise: Paise;
  /** The payer's stated reason, verbatim; absent when none was given (FS18). */
  reason?: string;
}

/** Every short payment on the ledger, in invoice order. */
export function shortPaymentsOf(ledger: ShortPaymentLedger): ShortPayment[] {
  return ledger.invoices.flatMap((inv) => {
    if (inv.status !== "paid") return [];
    const applied = ledger.payments
      .filter((p) => p.invoice_id === inv.invoice_id)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.payment_id.localeCompare(b.payment_id));
    const last = applied.at(-1);
    if (last === undefined) return [];
    const paid = applied.reduce((sum, p) => sum + p.amount_paise, 0);
    if (paid >= inv.amount_paise) return [];
    const reason = [...applied].reverse().find((p) => p.deduction_reason !== undefined)?.deduction_reason;
    return [
      {
        invoice_id: inv.invoice_id,
        customer_id: inv.customer_id,
        payment_id: last.payment_id,
        paid_on: last.paid_on,
        invoice_paise: inv.amount_paise,
        paid_paise: paise(paid),
        deducted_paise: paise(inv.amount_paise - paid),
        ...(reason !== undefined && { reason }),
      },
    ];
  });
}

/** FS19: some {@link PATTERN_MIN} of these dates fall within one {@link SHORT_PAYMENT_WINDOW_DAYS}-day window (inclusive). */
export function hasShortPaymentPattern(dates: readonly string[]): boolean {
  const sorted = [...dates].sort();
  for (let i = 0; i + PATTERN_MIN - 1 < sorted.length; i++) {
    if (daysBetween(sorted[i]!, sorted[i + PATTERN_MIN - 1]!) <= SHORT_PAYMENT_WINDOW_DAYS) return true;
  }
  return false;
}

export const instanceId = (invoiceId: string) => `RV-SP-${invoiceId}`;
export const patternId = (customerId: string) => `RV-SPP-${customerId}`;
export const SHORT_PAYMENT_KINDS = ["short_payment", "short_payment_pattern"] as const;
export function isShortPaymentKind(kind: string): kind is (typeof SHORT_PAYMENT_KINDS)[number] {
  return (SHORT_PAYMENT_KINDS as readonly string[]).includes(kind);
}

function instance(sp: ShortPayment, linked: string[]): Exception {
  const amount = formatInr(sp.deducted_paise);
  return {
    review_id: instanceId(sp.invoice_id),
    kind: "short_payment",
    invoice_id: sp.invoice_id,
    payment_id: sp.payment_id,
    customer_id: sp.customer_id,
    deducted_paise: sp.deducted_paise,
    ...(sp.reason !== undefined && { deduction_reason: sp.reason }),
    linked_review_ids: linked,
    recommendation:
      sp.reason === undefined
        ? `Needs review: the customer paid ${amount} short and stated no reason`
        : `Check the stated reason before a Manager writes off ${amount}`,
    evidence_ids: [
      `${sp.payment_id}:payments.csv:amount_paise`,
      `${sp.payment_id}:payments.csv:deduction_reason`,
      `${sp.invoice_id}:invoices.csv:amount_paise`,
    ],
    validation_status: sp.reason === undefined ? "missing" : "verified",
    escalation_reason:
      sp.reason === undefined
        ? `Invoice closed ${amount} short with no reason stated`
        : `Invoice closed ${amount} short: “${sp.reason}”`,
    requires_role: "manager",
    status: "open",
  };
}

/**
 * The exception rows short payments raise: one `short_payment` per short
 * payment, plus one `short_payment_pattern` per patterned customer. The
 * pattern links every instance of that customer and carries the total
 * deducted; each of those instances links back to it.
 */
export function shortPaymentExceptionsFor(ledger: ShortPaymentLedger): Exception[] {
  const shorts = shortPaymentsOf(ledger);
  const byCustomer = new Map<string, ShortPayment[]>();
  for (const sp of shorts) byCustomer.set(sp.customer_id, [...(byCustomer.get(sp.customer_id) ?? []), sp]);

  const patterned = new Set(
    [...byCustomer].filter(([, list]) => hasShortPaymentPattern(list.map((s) => s.paid_on))).map(([c]) => c),
  );
  const instances = shorts.map((sp) => instance(sp, patterned.has(sp.customer_id) ? [patternId(sp.customer_id)] : []));

  const patterns = [...patterned].map((customerId): Exception => {
    const list = byCustomer.get(customerId)!;
    const total = paise(list.reduce((sum, s) => sum + s.deducted_paise, 0));
    const unexplained = list.filter((s) => s.reason === undefined).length;
    return {
      review_id: patternId(customerId),
      kind: "short_payment_pattern",
      customer_id: customerId,
      deducted_paise: total,
      linked_review_ids: list.map((s) => instanceId(s.invoice_id)),
      recommendation:
        unexplained > 0
          ? `Needs review: ${unexplained} of ${list.length} short payments state no reason`
          : `Review the ${list.length} short payments before a Manager writes off ${formatInr(total)}`,
      evidence_ids: list.map((s) => `${s.payment_id}:payments.csv:amount_paise`),
      validation_status: unexplained > 0 ? "missing" : "verified",
      escalation_reason: `${list.length} short payments, ${PATTERN_MIN} or more within ${SHORT_PAYMENT_WINDOW_DAYS} days, totalling ${formatInr(total)}`,
      requires_role: "manager",
      status: "open",
    };
  });
  return [...instances, ...patterns];
}
