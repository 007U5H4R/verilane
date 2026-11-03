import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputesView } from "@/components/disputes/DisputesView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Disputes" };

export default function DisputesPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading disputes" />}>
      <DisputesView />
    </Suspense>
  );
}
