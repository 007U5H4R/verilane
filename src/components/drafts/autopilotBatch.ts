/**
 * One autopilot batch: sends each due draft in turn and says what happened.
 * Kept free of React so the runner's failure and cancellation rules are
 * unit-tested (CR-007).
 *
 * - A policy refusal (`PermissionDenied` / `InvalidCommand`: autopilot was
 *   switched off, the draft changed) is the expected "a person takes it"
 *   case — logged, not toasted.
 * - Anything else (an IndexedDB abort, a chunk that failed to load) is a
 *   real failure the user must see, or they would believe Copilot sent it.
 * - Once `isCancelled()` turns true (the runner unmounted) nothing more is
 *   sent or announced.
 */
export type AutopilotOutcome = "sent" | "held";

export type AutopilotNotice = { kind: AutopilotOutcome | "failed"; who: string };

export interface AutopilotBatchDeps {
  send: (draftId: string) => Promise<AutopilotOutcome>;
  notify: (notice: AutopilotNotice) => void;
  isCancelled: () => boolean;
}

const EXPECTED_REFUSALS = new Set(["PermissionDenied", "InvalidCommand"]);

export async function runAutopilotBatch(
  items: readonly { id: string; who: string }[],
  { send, notify, isCancelled }: AutopilotBatchDeps,
): Promise<void> {
  for (const { id, who } of items) {
    if (isCancelled()) return;
    try {
      const outcome = await send(id);
      if (isCancelled()) return;
      notify({ kind: outcome, who });
    } catch (err) {
      if (err instanceof Error && EXPECTED_REFUSALS.has(err.name)) {
        console.warn("[verilane] autopilot skipped", id, err);
        continue;
      }
      console.error("[verilane] autopilot send failed", id, err);
      if (isCancelled()) return;
      notify({ kind: "failed", who });
    }
  }
}
