import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // TASK-25: always give NEXT_PUBLIC_E2E a build-time value. Left unset, it is
  // not inlined, so the `"1" === process.env.NEXT_PUBLIC_E2E` guards survive as
  // runtime checks and the e2e-only `?__state=` / `window.__verilane` hooks
  // ship (inert) in the production bundle. A literal "0" lets the minifier
  // drop them; `pnpm check:e2e-hooks` enforces it.
  env: {
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E === "1" ? "1" : "0",
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // TASK-24 (T24-10): the service worker script must never be HTTP-cached,
  // so a fixed sw.js reaches users on their next load (Next PWA guide).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
