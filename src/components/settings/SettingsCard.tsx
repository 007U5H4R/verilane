import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "brand" | "warn" | "info";

const TONE: Record<Tone, string> = {
  brand: "bg-mint-pale text-brand",
  warn: "bg-med-bg text-med",
  info: "bg-info-bg text-info",
};

/** The square icon tile that leads every Settings card and sub-block. */
export function IconTile({ icon: Icon, tone = "brand", small }: { icon: LucideIcon; tone?: Tone; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        small ? "size-8 [&_svg]:size-4" : "size-10 [&_svg]:size-5",
        TONE[tone],
      )}
    >
      <Icon />
    </span>
  );
}

/**
 * A Settings card (TASK-38): icon tile, title and one-line description, then
 * the card's controls. `id` is the in-page anchor (/settings#import etc.).
 */
export function SettingsCard({
  id,
  title,
  description,
  icon,
  tone,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex min-w-0 scroll-mt-6 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`${id}-title`} className="text-base font-semibold text-text">
            {title}
          </h2>
          {description && <p className="text-[13px] text-text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * A titled block inside a card (Import / Export / Reset inside Data
 * management). Keeps its own anchor so deep links like /settings#import work.
 */
export function SettingsSubsection({
  id,
  title,
  description,
  icon,
  tone,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  /** Right-aligned control on wide screens (e.g. the Reset button). */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex min-w-0 scroll-mt-6 flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={icon} tone={tone} small />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id={`${id}-title`} className="text-sm font-semibold text-text">
              {title}
            </h3>
            <p className="text-[13px] text-text-muted">{description}</p>
          </div>
        </div>
        {aside && <div className="shrink-0 sm:pl-4">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
