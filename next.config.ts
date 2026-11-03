import type { NextConfig } from "next";

// TASK-58 (SEC-002): a static CSP — cacheComponents (PPR) prerenders the shell,
// so per-request nonces aren't available. 'unsafe-inline' scripts cover the
// inline theme script in layout.tsx and Next's inline bootstrap; 'unsafe-eval'
// only in dev (React's dev tooling). All fetches are same-origin and fonts are
// self-hosted by next/font, so 'self' is enough everywhere else.
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  poweredByHeader: false,
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
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
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
