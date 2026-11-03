import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoicesSkeleton, InvoicesView } from "@/components/invoices/InvoicesView";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <Suspense fallback={<InvoicesSkeleton />}>
      <InvoicesView />
    </Suspense>
  );
}
