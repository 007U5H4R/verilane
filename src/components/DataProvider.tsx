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
import { seedStatus } from "@/store/seedVersion";
import { DbContext, PersistentContext, SeedUpdateContext } from "@/store/hooks";
import { E2EBridge } from "@/components/E2EBridge";
import { ShellLoading } from "@/components/shell/ShellLoading";
import { emitSplash } from "@/lib/splash/events";

interface DataProviderProps {
  children: ReactNode;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; db: VerilaneDb; updateAvailable: boolean; persistent: boolean }
  | { kind: "error"; error: Error };

export function DataProvider({ children }: DataProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    emitSplash("provider"); // TASK-45.2: splash phase
    (async () => {
      try {
        const { db, persistent } = await openDb();
        // TASK-40: a returning visit only checks the seed version; the
        // loader loads when the database still needs seeding.
        const result = (await seedStatus(db)) ?? (emitSplash("seeding"), await (await import("@/store/loader")).ensureSeeded(db));
        if (!cancelled) {
          setStatus({
            kind: "ready",
            db,
            updateAvailable: result === "update-available",
            persistent,
          });
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

  // TASK-45.2: splash phase — the app is ready (or failed and renders bare).
  useEffect(() => {
    if (status.kind !== "loading") emitSplash(status.kind);
  }, [status.kind]);

  if (status.kind === "loading") return <ShellLoading />;
  if (status.kind === "error") {
    console.error("[verilane] failed to open database", status.error);
    return <>{children}</>;
  }
  return (
    <DbContext.Provider value={status.db}>
      {process.env.NEXT_PUBLIC_E2E === "1" && <E2EBridge db={status.db} />}
      <PersistentContext.Provider value={status.persistent}>
        <SeedUpdateContext.Provider value={status.updateAvailable}>
          {children}
        </SeedUpdateContext.Provider>
      </PersistentContext.Provider>
    </DbContext.Provider>
  );
}
