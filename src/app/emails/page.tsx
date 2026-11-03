import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailsView } from "@/components/emails/EmailsView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Email Conversations" };

export default function EmailsPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading email conversations" />}>
      <EmailsView />
    </Suspense>
  );
}
