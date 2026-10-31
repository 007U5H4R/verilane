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

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text-muted">
      <Sparkles className="size-3.5" />
      {live ? "Live LLM" : "Simulated LLM"}
    </span>
  );
}
