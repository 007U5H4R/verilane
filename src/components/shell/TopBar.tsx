import Link from "next/link";
import type { Crumb } from "@/components/shell/breadcrumb";
import { CrumbLabel } from "@/components/shell/CrumbLabel";
import { InstallChip } from "@/components/shell/InstallChip";
import { LlmStatusBadge } from "@/components/shell/LlmStatusBadge";
import { RoleSwitcher } from "@/components/shell/RoleSwitcher";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

// TASK-20.3: below 768 the crumb takes its own line and the controls stay on
// one non-wrapping row, so the theme toggle never wraps at 390px.
// TASK-34: detail pages show their trail ("Queue › INV-1042"), parents
// linked; an unknown route shows no trail rather than a false current page.
export function TopBar({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-canvas/75 px-4 py-3 backdrop-blur-sm md:px-7">
      {crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mr-auto min-w-0 text-[13px] text-text-muted">
          <ol className="flex flex-wrap items-baseline gap-x-1.5">
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-baseline gap-x-1.5">
                {i > 0 && <span aria-hidden="true">›</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <strong aria-current="page" className="break-all font-semibold text-text">
                    <CrumbLabel crumb={c} />
                  </strong>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <span className="mr-auto" />
      )}
      <div className="flex shrink-0 flex-nowrap items-center gap-2 md:gap-3">
        <LlmStatusBadge />
        <InstallChip />
        <RoleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
