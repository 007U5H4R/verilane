import { describe, expect, it } from "vitest";

import { OG_IMAGE_URL, SITE_URL, shareMetadata } from "./site";

describe("site metadata (DES-005)", () => {
  it("falls back to the production host when NEXT_PUBLIC_SITE_URL is unset", () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) return;
    expect(SITE_URL).toBe("https://verilane.tusharpathak.com");
    expect(OG_IMAGE_URL).toBe("https://verilane.tusharpathak.com/og.png");
  });

  it("adds an absolute og:url only when a path is given", () => {
    expect(shareMetadata("/").openGraph).toMatchObject({ url: `${SITE_URL}/` });
    expect(shareMetadata().openGraph).not.toHaveProperty("url");
  });
});
