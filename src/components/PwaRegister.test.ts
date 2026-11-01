/**
 * TASK-35 (T24-7): in dev, a production service worker left on the same
 * origin (e.g. after `pnpm start` on :3000) must be unregistered, or it keeps
 * serving cached production pages and chunks over the dev server.
 */
import { describe, expect, it, vi } from "vitest";
import { reloadIfStillControlled, unregisterServiceWorkers } from "./PwaRegister";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
    items,
  };
}

// T35-6: unregistering doesn't release a page the old SW already controls.
describe("reloadIfStillControlled", () => {
  it("reloads a page the old worker still controls", () => {
    const reload = vi.fn();
    expect(reloadIfStillControlled({ controlled: true, storage: memoryStorage(), reload })).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads only once per tab, so it can't loop", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadIfStillControlled({ controlled: true, storage, reload });
    expect(reloadIfStillControlled({ controlled: true, storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves an uncontrolled page alone and clears the guard", () => {
    const storage = memoryStorage();
    storage.setItem("verilane:sw-dev-reload", "1");
    const reload = vi.fn();
    expect(reloadIfStillControlled({ controlled: false, storage, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.items.size).toBe(0);
  });

  it("doesn't reload when the guard can't be stored", () => {
    const reload = vi.fn();
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      removeItem: () => {},
    };
    expect(reloadIfStillControlled({ controlled: true, storage: blocked, reload })).toBe(false);
    expect(reloadIfStillControlled({ controlled: true, storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

function registration(result: boolean | Error) {
  return {
    unregister: vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))),
  };
}

describe("unregisterServiceWorkers", () => {
  it("unregisters every registration on the origin", async () => {
    const regs = [registration(true), registration(true)];
    const container = { getRegistrations: vi.fn(async () => regs) };
    await expect(unregisterServiceWorkers(container)).resolves.toBe(2);
    for (const reg of regs) expect(reg.unregister).toHaveBeenCalledOnce();
  });

  it("does nothing when no worker is registered", async () => {
    await expect(unregisterServiceWorkers({ getRegistrations: async () => [] })).resolves.toBe(0);
  });

  it("still unregisters the rest when one fails, then reports the failure", async () => {
    const ok = registration(true);
    const container = { getRegistrations: async () => [registration(new Error("boom")), ok] };
    await expect(unregisterServiceWorkers(container)).rejects.toThrow("boom");
    expect(ok.unregister).toHaveBeenCalledOnce();
  });
});
