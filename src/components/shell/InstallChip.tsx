"use client";

import { Download, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useInstallPrompt } from "@/lib/useInstallPrompt";

const DISMISS_KEY = "verilane-install-dismissed";
const CHANGE_EVENT = "verilane-install-dismiss-change";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * TASK-24.5 (Design §D5): one-time dismissible "Install Verilane" header
 * chip — no modal. Dismiss is per-session (sessionStorage), not audited.
 */
export function InstallChip() {
  const { canInstall, promptInstall } = useInstallPrompt();
  // false on the server: sessionStorage is only readable on the client.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);

  if (!canInstall || dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage unavailable — the chip just won't persist its dismissal.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div
      data-testid="install-chip"
      className="inline-flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-text"
    >
      <Download className="size-3.5" aria-hidden />
      <button type="button" onClick={promptInstall} className="font-medium underline-offset-2 hover:underline">
        Install Verilane
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="text-text-muted hover:text-text">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
