// Chrome/Edge's `beforeinstallprompt` isn't in the lib.dom.d.ts types yet.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptSnapshot {
  canInstall: boolean;
  installed: boolean;
}

/**
 * TASK-24 (T24-2): Chromium fires `beforeinstallprompt` once per document, so
 * the deferred event lives in one store for the whole page. The header chip and
 * the Settings entry (which may mount later, after a client navigation) read the
 * same event. It is cleared for every consumer once `prompt()` is used.
 */
export function createInstallPromptStore(target: EventTarget) {
  let deferred: BeforeInstallPromptEvent | null = null;
  let snapshot: InstallPromptSnapshot = { canInstall: false, installed: false };
  const listeners = new Set<() => void>();

  function update(next: InstallPromptSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    update({ canInstall: !snapshot.installed, installed: snapshot.installed });
  });
  target.addEventListener("appinstalled", () => {
    deferred = null;
    update({ canInstall: false, installed: true });
  });

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): InstallPromptSnapshot {
      return snapshot;
    },
    /** Shows the native prompt once; never rejects (T24-8). */
    async promptInstall(): Promise<void> {
      const event = deferred;
      if (!event) return;
      // A prompt event can only be used once: drop it for every consumer first.
      deferred = null;
      update({ canInstall: false, installed: snapshot.installed });
      try {
        await event.prompt();
        await event.userChoice;
      } catch (err) {
        console.error("Install prompt failed", err);
      }
    },
  };
}

export type InstallPromptStore = ReturnType<typeof createInstallPromptStore>;
