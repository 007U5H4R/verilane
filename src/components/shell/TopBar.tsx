import { InstallChip } from "@/components/shell/InstallChip";
import { LlmStatusBadge } from "@/components/shell/LlmStatusBadge";
import { RoleSwitcher } from "@/components/shell/RoleSwitcher";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

// TASK-20.3: below 768 the crumb takes its own line and the controls stay on
// one non-wrapping row, so the theme toggle never wraps at 390px.
export function TopBar({ crumb }: { crumb: string }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-canvas px-4 py-3 md:px-7">
      <div className="mr-auto text-[13px] text-text-muted">
        <strong className="font-semibold text-text">{crumb}</strong>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center gap-2 md:gap-3">
        <LlmStatusBadge />
        <InstallChip />
        <RoleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
