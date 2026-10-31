import type { CSSProperties } from "react";

/** Theme-token tooltip styles: Recharts' default tooltip hard-codes a white
 * background, unreadable in dark mode (T18-8). */
export const TOOLTIP_STYLES: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--text)" },
  itemStyle: { color: "var(--text)" },
};
