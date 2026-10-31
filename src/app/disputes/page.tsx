import { Suspense } from "react";
import { DisputesView } from "@/components/disputes/DisputesView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

export default function DisputesPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading disputes" />}>
      <DisputesView />
    </Suspense>
  );
}
