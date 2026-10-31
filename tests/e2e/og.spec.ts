import { test, expect } from "@playwright/test";

// TC-088 (e2e half): the built page's <head> must carry well-formed
// link-preview meta tags with an absolute https:// og:image, so a scraper
// (LinkedIn, Slack, etc.) can resolve the preview without the page's own
// origin to fall back on.

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1] ?? null;
}

test("queue page carries well-formed OG/Twitter link-preview meta tags", async ({ page }) => {
  const response = await page.goto("/queue");
  expect(response?.ok()).toBe(true);
  const html = await page.content();

  const ogImage = metaContent(html, "property", "og:image");
  const ogUrl = metaContent(html, "property", "og:url");

  expect(metaContent(html, "property", "og:title")).toBeTruthy();
  expect(metaContent(html, "property", "og:description")).toBeTruthy();
  expect(ogImage).toMatch(/^https:\/\/.+\/og\.png$/);
  expect(ogUrl).toMatch(/^https:\/\//);
  expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
  expect(metaContent(html, "name", "twitter:image")).toMatch(/^https:\/\/.+\/og\.png$/);

  // The image itself must actually resolve (not a 404 behind a correct tag).
  // og:image is absolute against NEXT_PUBLIC_SITE_URL's placeholder prod
  // domain (real only from Stage 10 on — see layout.tsx's comment), so this
  // asserts the asset serves by re-requesting its path against the app
  // actually under test, not the not-yet-deployed placeholder host.
  const imagePath = new URL(ogImage ?? "", "http://placeholder").pathname;
  const imageRes = await page.request.get(imagePath);
  expect(imageRes.ok()).toBe(true);
  expect(imageRes.headers()["content-type"]).toContain("image/png");
});
