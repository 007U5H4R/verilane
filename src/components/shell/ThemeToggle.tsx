"use client";

import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "verilane-theme";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function toggle() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage fallback banner (TASK-7+) covers the user-visible case; the
    // toggle itself still works for the current tab without persistence.
  }
}

// No React state: which icon shows is resolved by CSS off [data-theme]
// (see globals.css .theme-icon-*), so there's nothing to reconcile between
// server and client render — the pre-hydration script already set the
// attribute before first paint.
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="grid size-11 shrink-0 place-items-center rounded-full border border-topbar-control-border bg-surface text-text shadow-[0_1px_2px_rgb(8_47_37/0.05)] transition-colors duration-150 hover:bg-mint-pale"
      aria-label="Toggle dark theme"
      onClick={toggle}
    >
      <Sun className="theme-icon-light size-5" strokeWidth={1.75} aria-hidden />
      <Moon className="theme-icon-dark size-5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
