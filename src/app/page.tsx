import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeView } from "@/components/home/HomeView";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { shareMetadata } from "@/lib/site";

// DES-005: / is the URL people share, and it's static, so it carries og:url.
export const metadata: Metadata = {
  ...shareMetadata("/"),
};

// HomeView reads the URL (useSearchParams, for E2E-only state overrides), so
// it renders client-side under this boundary while the rest of the route
// stays prerendered (static) — same pattern as queue/page.tsx.
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeView />
    </Suspense>
  );
}
