import type { Metadata } from "next";
import { Suspense } from "react";
import { ExceptionsLoading } from "@/components/exceptions/ExceptionCards";
import { ExceptionsView } from "@/components/exceptions/ExceptionsView";

// The tab title names the page (root template adds " — Verilane").
export const metadata: Metadata = { title: "Exceptions" };

export default function ExceptionsPage() {
  return (
    <Suspense fallback={<ExceptionsLoading />}>
      <ExceptionsView />
    </Suspense>
  );
}
