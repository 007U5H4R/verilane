import { Suspense } from "react";
import { InvestigationSkeleton, InvestigationView } from "@/components/investigation/InvestigationView";

/**
 * Investigation. No `generateStaticParams` (invoice ids only exist in the
 * browser's IndexedDB), so the id is read client-side with `useParams()`
 * inside `<Suspense>`: the build prerenders a static shell with the skeleton
 * and the client fills it in.
 */
export default function InvoicePage() {
  return (
    <Suspense fallback={<InvestigationSkeleton />}>
      <InvestigationView />
    </Suspense>
  );
}
