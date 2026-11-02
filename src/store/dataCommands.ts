/**
 * The UI-facing data operations (TASK-19.2). Each does its non-Dexie IO
 * (reading the file, fetching the seed) BEFORE opening the transaction, then
 * goes through `execute()` so the write and its audit event commit together.
 * TASK-40: the parser and the seed loader load on call, so a page that only
 * sets the as-of date doesn't ship them in its first load.
 */
import type { ImportKind } from "@/domain/commands";
import type { ParsedImport, Result, RowError } from "./csv";
import type { VerilaneDb } from "./db";
import type { Fetcher } from "./seedVersion";
import { execute } from "./tx";

const IMPORT_SUBJECT = { kind: "system", id: "import" } as const;

/**
 * Validates `text` and either replaces the `kind` table (TC-058) or records
 * an `import_rejected` event listing every problem (TC-057). Both outcomes
 * are audited; the parse result is returned so the UI can show the errors.
 */
export async function importCsv(
  db: VerilaneDb,
  kind: ImportKind,
  fileName: string,
  text: string,
): Promise<Result<ParsedImport, RowError[]>> {
  const { parseImport } = await import("./csv");
  const parsed = parseImport(kind, text);
  if (parsed.ok) {
    await execute(db, {
      type: "import_csv",
      subject: IMPORT_SUBJECT,
      payload: {
        kind,
        file_name: fileName,
        rows: parsed.value.rows,
        data_issues: parsed.value.dataIssues,
      },
    });
  } else {
    await execute(db, {
      type: "import_csv",
      subject: IMPORT_SUBJECT,
      payload: { kind, file_name: fileName, errors: parsed.error },
    });
  }
  return parsed;
}

/**
 * Wipes every table (keeping the role), reloads the shipped seed and
 * recomputes; `demo_reset` becomes the first audit event (TC-060).
 */
export async function resetDemo(
  db: VerilaneDb,
  fetcher: Fetcher = fetch,
  manifestUrl = "/seed/manifest.json",
) {
  const { loadSeed } = await import("./loader");
  const { manifest, ingested } = await loadSeed(fetcher, manifestUrl);
  return execute(db, {
    type: "reset_demo",
    subject: { kind: "system", id: "demo" },
    payload: { seed_version: manifest.seedVersion, seed: ingested },
  });
}

/** Overrides the as-of date (`null` restores the default) and re-ranks (TC-061). */
export function setAsOf(db: VerilaneDb, date: string | null) {
  return execute(db, {
    type: "set_as_of",
    subject: { kind: "system", id: "as-of" },
    payload: { as_of: date },
  });
}
