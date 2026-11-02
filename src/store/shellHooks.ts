/**
 * TASK-38: data hooks for the app shell (global search, notifications bell).
 * Kept apart from `hooks.ts` so page-level work doesn't collide with shell
 * work. Every hook tolerates a missing db (pre-hydration / no IndexedDB).
 */
"use client";
import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { buildSearchIndex, type SearchEntry } from "@/domain/search/globalSearch";
import { approvalState } from "@/domain/draft";
import { DbContext } from "./hooks";

/** The search index, loaded only once the search box is in use. */
export function useSearchIndex(enabled: boolean): SearchEntry[] | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => {
    if (!db || !enabled) return undefined;
    const [invoices, customers, emails] = await Promise.all([
      db.invoices.toArray(),
      db.customers.toArray(),
      db.emails.toArray(),
    ]);
    return buildSearchIndex({ invoices, customers, emails });
  }, [db, enabled]);
}

export interface AttentionCounts {
  openDisputes: number;
  draftsAwaiting: number;
  needsReview: number;
}

/** Real counts behind the bell: open disputes, drafts awaiting approval, invoices in the needs-review band. */
export function useAttentionCounts(): AttentionCounts | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const [openDisputes, draftsAwaiting, needsReview] = await Promise.all([
      db.disputes.where("status").noneOf(["resolved", "rejected"]).count(),
      // Same predicate as useDraftCount, so the bell and the Drafts pill agree.
      db.drafts
        .where("status")
        .equals("validated")
        .filter((d) => approvalState(d) === "awaiting")
        .count(),
      db.priorities.where("band").equals("needs_review").count(),
    ]);
    return { openDisputes, draftsAwaiting, needsReview };
  }, [db]);
}
