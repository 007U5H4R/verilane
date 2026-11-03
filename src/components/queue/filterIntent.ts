/**
 * Latest requested Queue filters (TASK-9 fix round 1). `router.push` updates
 * the URL asynchronously, so building the next state from the render-time
 * URL drops a click that lands before the previous push re-renders. Updates
 * build on `latest`; the URL replaces `latest` only once no push of ours is
 * still in flight, or when it changes for another reason (Back, a link).
 */
import { serialize, type QueueFilters } from "./queueParams";

export interface FilterIntent {
  latest: QueueFilters;
  /** Query strings pushed but not yet seen in the URL, oldest first. */
  pending: string[];
}

export function initIntent(url: QueueFilters): FilterIntent {
  return { latest: url, pending: [] };
}

export function applyUpdate(
  s: FilterIntent,
  update: (prev: QueueFilters) => QueueFilters,
): { state: FilterIntent; qs: string } {
  const latest = update(s.latest);
  const qs = serialize(latest);
  return { state: { latest, pending: [...s.pending, qs] }, qs };
}

export function onUrl(s: FilterIntent, url: QueueFilters): FilterIntent {
  const at = s.pending.indexOf(serialize(url));
  if (at === -1) return initIntent(url); // not ours: follow the URL
  const pending = s.pending.slice(at + 1);
  return { latest: pending.length > 0 ? s.latest : url, pending };
}
