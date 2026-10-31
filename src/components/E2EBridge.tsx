"use client";

import { useEffect } from "react";

import { executeWithToast } from "@/components/useCommand";
import type { VerilaneDb } from "@/store/db";
import type { CommandInput } from "@/store/tx";

declare global {
  interface Window {
    __verilane?: {
      execute: (cmd: CommandInput) => Promise<unknown>;
      db: VerilaneDb;
    };
  }
}

/**
 * E2E-only test hook (TASK-14, TC-039): exposes `window.__verilane` so a spec
 * can force a command past the disabled UI. Rendered only when the build has
 * `NEXT_PUBLIC_E2E === "1"`; normal builds never mount it.
 */
export function E2EBridge({ db }: { db: VerilaneDb }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E !== "1") return;
    window.__verilane = { execute: (cmd) => executeWithToast(db, cmd), db };
    return () => {
      delete window.__verilane;
    };
  }, [db]);
  return null;
}
