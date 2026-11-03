import type { Metadata } from "next";
import { Suspense } from "react";

import { PaymentsView } from "@/components/payments/PaymentsView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Payments" };

// PaymentsView reads the URL (useSearchParams), so it renders client-side
// under this boundary while the rest of the route stays prerendered.
export default function PaymentsPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading payments" />}>
      <PaymentsView />
    </Suspense>
  );
}
