import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

// TASK-58 (SEC-002): every route ships a static security header set.
// The CSP is static (no nonce) because cacheComponents/PPR can't use nonces.
async function headersFor(source: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === source);
  return new Map((rule?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
}

describe("security headers (TASK-58)", () => {
  it("disables the x-powered-by header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies a catch-all static CSP that forbids framing and plugins", async () => {
    const csp = (await headersFor("/(.*)")).get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("\n");
  });

  it("does not allow unsafe-eval outside development", async () => {
    const csp = (await headersFor("/(.*)")).get("content-security-policy") ?? "";
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("sets nosniff, a referrer policy, a permissions policy and frame denial", async () => {
    const h = await headersFor("/(.*)");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(h.get("x-frame-options")).toBe("DENY");
  });

  it("keeps the stricter service-worker headers", async () => {
    const h = await headersFor("/sw.js");
    expect(h.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    expect(h.get("content-security-policy")).toBe("default-src 'self'; script-src 'self'");
  });
});
