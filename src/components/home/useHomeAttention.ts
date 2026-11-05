"use client";

import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { PaymentReviewLike } from "@/domain/home/attention";
import { isEmailException, type EmailException, type Exception } from "@/domain/schema";
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
