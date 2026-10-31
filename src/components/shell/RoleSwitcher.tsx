import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// TASK-6.5: role switching isn't implemented in v1 — real roles/permissions
// arrive later. The control is visible but disabled, with a reason on hover.
export function RoleSwitcher() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex rounded-full border border-border bg-surface p-0.5 opacity-60"
          role="group"
          aria-label="Role"
        >
          <button
            type="button"
            disabled
            aria-pressed="true"
            className="min-h-8 cursor-not-allowed rounded-full px-3 text-[13px] font-semibold bg-brand text-on-brand"
          >
            Analyst
          </button>
          <button
            type="button"
            disabled
            aria-pressed="false"
            className="min-h-8 cursor-not-allowed rounded-full px-3 text-[13px]"
          >
            Manager
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>Arrives with permissions</TooltipContent>
    </Tooltip>
  );
}
