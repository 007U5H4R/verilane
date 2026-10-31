import { Sparkles } from "lucide-react";

import { RoleSwitcher } from "@/components/shell/RoleSwitcher";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function TopBar({ crumb }: { crumb: string }) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-canvas px-7 py-3">
      <div className="mr-auto text-[13px] text-text-muted">
        <strong className="font-semibold text-text">{crumb}</strong>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text-muted">
        <Sparkles className="size-3.5" />
        Simulated LLM
      </span>
      <RoleSwitcher />
      <ThemeToggle />
    </header>
  );
}
