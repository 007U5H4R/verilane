// TASK-46 (Design.md R3): which strength of heritage art a route gets.
// Pure: no React, no DOM. Levels are Solution-PRD-TASK-46 §4; the detail
// routes and /settings/eval were confirmed `reduced` by the TASK-46.2
// exposure measurement (EXE58).

export type HeritageLevel = "normal" | "reduced" | "off";

/** SC9 switch-off: flip to false and every route returns "off". The one line. */
export const HERITAGE_ENABLED = true;

/** PRD §4. Keys are exact paths; `[id]` stands for one dynamic segment. */
export const HERITAGE_LEVELS: Readonly<Record<string, HeritageLevel>> = {
  "/": "normal",
  "/queue": "normal",
  "/disputes": "normal",
  "/invoices": "normal",
  "/payments": "normal",
  "/emails": "reduced",
  "/settings": "reduced",
  "/drafts": "reduced",
  "/audit": "reduced",
  "/invoices/[id]": "reduced",
  "/disputes/[id]": "reduced",
  "/settings/eval": "reduced",
  "/e2e-harness": "off",
};

/** A new route never gets full-strength art by accident (TC-100). */
const DEFAULT_LEVEL: HeritageLevel = "reduced";

/** The path alone: no query or hash, no trailing slash (except Home's). */
function normalise(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0]!;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Home is the one route that keeps the strip below 768px (`data-home`). */
export function isHeritageHome(pathname: string): boolean {
  return normalise(pathname) === "/";
}

export function heritageLevelFor(pathname: string, enabled: boolean = HERITAGE_ENABLED): HeritageLevel {
  if (!enabled) return "off";
  const path = normalise(pathname);
  const exact = HERITAGE_LEVELS[path];
  if (exact) return exact;
  const segments = path.split("/");
  if (segments.length === 3 && segments[2]) {
    const dynamic = HERITAGE_LEVELS[`/${segments[1]}/[id]`];
    if (dynamic) return dynamic;
  }
  return DEFAULT_LEVEL;
}

/** Just the globals scheduleIdleOnce touches, so tests can pass a fake (TP10). */
export interface IdleHost {
  requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  /** Read as SaveDataHint. Typed `object` because TS's DOM `Navigator` has no
   *  `connection` (Network Information API), so `window` would not fit (EXE60). */
  navigator?: object;
}

/** The one Network Information API field read here. */
type SaveDataHint = { connection?: { saveData?: boolean } };

/** rIC's deadline; the browser runs cb by then even if it never goes idle. */
const IDLE_TIMEOUT_MS = 4000;
/** Without rIC (Safari), a fixed delay well after first paint. */
const FALLBACK_DELAY_MS = 2500;

/**
 * Runs cb once at idle (rIC with a 4 s timeout, else setTimeout 2500). Under
 * Save-Data it schedules nothing. Returns a cancel that is safe to call at any
 * time, any number of times (TC-106a–TC-108).
 */
export function scheduleIdleOnce(host: IdleHost, cb: () => void): () => void {
  if ((host.navigator as SaveDataHint | undefined)?.connection?.saveData) return () => {};
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  const ric = host.requestIdleCallback;
  const cancelIdle = host.cancelIdleCallback;
  if (ric && cancelIdle) {
    const id = ric.call(host, run, { timeout: IDLE_TIMEOUT_MS });
    return () => {
      if (done) return;
      done = true;
      cancelIdle.call(host, id);
    };
  }
  const id = host.setTimeout.call(host, run, FALLBACK_DELAY_MS);
  return () => {
    if (done) return;
    done = true;
    host.clearTimeout.call(host, id);
  };
}
