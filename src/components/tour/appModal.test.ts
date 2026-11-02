import { describe, expect, it } from "vitest";

import { appModalOpen, escOwnedByApp, type ModalRoot } from "./appModal";

// The unit project runs in node (no DOM): a fake root answers
// querySelectorAll with elements that may sit inside the tour's own UI.
type Fake = { sel: string; inTour?: boolean };
function root(els: Fake[]): ModalRoot {
  return {
    querySelectorAll: (selector: string) => {
      const parts = selector.split(",").map((s) => s.trim());
      return els
        .filter((e) => parts.includes(e.sel))
        .map((e) => ({ closest: (s: string) => (s === "[data-tour-ui]" && e.inTour ? {} : null) }) as unknown as Element);
    },
  };
}

describe("appModalOpen", () => {
  it("is false when nothing is open", () => {
    expect(appModalOpen(root([]))).toBe(false);
  });

  it("is true for an open Radix alert dialog (the approve confirm)", () => {
    expect(appModalOpen(root([{ sel: '[role="alertdialog"][data-state="open"]' }]))).toBe(true);
  });

  it("is true for an open native modal dialog (More sheet, Filter sheet)", () => {
    expect(appModalOpen(root([{ sel: "dialog[open]" }]))).toBe(true);
  });

  it("ignores the tour's own dialogs", () => {
    expect(appModalOpen(root([{ sel: '[role="dialog"][data-state="open"]', inTour: true }]))).toBe(false);
  });
});

describe("escOwnedByApp", () => {
  it("is true when the app already handled the key", () => {
    expect(escOwnedByApp({ defaultPrevented: true }, root([]))).toBe(true);
  });

  it("is true while a menu or an expanded search combobox is open", () => {
    expect(escOwnedByApp({ defaultPrevented: false }, root([{ sel: '[role="menu"]' }]))).toBe(true);
    expect(escOwnedByApp({ defaultPrevented: false }, root([{ sel: '[role="combobox"][aria-expanded="true"]' }]))).toBe(true);
  });

  it("is false when nothing in the app wants the key", () => {
    expect(escOwnedByApp({ defaultPrevented: false }, root([]))).toBe(false);
  });
});
