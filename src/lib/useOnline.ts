"use client";

import { useSyncExternalStore } from "react";

/**
 * TASK-24: real `navigator.onLine` detection (+ online/offline events), for
 * the offline banner (`BannerHost`) and for disabling import/reset/live-call
 * triggers while offline. SSR-safe (assumes online server-side, matching the
 * established `useSyncExternalStore` pattern in `ThemeControl.tsx`).
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
