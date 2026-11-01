/**
 * TASK-35 (T24-7): in dev, a production service worker left on the same
 * origin (e.g. after `pnpm start` on :3000) must be unregistered, or it keeps
 * serving cached production pages and chunks over the dev server.
 */
import { describe, expect, it, vi } from "vitest";
import { unregisterServiceWorkers } from "./PwaRegister";

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
