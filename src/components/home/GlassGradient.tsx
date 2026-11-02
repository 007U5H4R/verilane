/**
 * TASK-37: shiny 3D glass bar fill. A vertical gradient with a hard gloss line
 * at mid-height (bright upper half, clear body, shaded base) reads as a
 * polished translucent glass rod. Render it inside a
 * Recharts chart and fill a bar with `url(#id)`.
 */
export function GlassGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="white" stopOpacity={0.95} />
      <stop offset="8%" stopColor={`color-mix(in srgb, ${color} 25%, white)`} stopOpacity={0.9} />
      <stop offset="44%" stopColor={`color-mix(in srgb, ${color} 55%, white)`} stopOpacity={0.75} />
      <stop offset="46%" stopColor={color} stopOpacity={0.6} />
      <stop offset="80%" stopColor={color} stopOpacity={0.75} />
      <stop offset="100%" stopColor={`color-mix(in srgb, ${color} 65%, black)`} stopOpacity={0.9} />
    </linearGradient>
  );
}

/** Lifts bar rectangles off the glass card with a soft shadow. */
export const GLASS_BARS_CLASS = "[&_.recharts-bar-rectangle]:drop-shadow-[0_4px_6px_rgb(0_0_0_/_0.18)]";
