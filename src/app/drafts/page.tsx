import type { Metadata } from "next";
import { Suspense } from "react";
import { DraftsView } from "@/components/drafts/DraftsView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Drafts" };

export default function DraftsPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading drafts" />}>
      <DraftsView />
    </Suspense>
  );
}
