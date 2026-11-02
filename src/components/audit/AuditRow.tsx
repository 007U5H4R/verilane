import { formatDateTime } from "@/domain/clock";
import { labelFor } from "@/domain/audit/classify";

/** An action's display label — one source of truth in `domain/audit/classify`. */
export function actionLabel(action: string): string {
  return labelFor(action);
}

/** An audit timestamp in the app's one date format (clock.ts); `—` if absent. */
export function formatAt(at: unknown): string {
  return typeof at === "string" ? formatDateTime(at) : "—";
}
