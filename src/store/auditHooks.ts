/**
 * TASK-38 · Read-only lookups for the Audit Log detail drawer: does the
 * entity an event points at still exist? A related entity is linked only
 * when it does (a demo reset or re-seed can remove it). Nothing here writes.
 */
"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useDb } from "./hooks";

export interface RelatedRefs {
  invoiceId: string | null;
  disputeId: string | null;
  draftId: string | null;
  reviewId: string | null;
}

export interface RelatedExists {
  invoice: boolean;
  dispute: boolean;
  draft: boolean;
  review: boolean;
}

/** `undefined` while loading; otherwise which of `refs` exist right now. */
export function useRelatedExists(refs: RelatedRefs): RelatedExists | undefined {
  const db = useDb();
  const { invoiceId, disputeId, draftId, reviewId } = refs;
  return useLiveQuery(async () => {
    const [invoice, dispute, draft, review] = await Promise.all([
      invoiceId ? db.invoices.filter((i) => i.invoice_id === invoiceId).count() : 0,
      disputeId ? db.disputes.where("dispute_id").equals(disputeId).count() : 0,
      draftId ? db.drafts.where("draft_id").equals(draftId).count() : 0,
      reviewId ? db.reviewItems.where("review_id").equals(reviewId).count() : 0,
    ]);
    return { invoice: invoice > 0, dispute: dispute > 0, draft: draft > 0, review: review > 0 };
  }, [db, invoiceId, disputeId, draftId, reviewId]);
}
