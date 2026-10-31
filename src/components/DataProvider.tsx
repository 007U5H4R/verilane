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
import { DbContext } from "@/store/hooks";
import { E2EBridge } from "@/components/E2EBridge";

interface DataProviderProps {
  children: ReactNode;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; db: VerilaneDb }
  | { kind: "error"; error: Error };

export function DataProvider({ children }: DataProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db } = await openDb();
        const result = await ensureSeeded(db);
        if (result === "update-available") {
          console.warn("[verilane] seed update available");
        }
        if (!cancelled) setStatus({ kind: "ready", db });
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
      {process.env.NEXT_PUBLIC_E2E === "1" && <E2EBridge db={status.db} />}
      {children}
    </DbContext.Provider>
  );
}
