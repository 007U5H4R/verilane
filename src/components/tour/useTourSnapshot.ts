/**
 * TASK-44: the live facts the tour advances on, read from the database
 * (never from DOM clicks). Undefined while any query is still loading.
 */
"use client";

import { TOUR_INVOICES } from "@/domain/tour/invoices";
import { useAutopilotPolicy, useInvoiceDraft, useRole } from "@/store/hooks";
import type { TourSnapshot } from "./steps";
import { toTourDraft } from "./tourDraft";

export function useTourSnapshot(): TourSnapshot | undefined {
  const role = useRole();
  const policy = useAutopilotPolicy();
  const a = useInvoiceDraft(TOUR_INVOICES.a);
  const b = useInvoiceDraft(TOUR_INVOICES.b);
  if (policy === undefined || a === undefined || b === undefined) return undefined;
  return { role, autopilotEnabled: policy.enabled, draftA: toTourDraft(a), draftB: toTourDraft(b) };
}
