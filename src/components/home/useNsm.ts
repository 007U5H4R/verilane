"use client";

import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { NsmInput } from "@/domain/nsm";
import { DbContext } from "@/store/hooks";

/**
 * The rows the North Star Metric is computed from (TKT-75.07, EXE170): the
 * audit log plus the current payments, exceptions, invoices, disputes and
 * PolicyDecisions. Live, so the figure moves as soon as an allocation or a
 * reversal commits. Returns rows, not the metric: `computeNsm` runs during
 * render inside the NSM block's error boundary. Tolerates a missing db
 * (returns `undefined`).
 */
export function useNsmInput(): NsmInput | undefined {
  const db = useContext(DbContext);
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const [audit, payments, exceptions, invoices, disputes, policyDecisions] = await Promise.all([
      db.audit.toArray(),
      db.payments.toArray(),
      db.exceptions.toArray(),
      db.invoices.toArray(),
      db.disputes.toArray(),
      db.policyDecisions.toArray(),
    ]);
    return { audit, payments, exceptions, invoices, disputes, policyDecisions };
  }, [db]);
}
