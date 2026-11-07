import type { Metadata } from "next";
import { Suspense } from "react";
import { ExceptionDetailSkeleton } from "@/components/exceptions/ExceptionDetailParts";
import { ExceptionDetailView } from "@/components/exceptions/ExceptionDetailView";

// The tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Exception" };

/**
 * Exception detail. Like `/disputes/[id]`: exception ids only exist in the
 * browser's IndexedDB, so there is no `generateStaticParams`; the id is read
 * client-side with `useParams()` inside `<Suspense>`.
 */
export default function ExceptionPage() {
  return (
    <Suspense fallback={<ExceptionDetailSkeleton />}>
      <ExceptionDetailView />
    </Suspense>
  );
}
