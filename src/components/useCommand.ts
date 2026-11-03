"use client";
import { useCallback, useContext } from "react";
import { toast } from "sonner";
import type { AuditEventInput } from "@/domain/commands";
import type { VerilaneDb } from "@/store/db";
import { DbContext } from "@/store/hooks";
import { execute, type CommandInput } from "@/store/tx";

/**
 * Runs a command and surfaces any refusal (permission, illegal transition,
 * invalid input) as an error toast with its finance-readable reason, then
 * rethrows so the caller can keep its own state (e.g. the note draft).
 */
export async function executeWithToast(
  db: VerilaneDb,
  cmd: CommandInput,
): Promise<AuditEventInput> {
  try {
    return await execute(db, cmd);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "That action failed.");
    throw err;
  }
}

/** `executeWithToast` bound to the provided db; `null` outside the provider. */
export function useCommand(): ((cmd: CommandInput) => Promise<AuditEventInput>) | null {
  const db = useContext(DbContext);
  const run = useCallback(
    (cmd: CommandInput) => {
      if (!db) throw new Error("No database");
      return executeWithToast(db, cmd);
    },
    [db],
  );
  return db ? run : null;
}
