import type { Metadata } from "next";
import { Suspense } from "react";

import { QueueView } from "@/components/queue/QueueView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

// TASK-27.3 / TC-088: /queue is the route the OG e2e check loads, and it's
// fully static, so it's safe to carry an explicit openGraph.url here (the
// root layout deliberately omits one — see layout.tsx's comment — because
// that field blocks the dynamic /invoices/[id] route's prerender). Repeats
// the whole openGraph/twitter object rather than relying on deep-merge with
// the parent layout's metadata.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verilane.vercel.app";
const DESCRIPTION =
  "Every collection action has evidence. Every uncertain decision has a human.";
const OG_IMAGE_URL = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  openGraph: {
    title: "Verilane — AR Copilot",
    description: DESCRIPTION,
    url: `${SITE_URL}/queue`,
    siteName: "Verilane",
    type: "website",
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: "Verilane — AR Copilot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verilane — AR Copilot",
    description: DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
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
