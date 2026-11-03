"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";

const STORAGE_KEY = "verilane-theme";
// Picking "Match system" may leave data-theme unchanged, so announce it.
const CHANGE_EVENT = "verilane-theme-change";
type Choice = "light" | "dark" | "system";
const CHOICES: { value: Choice; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
];

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // No storage: the theme still follows the system for this tab.
  }
  return "system";
}

// Re-read when the attribute changes (e.g. the top-bar toggle) or another tab
// writes the key, so this control never shows a stale choice.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Theme preference (TKT-14). Same storage key and `data-theme` attribute as
 * the top-bar toggle and the pre-hydration script in `layout.tsx`.
 */
export function ThemeControl() {
  // null on the server: the stored choice is only readable on the client.
  const choice = useSyncExternalStore<Choice | null>(subscribe, readChoice, () => null);

  function pick(next: Choice) {
    document.documentElement.setAttribute("data-theme", next === "system" ? systemTheme() : next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Applies for this tab only when storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => {
          const on = choice === c.value;
          const Icon = c.icon;
          return (
            <label
              key={c.value}
              className={cn(
                "relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-center text-[13px] text-text transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                on ? "border-brand bg-brand-tint font-medium" : "border-border bg-surface hover:bg-surface-sunken",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={c.value}
                checked={on}
                onChange={() => pick(c.value)}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[inherit] opacity-0"
              />
              <Icon aria-hidden className={cn("size-4", on ? "text-brand" : "text-text-muted")} />
              {c.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
