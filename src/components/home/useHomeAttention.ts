"use client";

import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { PaymentExceptionLike, PaymentReviewLike } from "@/domain/home/attention";
import { isEmailException, isPaymentExceptionKind, type EmailException, type Exception } from "@/domain/schema";
import { DbContext } from "@/store/hooks";

const PAYMENT_REVIEW_KINDS = new Set(["uncertain_match", "reconciliation"]);

/**
 * Open payment review items (uncertain matches, reconciliations) for the Home
 * feed — the same predicate as `usePaymentsData().exceptions`, without
 * loading the whole ledger, emails and matches. Live; tolerates a missing db
 * (returns `undefined`). Sorted like the Payments page.
 */
export function useOpenPaymentReviews(): PaymentReviewLike[] | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => {
    if (!db) return undefined;
    // Rows are schema-validated on load; same cast as `usePaymentsData`.
    const rows = (await db.exceptions.where("status").equals("open").toArray()) as Exception[];
    return rows
      .filter((r): r is EmailException => PAYMENT_REVIEW_KINDS.has(r.kind) && isEmailException(r))
      .sort((a, b) => a.message_id.localeCompare(b.message_id) || a.review_id.localeCompare(b.review_id))
      .map((r) => ({
        review_id: r.review_id,
        kind: r.kind as PaymentReviewLike["kind"],
        invoice_id: r.invoice_id,
        email_amount_paise: r.email_amount_paise === undefined ? undefined : Number(r.email_amount_paise),
      }));
  }, [db]);
}

/**
 * Open payment-originated exceptions (unallocated payments) for the Home
 * feed's "exceptions" group (TKT-75.02), with the bank line's amount. Live;
 * tolerates a missing db (returns `undefined`). Sorted by id.
 */
export function useOpenPaymentExceptions(): PaymentExceptionLike[] | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = (await db.exceptions.where("status").equals("open").toArray()) as Exception[];
    const payments = new Map((await db.payments.toArray()).map((p) => [p.payment_id, p]));
    return rows
      .filter((r) => isPaymentExceptionKind(r.kind))
      .sort((a, b) => a.review_id.localeCompare(b.review_id))
      .map((r) => ({
        review_id: r.review_id,
        kind: r.kind as PaymentExceptionLike["kind"],
        payment_id: r.payment_id,
        amount_paise: r.payment_id !== undefined ? payments.get(r.payment_id)?.amount_paise : undefined,
      }));
  }, [db]);
}
