/**
 * TASK-45.2: the app tells the splash which loading phase it has reached.
 * One tiny dependency-free emitter (TP-45.e) so the hooks add nothing to the
 * shared client JS. It never throws, and it marks `splash:ready` whether or
 * not a splash is showing, so the perf A/B compares like with like.
 */
export type SplashPhase = "session" | "provider" | "seeding" | "ready" | "error";

export function emitSplash(phase: SplashPhase): void {
  try {
    if (phase === "ready") performance.mark("splash:ready");
    window.dispatchEvent(new CustomEvent("verilane:splash", { detail: { phase } }));
  } catch {
    /* the splash is decoration; a missing window or event API must not break loading */
  }
}

/**
 * TASK-45.3: client entry. A guest who arrives without a hard load (onboarding
 * Finish → "/") asks the head runtime to re-decide; it shows at most once per
 * tab and is a no-op while a splash is live. Never throws, so the gate's
 * render cannot depend on it (R7).
 */
export function showSplash(): void {
  try {
    window.verilaneSplash?.show();
  } catch {
    /* no runtime, or a broken one: the app renders exactly as without it */
  }
}

/**
 * TASK-45.3 (review R-3): GatedApp unmounted, so the runtime forgets that
 * mount's phases. Never throws, and an older runtime without reset() is fine.
 */
export function resetSplash(): void {
  try {
    window.verilaneSplash?.reset?.();
  } catch {
    /* no runtime, or a broken one: nothing to forget */
  }
}
