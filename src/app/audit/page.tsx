import { Suspense } from "react";
import { AuditSkeleton, AuditView } from "@/components/audit/AuditView";

export default function AuditPage() {
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <AuditView />
    </Suspense>
  );
}
