/**
 * TASK-44: the tour's pure navigation rules (Next, Back, and advancing a
 * look-only step when the viewer follows its prompt to the next page).
 * Kept out of the components so they can be unit-tested in node.
 */
import { TOUR_STEPS, type TourSnapshot, type TourStep } from "./steps";
import type { TourState } from "./tourStore";

/** The index of the stage the viewer is shown; mirrors `currentStage`. */
export function resolvedStageIndex(step: TourStep, s: TourSnapshot, substage: number): number {
  const from = Math.min(Math.max(0, substage), step.stages.length - 1);
  const idx = step.stages.findIndex((st, i) => i >= from && !st.done(s));
  return idx === -1 ? step.stages.length - 1 : idx;
}

/** Next: the step's next stage, else the next step, else finished. On action steps it skips the action. */
export function nextState(t: TourState, s: TourSnapshot): TourState {
  const step = TOUR_STEPS[t.step];
  if (!step) return { phase: "finished", step: t.step, substage: 0 };
  const shown = resolvedStageIndex(step, s, t.substage);
  if (shown < step.stages.length - 1) return { phase: "running", step: t.step, substage: shown + 1 };
  if (t.step >= TOUR_STEPS.length - 1) return { phase: "finished", step: t.step, substage: 0 };
  return { phase: "running", step: t.step + 1, substage: 0 };
}

/** Back: the previous step's explanation. It never undoes data. */
export function backState(t: TourState): TourState {
  return { phase: "running", step: Math.max(0, t.step - 1), substage: 0 };
}

/**
 * A look-only step whose prompt sends the viewer to the next step's page
 * (step 2's "Open the top invoice") advances when they arrive there.
 * Returns null when nothing should change.
 */
export function routeAdvance(t: TourState, pathname: string): TourState | null {
  const step = TOUR_STEPS[t.step];
  const next = TOUR_STEPS[t.step + 1];
  if (!step || !next || step.completes !== "next") return null;
  if (step.stages.some((st) => st.route === pathname)) return null;
  return next.stages[0]?.route === pathname ? { phase: "running", step: t.step + 1, substage: 0 } : null;
}
