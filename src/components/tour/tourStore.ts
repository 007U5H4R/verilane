/**
 * TASK-44: where the demo tour is. Tiny on purpose (no Dexie, no step data)
 * because the always-visible Demo button imports it. Persisted per tab in
 * sessionStorage `verilane-tour`, so the step survives navigation and a
 * refresh; every storage access is wrapped and falls back to memory.
 */
"use client";

import { useSyncExternalStore } from "react";

export type TourPhase = "idle" | "confirm" | "running" | "finished";
export type TourState = { phase: TourPhase; step: number; substage: number };
type Storage2 = Pick<Storage, "getItem" | "setItem">;

export const TOUR_KEY = "verilane-tour";
const IDLE: TourState = { phase: "idle", step: 0, substage: 0 };
const PHASES: readonly TourPhase[] = ["idle", "confirm", "running", "finished"];

function parse(raw: string | null): TourState {
  if (!raw) return IDLE;
  try {
    const v = JSON.parse(raw) as Partial<TourState>;
    const ok =
      PHASES.includes(v.phase as TourPhase) &&
      Number.isInteger(v.step) && (v.step as number) >= 0 &&
      Number.isInteger(v.substage) && (v.substage as number) >= 0;
    return ok ? { phase: v.phase as TourPhase, step: v.step as number, substage: v.substage as number } : IDLE;
  } catch {
    return IDLE;
  }
}

export function createTourStore(storage: Storage2 | null) {
  let state: TourState | null = null;
  const listeners = new Set<() => void>();

  function getTour(): TourState {
    if (state === null) {
      let raw: string | null = null;
      try {
        raw = storage?.getItem(TOUR_KEY) ?? null;
      } catch {
        raw = null;
      }
      state = parse(raw);
    }
    return state;
  }

  function setTour(next: TourState): void {
    state = next;
    try {
      storage?.setItem(TOUR_KEY, JSON.stringify(next));
    } catch {
      // Memory still holds it for this page's life.
    }
    for (const cb of listeners) cb();
  }

  function subscribeTour(cb: () => void): () => void {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  }

  return {
    getTour,
    setTour,
    subscribeTour,
    requestTour: () => setTour({ phase: "confirm", step: 0, substage: 0 }),
    exitTour: () => setTour(IDLE),
  };
}

function session(): Storage2 | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const store = createTourStore(session());
export const { getTour, setTour, subscribeTour, requestTour, exitTour } = store;

/** The tour state, live. Idle on the server and the first client render. */
export function useTour(): TourState {
  return useSyncExternalStore(subscribeTour, getTour, () => IDLE);
}
