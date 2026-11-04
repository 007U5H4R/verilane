/**
 * TASK-39: the visitor's session. Verilane has no auth backend, so the only
 * session that exists is the guest flag — a dedicated client marker, never a
 * fake user. Stored in localStorage `verilane-session` = "guest"; every
 * storage access is wrapped, because private windows and blocked site data
 * make the accessor throw.
 *
 * `useSession()` reads through useSyncExternalStore with a server snapshot of
 * `undefined`, so the flag is only read after hydration and the server/client
 * first renders always agree.
 */
"use client";

import { useSyncExternalStore } from "react";

import { AUTH_ROUTES } from "./auth-routes";

export const SESSION_KEY = "verilane-session";
const CHANGE_EVENT = "verilane-session-change";
/** E2E-only: set by `?__session=none` so a spec can opt out of the default guest session. */
const E2E_OPT_OUT_KEY = "verilane-e2e-no-session";

export type Session = "guest" | null;

export { AUTH_ROUTES };

export function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Pure: what the stored value means. Anything but "guest" is no session. */
export function parseSession(raw: string | null): Session {
  return raw === "guest" ? "guest" : null;
}

/**
 * Pure: the effective session. In the e2e build the visitor is a guest by
 * default so the pre-onboarding specs keep landing on the app; a spec that
 * opted out sees only what is stored.
 */
export function resolveSession(stored: Session, e2e: boolean, e2eOptedOut: boolean): Session {
  if (stored) return stored;
  return e2e && !e2eOptedOut ? "guest" : null;
}

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGet(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function e2eOptedOut(): boolean {
  if (process.env.NEXT_PUBLIC_E2E !== "1") return false;
  let tab: KeyValueStore | null = null;
  try {
    tab = window.sessionStorage;
  } catch {
    return false;
  }
  try {
    if (new URLSearchParams(window.location.search).get("__session") === "none") {
      tab.setItem(E2E_OPT_OUT_KEY, "1");
    }
  } catch {
    // An unreadable opt-out leaves the default guest session in place.
  }
  return safeGet(tab, E2E_OPT_OUT_KEY) === "1";
}

export function readSession(): Session {
  const stored = parseSession(safeGet(local(), SESSION_KEY));
  return resolveSession(stored, process.env.NEXT_PUBLIC_E2E === "1", e2eOptedOut());
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Starts guest mode. Returns false when storage is unavailable (the session then lasts this page only). */
export function startGuestSession(): boolean {
  let ok = false;
  try {
    local()?.setItem(SESSION_KEY, "guest");
    ok = local() !== null;
  } catch {
    ok = false;
  }
  memoryGuest = !ok;
  notify();
  return ok;
}

/** Ends guest mode. Demo data in IndexedDB is left alone — resetting it is Settings' confirmed flow. */
export function endGuestSession(): void {
  try {
    local()?.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
  if (process.env.NEXT_PUBLIC_E2E === "1") {
    // The e2e build is a guest by default; exiting must opt this tab out.
    try {
      window.sessionStorage.setItem(E2E_OPT_OUT_KEY, "1");
    } catch {
      // No tab storage: the e2e default guest session stays.
    }
  }
  memoryGuest = false;
  notify();
}

// Fallback when localStorage throws: guest mode still works until reload.
let memoryGuest = false;

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SESSION_KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Session {
  return memoryGuest ? "guest" : readSession();
}

function getStoredSnapshot(): boolean {
  return memoryGuest || parseSession(safeGet(local(), SESSION_KEY)) === "guest";
}

/**
 * True only when the visitor chose guest mode (flag stored), not for the e2e
 * build's implicit default — so the guest badge never appears in specs that
 * didn't opt into it. `false` until mounted.
 */
export function useIsStoredGuest(): boolean {
  return useSyncExternalStore(subscribe, getStoredSnapshot, () => false);
}

/** `undefined` until mounted (server render and hydration), then the session. */
export function useSession(): Session | undefined {
  return useSyncExternalStore<Session | undefined>(subscribe, getSnapshot, () => undefined);
}
