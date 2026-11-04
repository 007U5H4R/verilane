/**
 * TASK-45.2: the overlay's server-rendered inner HTML. A plain string so the
 * runtime (which edits the status, the bar and the button label before and
 * after hydration) never fights React over these nodes. The scene is
 * TASK-45.5.
 *
 * TASK-45.4 (Design §7): a non-live progressbar, hidden until the runtime
 * reveals it at 3.2 s, and the overlay's single polite `role="status"`. The
 * status holds the message and the stall sub-line as two spans, so the
 * runtime can change one without rewriting the other.
 */
import { progress, SPLASH_COPY } from "./runtime";

export function splashMarkup(): string {
  const c = SPLASH_COPY;
  return (
    '<div class="splash-inner">' +
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
    '<p class="splash-hint">or press any key</p>' +
    "</div>" +
    "</div>"
  );
}
