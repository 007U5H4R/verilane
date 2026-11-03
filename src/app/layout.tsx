import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import { GateSkeleton, ShellGate } from "@/components/onboarding/ShellGate";
import { PwaRegister } from "@/components/PwaRegister";
import { Toaster } from "@/components/ui/sonner";
import { DESCRIPTION, SITE_URL, shareMetadata } from "@/lib/site";

import "./globals.css";

// Design.md R2 (TASK-38): Inter, self-hosted by next/font; exposed as
// --font-inter so globals.css builds the UI and display stacks from it.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Verilane — AR Copilot",
  description: DESCRIPTION,
  // No og:url here: setting one (even a constant site-wide string) makes
  // Next's Cache Components metadata resolver treat the dynamic
  // /invoices/[id] route's merged metadata as runtime data and block its
  // prerender. Static routes add their own via shareMetadata(path).
  ...shareMetadata(),
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
    // suppressHydrationWarning: THEME_SCRIPT sets data-theme before React
    // hydrates, so the server HTML never has it. This is the documented
    // pattern for a pre-paint theme script (Next docs: guides/
    // preventing-flash-before-hydration.md, "Themes") — it only ignores the
    // mismatch on this element's own attributes, not its children.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {/* TASK-39: ShellGate renders auth routes bare and gates the rest on
            the guest session. Suspense: it reads the pathname, which suspends
            while prerendering /invoices/[id]. */}
        <Suspense fallback={<GateSkeleton />}>
          <ShellGate>{children}</ShellGate>
        </Suspense>
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
