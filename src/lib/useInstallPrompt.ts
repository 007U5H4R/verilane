"use client";

import { useSyncExternalStore } from "react";

import { createInstallPromptStore, type InstallPromptSnapshot, type InstallPromptStore } from "./installPromptStore";

// One store per document, listening from module evaluation (before hydration),
// so an early `beforeinstallprompt` isn't missed (T24-2).
const store: InstallPromptStore | null = typeof window === "undefined" ? null : createInstallPromptStore(window);

const SERVER_SNAPSHOT: InstallPromptSnapshot = { canInstall: false, installed: false };
const noopSubscribe = () => () => undefined;

/**
 * TASK-24.5: the header install chip and the Settings "Install app" entry
 * share the single captured `beforeinstallprompt` event.
 */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : () => SERVER_SNAPSHOT,
    () => SERVER_SNAPSHOT,
  );
  const promptInstall = store ? store.promptInstall : async () => undefined;
  return { ...snapshot, promptInstall };
}
