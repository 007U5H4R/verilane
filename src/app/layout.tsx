import type { Metadata } from "next";

import { AppShell } from "@/components/shell/AppShell";
import { DataProviderLoader } from "@/components/DataProviderLoader";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// TASK-27.3: the deployed URL only exists from Stage 10 on, so
// NEXT_PUBLIC_SITE_URL is unset in dev/CI and this placeholder stands in —
// metadataBase still resolves og:image/og:url to an absolute https:// URL
// (TC-088), and TC-001's empty-env build keeps passing.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verilane.vercel.app";

// Design.md §22's exact OG tagline, reused as the meta description so the
// image and the link-preview text say the same thing.
const DESCRIPTION =
  "Every collection action has evidence. Every uncertain decision has a human.";

const OG_IMAGE_URL = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Verilane — AR Copilot",
  description: DESCRIPTION,
  // No explicit `url` here: setting one (even a constant site-wide string)
  // makes Next's Cache Components metadata resolver treat the dynamic
  // /invoices/[id] route's merged metadata as runtime data and block its
  // prerender. /queue (the only route og.spec.ts/TC-088 checks) sets its
  // own full openGraph object, url included, below in queue/page.tsx.
  openGraph: {
    title: "Verilane — AR Copilot",
    description: DESCRIPTION,
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

// TASK-6.5: sets data-theme on <html> before React hydrates, so a saved
// (or system) dark preference never flashes light on load/reload.
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("verilane-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <DataProviderLoader>
          <AppShell>{children}</AppShell>
        </DataProviderLoader>
        <Toaster />
      </body>
    </html>
  );
}
