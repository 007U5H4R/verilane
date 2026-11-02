/** Decorative header art: a checklist document behind an emerald shield. Tokens only. */
export function AuditIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="84" cy="108" rx="58" ry="7" className="fill-mint-pale" />
      <rect x="34" y="14" width="74" height="90" rx="8" className="fill-surface stroke-border-strong" strokeWidth="1.5" />
      <rect x="46" y="8" width="50" height="12" rx="6" className="fill-brand-tint stroke-brand" strokeWidth="1.5" />
      {[34, 52, 70].map((y) => (
        <g key={y}>
          <rect x="46" y={y} width="10" height="10" rx="2.5" className="fill-brand-tint stroke-brand" strokeWidth="1.25" />
          <path d={`M48.5 ${y + 5.2} l2 2 l3.6 -4`} fill="none" className="stroke-brand-strong" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="62" y={y + 2} width="34" height="3" rx="1.5" className="fill-border-strong" />
          <rect x="62" y={y + 7} width="22" height="2.5" rx="1.25" className="fill-border" />
        </g>
      ))}
      <path
        d="M118 44 l20 7 v15 c0 13 -8.5 22 -20 27 c-11.5 -5 -20 -14 -20 -27 v-15 z"
        className="fill-brand stroke-brand-strong"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M110 68 l5.5 5.5 l11 -12" fill="none" className="stroke-on-brand" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
