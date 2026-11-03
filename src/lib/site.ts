import type { Metadata } from "next";

// TASK-27.3 / TASK-49 DES-005: the one place the public site URL lives.
// NEXT_PUBLIC_SITE_URL is unset in dev/CI, so the fallback is the production
// host: metadataBase still resolves og:image/og:url to absolute https:// URLs
// (TC-088), and TC-001's empty-env build keeps passing.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verilane.tusharpathak.com";

// Design.md §22's exact OG tagline, reused as the meta description so the
// image and the link-preview text say the same thing.
export const DESCRIPTION =
  "Every collection action has evidence. Every uncertain decision has a human.";

export const OG_IMAGE_URL = `${SITE_URL}/og.png`;

const SHARE_TITLE = "Verilane — AR Copilot";

/**
 * The full openGraph + twitter objects for a route. A page-level `openGraph`
 * replaces the layout's rather than deep-merging, so each page that sets a
 * `url` must repeat the whole object. Pass `path` only on static routes: a
 * `url` in the root layout blocks the dynamic /invoices/[id] prerender.
 */
export function shareMetadata(path?: string): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title: SHARE_TITLE,
      description: DESCRIPTION,
      ...(path === undefined ? {} : { url: `${SITE_URL}${path}` }),
      siteName: "Verilane",
      type: "website",
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: SHARE_TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_TITLE,
      description: DESCRIPTION,
      images: [OG_IMAGE_URL],
    },
  };
}
