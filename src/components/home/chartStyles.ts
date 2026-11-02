import type { CSSProperties } from "react";

/** Theme-token tooltip styles: Recharts' default tooltip hard-codes a white
 * background, unreadable in dark mode (T18-8). Frosted glass per TASK-37. */
export const TOOLTIP_STYLES: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: "var(--glass)",
    backdropFilter: "blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--text)" },
  itemStyle: { color: "var(--text)" },
};
