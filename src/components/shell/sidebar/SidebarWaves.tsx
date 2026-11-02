/**
 * TASK-38 V2: the layered emerald/mint waves at the foot of the sidebar.
 * Pure inline SVG — decorative, static (no motion), never interactive, and
 * painted beneath the Demo Data card. It shrinks and fades with the sidebar's
 * height tiers so it stays a quiet accent on shorter screens.
 */
export function SidebarWaves() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 272 130"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-45 [@media(min-height:1160px)]:h-36 [@media(min-height:1160px)]:opacity-100 [@media(min-height:880px)_and_(max-height:1159px)]:h-24 [@media(min-height:880px)_and_(max-height:1159px)]:opacity-70"
    >
      <defs>
        <linearGradient id="rail-wave-back" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#21845f" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8ed7b0" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="rail-wave-mid" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#176b50" stopOpacity="0.75" />
          <stop offset="0.55" stopColor="#21845f" stopOpacity="0.6" />
          <stop offset="1" stopColor="#8ed7b0" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="rail-wave-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#083a2b" stopOpacity="0.95" />
          <stop offset="1" stopColor="#062f24" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d="M0 70 C 50 34, 110 36, 160 62 S 240 92, 272 30 L 272 130 L 0 130 Z" fill="url(#rail-wave-back)" />
      <path d="M0 86 C 60 50, 120 66, 170 92 S 245 104, 272 62 L 272 130 L 0 130 Z" fill="url(#rail-wave-mid)" />
      <path
        d="M0 86 C 60 50, 120 66, 170 92 S 245 104, 272 62"
        fill="none"
        stroke="#8ed7b0"
        strokeOpacity="0.5"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M0 112 C 70 96, 130 104, 185 114 S 245 120, 272 104 L 272 130 L 0 130 Z" fill="url(#rail-wave-front)" />
    </svg>
  );
}
