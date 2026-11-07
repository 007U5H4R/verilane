/**
 * `Result<T, E>` for the Recommend/Policy agents (TKT-75.03). A domain-local
 * equivalent of `ai/provider.ts`'s `Result`/`Rejected` — not imported from
 * there, because Recommend and Policy never pass through a provider (A1,
 * Architecture.md §4): they are pure financial/matching/permission logic,
 * the same category as `matching`/`priority`/`permissions` (EXE130).
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** A rejected, never-persisted outcome, with the reason a human can read. */
export class Rejected {
  readonly reason: string;
  constructor(reason: string) {
    this.reason = reason;
  }
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err(reason: string): Result<never, Rejected> {
  return { ok: false, error: new Rejected(reason) };
}
