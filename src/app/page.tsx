import { Suspense } from "react";

import { HomeView } from "@/components/home/HomeView";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";

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
