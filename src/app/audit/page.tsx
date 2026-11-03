import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditSkeleton, AuditView } from "@/components/audit/AuditView";

// TASK-49 DES-009: the tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Audit Log" };

export default function AuditPage() {
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <AuditView />
    </Suspense>
  );
}
