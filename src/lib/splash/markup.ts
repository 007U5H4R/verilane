/**
 * TASK-45.2: the overlay's server-rendered inner HTML. A plain string so the
 * runtime (which edits the status, the bar and the button label before and
 * after hydration) never fights React over these nodes.
 *
 * TASK-45.4 (Design §7): a non-live progressbar, hidden until the runtime
 * reveals it at 3.2 s, and the overlay's single polite `role="status"`. The
 * status holds the message and the stall sub-line as two spans, so the
 * runtime can change one without rewriting the other.
 *
 * TASK-45.5 (Design §5, §6, §18): the lighthouse scene, ported from the frozen
 * mockup (`.design/exploration/task-45/index.html`). The sky, hills, clouds,
 * rig and brand are decorative (`aria-hidden`); their motion is CSS only
 * (splash.css), on transform and opacity (S15). Placeholder atmosphere: CSS
 * gradients and inline SVG, no raster but the official logo, which is split
 * into a V and a wordmark layer by clip-path, never redrawn.
 */
import { progress, SPLASH_COPY } from "./runtime";

/** Copy only the markup carries (Design §18). The tagline also ships in the
 * app's Sidebar, so it is not a splash marker (scripts/splash-budget.ts). */
export const SPLASH_SCENE_COPY = {
  tagline: "AR Collections Copilot",
  hintKey: "or press any key",
  hintTouch: "or tap anywhere",
} as const;

const LOGO = "/brand/verilane-logo-light.png";
// loading="lazy": the overlay is display:none on most loads, and a lazy image
// that is not rendered is not fetched.
const logoImg = (cls: string) =>
  '<img class="' + cls + '" src="' + LOGO + '" alt="" width="460" height="170" loading="lazy" decoding="async" draggable="false">';

const SCENE =
  '<div class="splash-scene" aria-hidden="true">' +
  '<div class="splash-sky"></div>' +
  '<div class="splash-cloud splash-cloud-bg"></div>' +
  '<svg class="splash-hills" viewBox="0 0 1440 300" preserveAspectRatio="none" focusable="false">' +
  '<path d="M0 120 C 220 60 420 70 640 110 S 1100 150 1440 70 L1440 300 L0 300Z" fill="#052a20"/>' +
  '<path d="M0 190 C 260 130 520 150 760 175 S 1180 120 1440 150 L1440 300 L0 300Z" fill="#073427"/>' +
  '<path d="M0 250 C 300 215 640 230 900 240 S 1260 215 1440 225 L1440 300 L0 300Z" fill="#0a4030"/>' +
  "</svg>" +
  '<div class="splash-rig">' +
  '<div class="splash-lantern">' +
  '<div class="splash-beam-tilt"><div class="splash-beam"><div class="splash-beam-wide"></div><div class="splash-beam-core"></div></div></div>' +
  '<div class="splash-glow"></div>' +
  "</div>" +
  '<svg class="splash-tower" viewBox="0 0 100 400" focusable="false">' +
  '<path d="M12 400 L22 300 L78 300 L88 400Z" fill="#0b3a2c"/>' +
  '<path d="M30 300 L36 84 L64 84 L70 300Z" fill="#efe9d9"/>' +
  '<path d="M52 84 L64 84 L70 300 L54 300Z" fill="#cfc7b2" opacity=".55"/>' +
  '<path d="M33 180 L67 180 L68 200 L32 200Z M35 120 L65 120 L66 136 L34 136Z M31 240 L69 240 L70 258 L30 258Z" fill="#176b50" opacity=".85"/>' +
  '<rect x="30" y="76" width="40" height="8" rx="1.5" fill="#0f4d39"/>' +
  '<rect x="38" y="48" width="24" height="28" fill="#ffecc4" opacity=".95"/>' +
  '<path d="M36 48 L50 30 L64 48Z" fill="#176b50"/>' +
  '<rect x="48" y="22" width="4" height="9" fill="#176b50"/>' +
  '<rect x="34" y="46" width="32" height="3" fill="#0f4d39"/>' +
  "</svg>" +
  "</div>" +
  '<div class="splash-cloud splash-cloud-fg"></div>' +
  "</div>";

// The sheen is a gradient band masked by the logo's own alpha, clipped to the
// V, and moved by transform (the mockup's background-position and CSS url()
// mask are not allowed here: S15 and the splash-budget raster rule).
const SHEEN =
  '<svg class="splash-sheen" viewBox="0 0 460 170" preserveAspectRatio="none" focusable="false">' +
  "<defs>" +
  '<mask id="splash-sheen-m" maskUnits="userSpaceOnUse" x="0" y="0" width="460" height="170" style="mask-type:alpha">' +
  '<image href="' + LOGO + '" width="460" height="170"/>' +
  "</mask>" +
  '<linearGradient id="splash-sheen-g" x1="0" y1="0" x2="1" y2=".2">' +
  '<stop offset=".3" stop-color="#ffecc4" stop-opacity="0"/>' +
  '<stop offset=".5" stop-color="#ffecc4" stop-opacity=".85"/>' +
  '<stop offset=".7" stop-color="#ffecc4" stop-opacity="0"/>' +
  "</linearGradient>" +
  "</defs>" +
  '<g mask="url(#splash-sheen-m)"><rect class="splash-sheen-band" x="-200" y="0" width="200" height="170" fill="url(#splash-sheen-g)"/></g>' +
  "</svg>";

export function splashMarkup(): string {
  const c = SPLASH_COPY;
  const s = SPLASH_SCENE_COPY;
  return (
    SCENE +
    '<div class="splash-brand" aria-hidden="true">' +
    '<div class="splash-logo">' +
    logoImg("splash-v") +
    SHEEN +
    logoImg("splash-word") +
    "</div>" +
    '<p class="splash-tagline">' +
    s.tagline +
    "</p>" +
    "</div>" +
    '<div class="splash-progress">' +
    '<div class="splash-bar" data-splash-bar="hidden">' +
    '<div class="splash-track" role="progressbar" aria-label="Loading Verilane" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    progress([]) +
    '" aria-valuetext="' +
    c.opening.slice(c.prefix.length) +
    '">' +
    '<div class="splash-fill"></div>' +
    '<div class="splash-glint" aria-hidden="true"></div>' +
    "</div>" +
    "</div>" +
    '<p class="splash-status" role="status" aria-live="polite" data-splash-status>' +
    '<span data-splash-msg>' +
    c.opening +
    "</span>" +
    '<span class="splash-sub" data-splash-sub></span>' +
    "</p>" +
    "</div>" +
    '<div class="splash-skip-wrap">' +
    '<button type="button" class="splash-skip" data-splash-skip>' +
    c.skip +
    "</button>" +
    '<p class="splash-hint">' +
    '<span class="splash-hint-key">' +
    s.hintKey +
    "</span>" +
    '<span class="splash-hint-touch">' +
    s.hintTouch +
    "</span>" +
    "</p>" +
    "</div>"
  );
}
