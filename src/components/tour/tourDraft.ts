import type { Draft } from "@/domain/schema";
import type { TourSnapshot } from "./steps";

/**
 * A draft as the tour sees it. Only autopilot_send writes `sent_by`
 * ("copilot"); a human approve-and-send leaves it unset, so a sent draft
 * without it was sent by a person.
 */
export function toTourDraft(d: Draft | null): TourSnapshot["draftA"] {
  if (!d) return null;
  if (d.status !== "sent_simulated") return { status: d.status };
  const sentBy = (d as { sent_by?: string }).sent_by === "copilot" ? "copilot" : "human";
  return { status: d.status, sent_by: sentBy };
}
