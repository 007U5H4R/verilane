/**
 * TASK-45.2: the overlay's server-rendered inner HTML. A plain string so the
 * runtime (which edits the status and the button label before and after
 * hydration) never fights React over these nodes. The bar is TASK-45.4 and
 * the scene TASK-45.5; this is the tracer's minimum: status, skip, hint.
 */
import { SPLASH_COPY } from "./runtime";

export function splashMarkup(): string {
  return (
    '<div class="splash-inner">' +
    '<p class="splash-status" role="status" aria-live="polite" data-splash-status>' +
    SPLASH_COPY.opening +
    "</p>" +
    '<div class="splash-skip-wrap">' +
    '<button type="button" class="splash-skip" data-splash-skip>' +
    SPLASH_COPY.skip +
    "</button>" +
    '<p class="splash-hint">or press any key</p>' +
    "</div>" +
    "</div>"
  );
}
