import { Suspense } from "react";
import { DisputeDetailSkeleton, DisputeDetailView } from "@/components/disputes/DisputeDetailView";

/**
 * Dispute detail. No `generateStaticParams` (dispute ids only exist in the
 * browser's IndexedDB), so the id is read client-side with `useParams()`
 * inside `<Suspense>`: the build prerenders a static shell with the
 * skeleton and the client fills it in.
 */
export default function DisputePage() {
  return (
    <Suspense fallback={<DisputeDetailSkeleton />}>
      <DisputeDetailView />
    </Suspense>
  );
}
