import { describe, expect, it, vi } from "vitest";
import { createTourStore } from "./tourStore";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("tour store", () => {
  it("starts idle and round-trips state through storage", () => {
    const storage = fakeStorage();
    const store = createTourStore(storage);
    expect(store.getTour()).toEqual({ phase: "idle", step: 0, substage: 0 });
    store.setTour({ phase: "running", step: 3, substage: 1 });
    expect(store.getTour()).toEqual({ phase: "running", step: 3, substage: 1 });
    expect(JSON.parse(storage.map.get("verilane-tour")!)).toEqual({ phase: "running", step: 3, substage: 1 });
  });

  it("restores the saved state in a fresh store (navigation / refresh)", () => {
    const storage = fakeStorage();
    createTourStore(storage).setTour({ phase: "running", step: 5, substage: 0 });
    expect(createTourStore(storage).getTour()).toEqual({ phase: "running", step: 5, substage: 0 });
  });

  it("ignores a corrupt saved value", () => {
    const storage = fakeStorage();
    storage.map.set("verilane-tour", '{"phase":"nope","step":-4}');
    expect(createTourStore(storage).getTour()).toEqual({ phase: "idle", step: 0, substage: 0 });
  });

  it("keeps working in memory when storage throws, and notifies subscribers", () => {
    const store = createTourStore({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const cb = vi.fn();
    const unsubscribe = store.subscribeTour(cb);
    store.requestTour();
    expect(store.getTour()).toEqual({ phase: "confirm", step: 0, substage: 0 });
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.exitTour();
    expect(store.getTour().phase).toBe("idle");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("works with no storage at all", () => {
    const store = createTourStore(null);
    store.setTour({ phase: "finished", step: 7, substage: 0 });
    expect(store.getTour().phase).toBe("finished");
  });
});
