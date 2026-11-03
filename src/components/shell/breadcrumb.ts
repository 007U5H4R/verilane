import { NAV_ITEMS } from "@/components/shell/NavItems";

/** A detail crumb whose label the top bar resolves from the store (T34-1). */
export type CrumbResolve = { kind: "invoice" | "dispute"; id: string };

/**
 * One step of the top-bar trail; the last one is the current page (no href).
 * `label` is what shows until (or unless) `resolve` finds a better one.
 */
export type Crumb = { label: string; href?: string; resolve?: CrumbResolve };

/** Detail routes and the nav section they sit under (TASK-38: invoices sit under the Invoices register). */
const PARENTS: Record<string, { label: string; href: string; kind: CrumbResolve["kind"] }> = {
  invoices: { label: "Invoices", href: "/invoices", kind: "invoice" },
  disputes: { label: "Disputes", href: "/disputes", kind: "dispute" },
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
    return [
      { label: parent.label, href: parent.href },
      { label, resolve: { kind: parent.kind, id: label } },
    ];
  }
  // An unknown route has no place in the trail; claiming "Home" would announce
  // the wrong current page (T34-5).
  return [];
}

/**
 * The nav item to highlight for a route: the route itself, or the section its
 * trail sits under, so a detail page lights up its parent (T34-6). Unknown
 * routes have none.
 */
export function navHrefFor(pathname: string): string | undefined {
  const [first, ...rest] = crumbsFor(pathname);
  if (!first) return undefined;
  if (rest.length > 0) return first.href;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return NAV_ITEMS.find((item) => item.href === path)?.href;
}
