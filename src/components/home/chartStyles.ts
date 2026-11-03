import type { CSSProperties } from "react";

/** Theme-token tooltip styles: Recharts' default tooltip hard-codes a white
 * background, unreadable in dark mode (T18-8). A solid card surface with the
 * soft card shadow (TASK-38, Emerald FinTech). */
export const TOOLTIP_STYLES: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    boxShadow: "var(--card-shadow)",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  labelStyle: { color: "var(--text)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
};

/** The card every Home block sits in: solid surface, soft card shadow. */
export const CARD_CLASS = "rounded-2xl border border-border bg-surface shadow-card";
