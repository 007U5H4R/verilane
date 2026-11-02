/**
 * TASK-40 · The light half of the command core: constants and error types
 * the shell and dialogs read on every page. Kept apart from `commands.ts`
 * so importing them doesn't pull the command core (drafts, validation,
 * disputes) into every route's first load; `commands.ts` re-exports all of it.
 */
import type { Action, Role } from "./permissions";

/** The source tables a CSV import may replace (TASK-19). */
export const IMPORT_KINDS = ["invoices", "customers", "payments"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** `meta` key of the per-browser as-of override (clock.ts `asOf()`). */
export const AS_OF_KEY = "asOf";

export const ROLE_LABEL: Record<Role, string> = {
  analyst: "Analyst",
  manager: "Manager",
};

export const NOTE_MAX_LENGTH = 2000;

export class PermissionDenied extends Error {
  constructor(
    readonly action: Action,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "PermissionDenied";
  }
}

export class InvalidCommand extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommand";
  }
}

export class CommandNotImplemented extends Error {
  constructor(
    readonly action: Action,
    owner: string,
  ) {
    super(`${action} is not available yet (arrives with ${owner}).`);
    this.name = "CommandNotImplemented";
  }
}
