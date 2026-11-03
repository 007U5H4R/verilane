import type { Metadata } from "next";
import { Suspense } from "react";

import { QueueView } from "@/components/queue/QueueView";
import { RowSkeleton } from "@/components/states/RowSkeleton";
import { shareMetadata } from "@/lib/site";

// TASK-27.3 / TC-088: /queue is fully static, so it's safe to carry an
// explicit og:url (the root layout deliberately omits one; see layout.tsx).
export const metadata: Metadata = {
  ...shareMetadata("/queue"),
};

// QueueView reads the URL (useSearchParams), so it renders client-side under
// this boundary while the rest of the route stays prerendered (static).
export default function QueuePage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading queue" />}>
      <QueueView />
    </Suspense>
  );
}
