/**
 * TC-042 (TASK-15): every hand-labelled draft case in `drafts.cases.json`
 * runs end to end on the real seed — `generate_draft`, then the case's edit
 * through `edit_draft` (which re-runs the nine checks, FS12) — via the same
 * `execute()` the UI uses. The stored checks must match the label.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requiresManager } from "@/domain/validate";
import { VerilaneDb } from "@/store/db";
import { ensureSeeded, type Fetcher } from "@/store/loader";
import { execute } from "@/store/tx";
import { DraftCaseFile, type DraftCase } from "./schema";

const here = join(process.cwd(), "eval");
const cases = DraftCaseFile.parse(JSON.parse(readFileSync(join(here, "drafts.cases.json"), "utf-8")));

function realFetcher(): Fetcher {
  const seedDir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = new Map(names.map((n) => [`/seed/${n}`, readFileSync(join(seedDir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files.get(String(url));
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

interface DraftRow {
  draft_id: string;
  status: string;
  body: string;
  facts: { kind: string; value: string }[];
  failed_checks: number[];
  checks: unknown[];
  amount_paise: number;
  ambiguous_match: boolean;
  conflicting_payment: boolean;
}

function applyEdit(row: DraftRow, edit: NonNullable<DraftCase["edit"]>): string {
  if (edit.op === "append") return `${row.body}\n${edit.text}`;
  const fact = row.facts.find((f) => f.kind === edit.fact_kind);
  if (!fact) throw new Error(`draft has no ${edit.fact_kind} fact to replace`);
  return row.body.split(fact.value).join(edit.text);
}

let db: VerilaneDb;

beforeAll(async () => {
  db = new VerilaneDb(`verilane-drafts-eval-${Math.random()}`);
  await ensureSeeded(db, realFetcher());
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("draft cases (TC-042)", () => {
  it("has the 28 labelled cases", () => {
    expect(cases).toHaveLength(28);
  });

  it.each(cases.map((c) => [c.case_id, c] as const))("%s", async (_id, c) => {
    await db.meta.put({ key: "role", value: c.role });
    const audits = await db.audit.count();

    await execute(db, { type: "generate_draft", subject: { kind: "invoice", id: c.invoice_id } });
    let row = (await db.drafts
      .where("invoice_id")
      .equals(c.invoice_id)
      .filter((d) => d.status === "generated")
      .first()) as DraftRow | undefined;
    if (!row) throw new Error(`no draft generated for ${c.invoice_id}`);
    expect(row.checks).toHaveLength(9);

    if (c.edit) {
      await execute(db, {
        type: "edit_draft",
        subject: { kind: "draft", id: row.draft_id },
        payload: { body: applyEdit(row, c.edit) },
      });
      row = (await db.drafts.get(row.draft_id)) as unknown as DraftRow;
    }

    const failed = row.failed_checks;
    for (const n of c.expected.must_fail) expect(failed, `${c.case_id} check ${n}`).toContain(n);
    expect(failed.length === 0, `${c.case_id} approvable`).toBe(c.expected.approvable);
    if (c.expected.requires_manager !== undefined) {
      expect(requiresManager(row), `${c.case_id} requires_manager`).toBe(c.expected.requires_manager);
    }
    // One audit event per command (TC-037).
    expect(await db.audit.count()).toBe(audits + (c.edit ? 2 : 1));

    // Close the draft so the next case on the same invoice can generate one.
    await execute(db, { type: "reject_draft", subject: { kind: "draft", id: row.draft_id } });
  });
});
