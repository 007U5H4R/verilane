import { describe, expect, it } from "vitest";

import { isAuthRoute, parseSession, resolveSession } from "./session";

describe("parseSession", () => {
  it("only recognises the guest flag", () => {
    expect(parseSession("guest")).toBe("guest");
    expect(parseSession(null)).toBeNull();
    expect(parseSession("admin")).toBeNull();
    expect(parseSession("")).toBeNull();
  });
});

describe("resolveSession", () => {
  it("returns the stored session whatever the build", () => {
    expect(resolveSession("guest", false, false)).toBe("guest");
    expect(resolveSession("guest", true, true)).toBe("guest");
  });
  it("has no session outside the e2e build", () => {
    expect(resolveSession(null, false, false)).toBeNull();
  });
  it("defaults to guest in the e2e build unless the spec opted out", () => {
    expect(resolveSession(null, true, false)).toBe("guest");
    expect(resolveSession(null, true, true)).toBeNull();
  });
});

describe("isAuthRoute", () => {
  it("matches the four shell-less routes and their sub-paths", () => {
    for (const r of ["/welcome", "/sign-in", "/sign-up", "/onboarding", "/onboarding/x"]) {
      expect(isAuthRoute(r)).toBe(true);
    }
  });
  it("does not match app routes or look-alikes", () => {
    for (const r of ["/", "/queue", "/welcomer", "/settings", null]) {
      expect(isAuthRoute(r)).toBe(false);
    }
  });
});
