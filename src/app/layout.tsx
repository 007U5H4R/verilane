import type { Metadata } from "next";

import { AppShell } from "@/components/shell/AppShell";
import { DataProviderLoader } from "@/components/DataProviderLoader";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "Verilane — AR Copilot",
  description: "Demo accounts-receivable copilot.",
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
