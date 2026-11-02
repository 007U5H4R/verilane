import type { Metadata } from "next";
import { Suspense } from "react";

import { QuietSkeleton } from "@/components/onboarding/ShellGate";
import { OnboardingView } from "@/components/onboarding/OnboardingView";

export const metadata: Metadata = { title: "Product tour — Verilane" };

// OnboardingView reads ?step (useSearchParams), so it renders client-side
// under this boundary — same pattern as page.tsx / queue/page.tsx.
export default function OnboardingPage() {
  return (
    <Suspense fallback={<QuietSkeleton />}>
      <OnboardingView />
    </Suspense>
  );
}
