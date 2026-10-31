/**
 * Opens the Dexie db, ensures the seed is loaded, and provides it via
 * `DbContext` (TASK-7.6, A4), plus whether storage is persistent via
 * `PersistentContext` (SR9 banner, TASK-10). Richer loading/empty/error
 * states are TASK-9.4's job.
 */
"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { openDb, type VerilaneDb } from "@/store/db";
import { ensureSeeded } from "@/store/loader";
import { DbContext, PersistentContext } from "@/store/hooks";

interface DataProviderProps {
  children: ReactNode;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; db: VerilaneDb; persistent: boolean }
  | { kind: "error"; error: Error };

export function DataProvider({ children }: DataProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db, persistent } = await openDb();
        const result = await ensureSeeded(db);
        if (result === "update-available") {
          console.warn("[verilane] seed update available");
        }
        if (!cancelled) setStatus({ kind: "ready", db, persistent });
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
      <PersistentContext.Provider value={status.persistent}>{children}</PersistentContext.Provider>
    </DbContext.Provider>
  );
}
