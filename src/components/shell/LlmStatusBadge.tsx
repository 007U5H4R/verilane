"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * TASK-23 (TKT-18): shows "Live LLM" only when `/api/llm/status` reports the
 * live path is actually active (key present + flag set). Defaults to, and
 * falls back to, "Simulated LLM" on any fetch failure — never shows Live
 * active by default.
 */
export function LlmStatusBadge() {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/llm/status")
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setLive(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = live ? "Live LLM" : "Simulated LLM";
  // TASK-38: a status, not a control. Below 1440 only the icon shows; the
  // label stays in the accessibility tree and in the tooltip.
  return (
    <span
      title={label}
      className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-topbar-control-border bg-surface px-3 text-[14px] font-medium text-text shadow-[0_1px_2px_rgb(8_47_37/0.05)] min-[1440px]:px-4"
    >
      <Sparkles className="size-[18px] text-brand" strokeWidth={1.75} aria-hidden />
      <span className="sr-only min-[1440px]:not-sr-only">{label}</span>
    </span>
  );
}
