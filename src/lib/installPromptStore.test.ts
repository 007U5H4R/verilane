/**
 * TASK-24 fix round 1 (T24-2, T24-8): one captured `beforeinstallprompt` for
 * the whole document, shared by every consumer and cleared after use.
 */
import { describe, expect, it, vi } from "vitest";
import { createInstallPromptStore } from "./installPromptStore";

function promptEvent(prompt: () => Promise<void> = () => Promise.resolve()) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  return event;
}

describe("installPromptStore", () => {
  it("shares an event captured before any consumer subscribed", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const event = promptEvent();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // A consumer that mounts later (e.g. Settings after a client navigation).
    const late = vi.fn();
    store.subscribe(late);
    expect(store.getSnapshot().canInstall).toBe(true);
  });

  it("notifies subscribers and clears the event for everyone after prompt()", async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    const prompt = vi.fn(() => Promise.resolve());
    target.dispatchEvent(promptEvent(prompt));
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();

    await store.promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().canInstall).toBe(false);
    // A second call has nothing to prompt and must not reuse the consumed event.
    await store.promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("handles a rejected prompt() without throwing and logs it", async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    target.dispatchEvent(promptEvent(() => Promise.reject(new DOMException("used", "InvalidStateError"))));
    await expect(store.promptInstall()).resolves.toBeUndefined();
    expect(store.getSnapshot().canInstall).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("marks installed and drops the event on appinstalled", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(promptEvent());
    target.dispatchEvent(new Event("appinstalled"));
    expect(store.getSnapshot()).toEqual({ canInstall: false, installed: true });
  });

  it("returns a stable snapshot between changes (useSyncExternalStore contract)", () => {
    const store = createInstallPromptStore(new EventTarget());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
