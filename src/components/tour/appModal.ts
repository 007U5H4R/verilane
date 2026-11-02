/**
 * TASK-44: while the app has its own modal or popup open, it owns the screen
 * and the Esc key. The tour steps back (no ring, no callout) and does not
 * treat that Esc as "exit the tour".
 */
"use client";

import { useEffect, useState } from "react";

export type ModalRoot = { querySelectorAll(selector: string): ArrayLike<Element> };

const APP_MODAL = 'dialog[open], [role="alertdialog"][data-state="open"], [role="dialog"][data-state="open"]';
const APP_POPUP = '[role="menu"], [role="combobox"][aria-expanded="true"]';

function anyOutsideTour(root: ModalRoot, selector: string): boolean {
  return Array.from(root.querySelectorAll(selector)).some((el) => !el.closest("[data-tour-ui]"));
}

/** An app modal (not one of the tour's own cards) is open. */
export function appModalOpen(root: ModalRoot = document): boolean {
  return anyOutsideTour(root, APP_MODAL);
}

/** This Escape belongs to the app: it was handled, or a modal, menu or open search wants it. */
export function escOwnedByApp(e: { defaultPrevented: boolean }, root: ModalRoot = document): boolean {
  return e.defaultPrevented || appModalOpen(root) || anyOutsideTour(root, APP_POPUP);
}

const POLL_MS = 200;

/** Polls for an open app modal (modals open and close outside React's view of the tour). */
export function useAppModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(appModalOpen());
    check();
    const id = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(id);
  }, []);
  return open;
}
