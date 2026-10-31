/**
 * Opens the Dexie db, ensures the seed is loaded, and provides it via
 * `DbContext` (TASK-7.6, A4). SR9's storage-fallback banner and richer
 * loading/empty/error states are TASK-9.4/TASK-10's job — this is the
 * happy-path shape.
 */
"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { openDb, type VerilaneDb } from "@/store/db";
import { ensureSeeded } from "@/store/loader";
import { DbContext, SeedUpdateContext } from "@/store/hooks";

interface DataProviderProps {
  children: ReactNode;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; db: VerilaneDb; updateAvailable: boolean }
  | { kind: "error"; error: Error };

export function DataProvider({ children }: DataProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db } = await openDb();
        const result = await ensureSeeded(db);
        if (!cancelled) {
          setStatus({ kind: "ready", db, updateAvailable: result === "update-available" });
        }
      } catch (err) {
        if (!cancelled) {
          setStatus({ kind: "error", error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === "loading") return null;
  if (status.kind === "error") {
    console.error("[verilane] failed to open database", status.error);
    return <>{children}</>;
  }
  return (
    <DbContext.Provider value={status.db}>
      <SeedUpdateContext.Provider value={status.updateAvailable}>
        {children}
      </SeedUpdateContext.Provider>
    </DbContext.Provider>
  );
}
