import { Suspense } from "react";
import { DraftsView } from "@/components/drafts/DraftsView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

export default function DraftsPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading drafts" />}>
      <DraftsView />
    </Suspense>
  );
}
