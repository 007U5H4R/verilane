"use client";

import { useEffect } from "react";

/** The part of `ServiceWorkerContainer` the dev cleanup needs. */
type RegistrationList = {
  getRegistrations(): Promise<ReadonlyArray<{ unregister(): Promise<boolean> }>>;
};

/**
 * TASK-35 (T24-7): unregisters every service worker on this origin, so a
 * production SW left behind (same host and port as `next dev`) stops serving
 * cached production pages and chunks. Resolves to how many were removed;
 * rejects with the first failure after trying them all.
 */
export async function unregisterServiceWorkers(container: RegistrationList): Promise<number> {
  const registrations = await container.getRegistrations();
  const results = await Promise.allSettled(registrations.map((reg) => reg.unregister()));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  return registrations.length;
}

const DEV_RELOAD_KEY = "verilane:sw-dev-reload";

/**
 * TASK-35 (T35-6): unregistering doesn't release a page the old SW already
 * controls; it keeps serving cached production chunks until a navigation.
 * Reloads once to drop it. A sessionStorage guard stops a loop: no second
 * reload in this tab while it is still controlled, and none at all when the
 * guard can't be stored. Returns whether it reloaded.
 */
export function reloadIfStillControlled({
  controlled,
  storage,
  reload,
}: {
  controlled: boolean;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  reload: () => void;
}): boolean {
  try {
    if (!controlled) {
      storage?.removeItem(DEV_RELOAD_KEY);
      return false;
    }
    if (!storage || storage.getItem(DEV_RELOAD_KEY)) return false;
    storage.setItem(DEV_RELOAD_KEY, "1");
  } catch {
    return false;
  }
  reload();
  return true;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * TASK-24.3: registers `public/sw.js`. Production-only — `e2e` runs via
 * `next build && next start` (NODE_ENV=production), so the e2e suite still
 * exercises the real service worker. In dev it removes any production SW
 * instead (T24-7).
 *
 * Once the SW is ready, it is handed the static assets this page already
 * loaded (before the SW could intercept them) so a first visit works offline.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      unregisterServiceWorkers(navigator.serviceWorker)
        .then((count) => {
          const controlled = navigator.serviceWorker.controller !== null;
          if (count > 0) console.warn(`[sw] unregistered ${count} production service worker(s) in dev`);
          const reloaded = reloadIfStillControlled({
            controlled,
            storage: sessionStorageOrNull(),
            reload: () => window.location.reload(),
          });
          if (controlled && !reloaded) {
            console.warn("[sw] this page is still controlled by a stale service worker; reload to drop it");
          }
        })
        .catch((err) => console.error("[sw] could not unregister the production service worker", err));
      return;
    }
    // The SW forwards its failures here (T24-6), so they show in the page console.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; message?: unknown } | null;
      if (data?.type === "sw-error") console.error(`[sw] ${String(data.message)}`);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.startMessages();
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("/_next/static/"));
        registration.active?.postMessage({ type: "cache-urls", urls, page: window.location.pathname });
      })
      .catch((err) => {
        console.error("Service worker registration failed", err);
      });
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
