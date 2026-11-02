import { Suspense } from "react";
import { InvoicesSkeleton, InvoicesView } from "@/components/invoices/InvoicesView";

export default function InvoicesPage() {
  return (
    <Suspense fallback={<InvoicesSkeleton />}>
      <InvoicesView />
    </Suspense>
  );
}
