"use client";

import { useEffect } from "react";

/**
 * TASK-24.3: registers `public/sw.js`. Production-only — `e2e` runs via
 * `next build && next start` (NODE_ENV=production), so the e2e suite still
 * exercises the real service worker.
 *
 * Once the SW is ready, it is handed the static assets this page already
 * loaded (before the SW could intercept them) so a first visit works offline.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("/_next/static/"));
        registration.active?.postMessage({ type: "cache-urls", urls, page: window.location.pathname });
      })
      .catch((err) => {
        console.error("Service worker registration failed", err);
      });
  }, []);

  return null;
}
