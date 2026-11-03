"use client";

import { useCallback, useSyncExternalStore } from "react";

export type SidebarState = "expanded" | "collapsed";

const STORAGE_KEY = "verilane-sidebar";
const CHANGE_EVENT = "verilane-sidebar-change";

// Used only when storage throws (private mode, blocked site data), so the
// toggle still works for this tab without persistence.
let memory: SidebarState | undefined;

function read(): SidebarState {
  if (memory) return memory;
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed" ? "collapsed" : "expanded";
  } catch {
    return "expanded";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * TASK-38: the one sidebar-collapse state for the shell. Persisted in
 * localStorage; expanded by default and on the server, so hydration matches
 * and a stored "collapsed" applies right after mount.
 */
export function useSidebarState(): [SidebarState, () => void] {
  const state = useSyncExternalStore(subscribe, read, () => "expanded" as const);
  const toggle = useCallback(() => {
    const next: SidebarState = read() === "collapsed" ? "expanded" : "collapsed";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      memory = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [state, toggle];
}
