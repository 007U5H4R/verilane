/**
 * TASK-44: the confirmed start. Puts the demo in a known state (fresh seed,
 * Analyst, autopilot off at the default cap) and sets the tour running at
 * step 1. The caller navigates to /queue.
 */
import { AUTOPILOT_KEY, DEFAULT_AUTOPILOT, parsePolicy } from "@/domain/autopilot";
import { resetDemo } from "@/store/dataCommands";
import type { VerilaneDb } from "@/store/db";
import type { Fetcher } from "@/store/loader";
import { currentRole, execute } from "@/store/tx";
import { setTour } from "./tourStore";

export async function confirmStartTour(db: VerilaneDb, fetcher?: Fetcher): Promise<void> {
  await resetDemo(db, fetcher);
  // The reset wipes meta (so the policy is already the default), but write it
  // explicitly if not, so step 6 never depends on that reset detail. A direct
  // write, not set_autopilot: it is part of the reset, and set_autopilot is
  // Manager-only.
  const policy = parsePolicy((await db.meta.get(AUTOPILOT_KEY))?.value);
  if (policy.enabled !== DEFAULT_AUTOPILOT.enabled || policy.max_amount_paise !== DEFAULT_AUTOPILOT.max_amount_paise) {
    await db.meta.put({ key: AUTOPILOT_KEY, value: { ...DEFAULT_AUTOPILOT } });
  }
  // The reset keeps the role (a viewer preference); the tour starts as Analyst.
  if ((await currentRole(db)) !== "analyst") {
    await execute(db, { type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "analyst" } });
  }
  setTour({ phase: "running", step: 0, substage: 0 });
}
