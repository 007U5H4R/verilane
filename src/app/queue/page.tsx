import { Suspense } from "react";

import { QueueView } from "@/components/queue/QueueView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// QueueView reads the URL (useSearchParams), so it renders client-side under
// this boundary while the rest of the route stays prerendered (static).
export default function QueuePage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading queue" />}>
      <QueueView />
    </Suspense>
  );
}
