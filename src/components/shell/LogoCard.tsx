import Image from "next/image";

/**
 * The Verilane logo on the dark-emerald rail.
 *
 * TASK-38 V2: `verilane-logo-light.png` is the official artwork with only the
 * wordmark recoloured to #F3F8F4 (alpha kept; the V's pixels are untouched)
 * on a transparent background — no plate. A low-opacity mint halo and a small
 * drop-shadow lift the V's darkest stroke off the forest-green rail without
 * altering the artwork. Light surfaces keep using `verilane-logo.png`.
 *
 * - `full`: the desktop sidebar's brand block (fluid width, set by the parent).
 * - `compact`: the mobile top strip (Design.md §13, 104px max).
 * - `mark`: the icon rail — the V alone, clipped from the same asset.
 */
const LIGHT_LOGO = "/brand/verilane-logo-light.png";
// The asset is 460×170; the V fills its left ~25.3%, the wordmark starts at ~26%.
const GLOW = "[filter:drop-shadow(0_0_5px_rgb(142_215_176/0.22))]";

export function LogoCard({
  compact = false,
  variant = compact ? "compact" : "full",
}: {
  compact?: boolean;
  variant?: "full" | "compact" | "mark";
}) {
  if (variant === "mark") {
    return (
      <div className="relative grid size-11 flex-none place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(142_215_176/0.2),transparent_68%)]"
        />
        <span className="relative block h-[38px] w-[29px] overflow-hidden">
          <Image
            src={LIGHT_LOGO}
            alt="Verilane"
            width={460}
            height={170}
            className={`h-[38px] w-auto max-w-none ${GLOW} [clip-path:inset(0_74.5%_0_0)]`}
            priority
          />
        </span>
      </div>
    );
  }
  if (variant === "compact") {
    return (
      <Image
        src={LIGHT_LOGO}
        alt="Verilane"
        width={460}
        height={170}
        className={`h-auto w-[104px] ${GLOW}`}
        priority
      />
    );
  }
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[-6%] top-1/2 aspect-square w-[38%] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(142_215_176/0.2),rgb(33_132_95/0.08)_45%,transparent_70%)]"
      />
      <Image
        src={LIGHT_LOGO}
        alt="Verilane"
        width={460}
        height={170}
        className={`relative h-auto w-full ${GLOW}`}
        priority
      />
    </div>
  );
}
