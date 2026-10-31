"use client";

import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/cn";
import { usePersistentStorage } from "@/store/hooks";

export type BannerKind = "storage" | "offline";

// Design.md §16 copy; visual pattern from the mockup's `.banner` (storage =
// info/brand-tint, offline = warn/med-bg). One shared Banner (A15).
const BANNERS: Record<BannerKind, { text: string; tone: string }> = {
  storage: {
    text: "Changes won't survive reload — storage unavailable",
    tone: "bg-brand-tint",
  },
  offline: {
    text: "You're offline — viewing cached data; some actions are paused",
    tone: "bg-med-bg",
  },
};

/** A persistent, non-dismissible shell banner (SR9 storage / PWA offline). */
export function Banner({ kind }: { kind: BannerKind }) {
  const { text, tone } = BANNERS[kind];
  return (
    <div
      role="status"
      data-banner={kind}
      className={cn(
        "flex items-start gap-2.5 border-b border-border px-4 py-2.5 text-[13px] md:px-7 text-text",
        tone,
      )}
    >
      <TriangleAlert className="size-[18px] flex-none" strokeWidth={1.5} aria-hidden />
      <span>{text}</span>
    </div>
  );
}

/**
 * Renders at most one banner; offline wins, since storage fallback is moot
 * without a network (Design.md §16). `offline` is supplied by the caller —
 * real offline detection is TASK-24.
 */
export function BannerHost({ offline = false }: { offline?: boolean }) {
  const persistent = usePersistentStorage();
  if (offline) return <Banner kind="offline" />;
  if (!persistent) return <Banner kind="storage" />;
  return null;
}
