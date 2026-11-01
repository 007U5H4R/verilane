import { NAV_ITEMS } from "@/components/shell/NavItems";

/** One step of the top-bar trail; the last one is the current page (no href). */
export type Crumb = { label: string; href?: string };

/** Detail routes and the nav section they sit under (Design.md mockup: "Queue › INV-…"). */
const PARENTS: Record<string, { label: string; href: string }> = {
  invoices: { label: "Queue", href: "/queue" },
  disputes: { label: "Disputes", href: "/disputes" },
};

const SUB_PAGES: Record<string, Crumb[]> = {
  "/settings/eval": [{ label: "Settings", href: "/settings" }, { label: "Evaluation report" }],
};

export function crumbsFor(pathname: string): Crumb[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const nav = NAV_ITEMS.find((item) => item.href === path);
  if (nav) return [{ label: nav.label }];
  const sub = SUB_PAGES[path];
  if (sub) return sub;

  const [section, id, ...rest] = path.split("/").filter(Boolean);
  const parent = section ? PARENTS[section] : undefined;
  if (parent && id && rest.length === 0) {
    let label = id;
    try {
      label = decodeURIComponent(id);
    } catch {
      // A malformed escape: show the raw segment rather than throw in the shell.
    }
    return [parent, { label }];
  }
  return [{ label: "Home" }];
}
