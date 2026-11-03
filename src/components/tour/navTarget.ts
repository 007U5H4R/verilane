/**
 * TASK-44: the `data-tour` id for a nav link, so the tour can point at the
 * sidebar / icon-rail link a step needs. Untagged links return undefined.
 */
const NAV_TOUR_IDS: Record<string, string> = {
  "/queue": "nav-queue",
  "/settings": "nav-settings",
  "/audit": "nav-audit",
};

export function navTourId(href: string): string | undefined {
  return NAV_TOUR_IDS[href];
}
