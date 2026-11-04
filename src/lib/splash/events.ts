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
