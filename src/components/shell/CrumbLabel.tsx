"use client";

import { useContext } from "react";
import type { Crumb, CrumbResolve } from "@/components/shell/breadcrumb";
import { DbContext, useDispute, useInvoice } from "@/store/hooks";

/**
 * A crumb's label as the page itself names the record (T34-1): an invoice by
 * its invoice number (what the Queue row and header show, not the internal
 * invoice_id), a dispute by its customer (the detail page's heading). Falls
 * back to the route id while loading, when the record is missing, or when the
 * shell has no database.
 */
export function CrumbLabel({ crumb }: { crumb: Crumb }) {
  const db = useContext(DbContext);
  if (!crumb.resolve || !db) return <>{crumb.label}</>;
  return crumb.resolve.kind === "invoice" ? (
    <InvoiceLabel target={crumb.resolve} fallback={crumb.label} />
  ) : (
    <DisputeLabel target={crumb.resolve} fallback={crumb.label} />
  );
}

function InvoiceLabel({ target, fallback }: { target: CrumbResolve; fallback: string }) {
  const found = useInvoice(target.id);
  return <>{found?.invoice.invoice_number ?? fallback}</>;
}

function DisputeLabel({ target, fallback }: { target: CrumbResolve; fallback: string }) {
  const found = useDispute(target.id);
  return <>{found?.customer?.name ?? fallback}</>;
}
