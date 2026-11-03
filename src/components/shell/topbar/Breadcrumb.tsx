import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

import type { Crumb } from "@/components/shell/breadcrumb";
import { CrumbLabel } from "@/components/shell/CrumbLabel";

/**
 * TASK-38: home icon, then the trail from crumbsFor(); the last crumb is the
 * current page. Below 768 only the current page shows (parents stay in the
 * DOM for assistive tech). An unknown route renders no trail (T34-5).
 * TASK-49: on the one-row bar (>=1280) parents never shrink; only the
 * current page truncates.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return <span className="min-w-0 max-md:flex-1" />;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 max-md:flex-1">
      <ol className="flex min-w-0 items-center gap-x-2 text-[15px] text-text-muted">
        <li className="hidden shrink-0 items-center md:flex">
          <Link
            href="/"
            aria-label="Home"
            className="grid size-8 place-items-center rounded-lg transition-colors duration-150 hover:bg-mint-pale hover:text-text"
          >
            <Home className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </Link>
        </li>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className={`items-center gap-x-2 ${last ? "flex min-w-0" : "hidden min-w-0 md:flex xl:min-w-fit xl:shrink-0"}`}>
              <ChevronRight
                className={`size-4 shrink-0 text-text-muted/70 ${i === 0 ? "hidden md:block" : ""}`}
                strokeWidth={1.75}
                aria-hidden
              />
              {c.href ? (
                <Link
                  href={c.href}
                  className="truncate whitespace-nowrap transition-colors duration-150 hover:text-text hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <strong aria-current="page" className="truncate font-semibold whitespace-nowrap text-text">
                  <CrumbLabel crumb={c} />
                </strong>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
