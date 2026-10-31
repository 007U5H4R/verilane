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
      className="icon-btn grid size-9 place-items-center rounded-full border border-border bg-surface"
      aria-label="Toggle dark theme"
      onClick={toggle}
    >
      <Sun className="theme-icon-light size-4" />
      <Moon className="theme-icon-dark size-4" />
    </button>
  );
}
