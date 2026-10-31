/**
 * TASK-14.4 gates on fake-indexeddb (wired in src/test/setup.ts):
 * TC-037 exactly one audit event per command; TC-038 atomic rollback.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommandNotImplemented, PermissionDenied } from "@/domain/commands";
import type { Invoice } from "@/domain/schema";
import { VerilaneDb } from "./db";
import { execute, type CommandInput } from "./tx";

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-tx-${Math.random()}`);
  await db.invoices.add({ row_id: 1, invoice_id: "INV-1", invoice_number: "1001" } as unknown as Invoice);
  await db.drafts.bulkAdd([
    { draft_id: "DR-E", invoice_id: "INV-1", status: "validated", amount_paise: 1_000_000 },
    { draft_id: "DR-S", invoice_id: "INV-1", status: "edited" },
    { draft_id: "DR-A", invoice_id: "INV-1", status: "validated", amount_paise: 1_000_000 },
    { draft_id: "DR-R", invoice_id: "INV-1", status: "generated" },
    { draft_id: "DR-BIG", invoice_id: "INV-1", status: "validated", amount_paise: 60_000_000 },
  ]);
  await db.disputes.bulkAdd([
    { dispute_id: "D-T", invoice_id: "INV-1", status: "new" },
    { dispute_id: "D-R", invoice_id: "INV-1", status: "under_review" },
  ]);
  await db.reviewItems.bulkAdd([
    { review_id: "RV-A", kind: "data_issue", status: "open" },
    { review_id: "RV-D", kind: "data_issue", status: "open" },
  ]);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/** Every implemented command type, once each (manager-only ones run as Manager). */
const COMMANDS: Array<{ cmd: CommandInput; asManager?: boolean }> = [
  { cmd: { type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text: "Called AP" } } },
  { cmd: { type: "edit_draft", subject: { kind: "draft", id: "DR-E" }, payload: { body: "Hi" } } },
  { cmd: { type: "submit_draft", subject: { kind: "draft", id: "DR-S" } } },
  { cmd: { type: "approve_draft", subject: { kind: "draft", id: "DR-A" } } },
  { cmd: { type: "reject_draft", subject: { kind: "draft", id: "DR-R" } } },
  { cmd: { type: "dispute_transition", subject: { kind: "dispute", id: "D-T" }, payload: { event: "start_review" } } },
  { cmd: { type: "resolve_dispute", subject: { kind: "dispute", id: "D-R" }, payload: { outcome: "resolved" } }, asManager: true },
  { cmd: { type: "action_review", subject: { kind: "review", id: "RV-A" } } },
  { cmd: { type: "dismiss_review", subject: { kind: "review", id: "RV-D" } } },
  { cmd: { type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "manager" } } },
];

describe("execute() — TC-037 one audit event per command", () => {
  it.each(COMMANDS.map((c) => [c.cmd.type, c] as const))("%s", async (_type, { cmd, asManager }) => {
    if (asManager) await db.meta.put({ key: "role", value: "manager" });
    const before = await db.audit.count();
    await execute(db, cmd);
    expect(await db.audit.count()).toBe(before + 1);
    const last = await db.audit.orderBy("event_id").last();
    expect(last).toMatchObject({
      actor_role: asManager ? "manager" : "analyst",
      actor_label: asManager ? "Manager" : "Analyst",
      action: cmd.type,
      subject: `${cmd.subject.kind}:${cmd.subject.id}`,
    });
    expect(typeof last?.event_id).toBe("number");
    expect(Number.isNaN(Date.parse(String(last?.at)))).toBe(false);
    expect(last?.after).toBeTypeOf("object");
    if (cmd.type !== "add_note") expect(last?.before).toBeTypeOf("object");
    expect(typeof last?.summary).toBe("string");
  });

  it("event ids are monotonic", async () => {
    for (const { cmd, asManager } of COMMANDS) {
      if (asManager) continue;
      await execute(db, cmd);
    }
    const ids = (await db.audit.toArray()).map((e) => e.event_id ?? 0);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the actor is the persisted role, not the caller's claim", async () => {
    const forced: CommandInput = {
      type: "approve_draft",
      subject: { kind: "draft", id: "DR-BIG" },
      actor: "manager",
    };
    await expect(execute(db, forced)).rejects.toBeInstanceOf(PermissionDenied);
    expect((await db.drafts.get("DR-BIG"))?.status).toBe("validated");
    expect(await db.audit.count()).toBe(0);
  });

  it("not-yet-implemented commands write nothing", async () => {
    await expect(
      execute(db, { type: "reset_demo", subject: { kind: "system", id: "workspace" } }),
    ).rejects.toBeInstanceOf(CommandNotImplemented);
    expect(await db.audit.count()).toBe(0);
  });
});

describe("execute() — TC-038 atomic rollback", () => {
  it("a throw after the state write rolls back the write and the audit event", async () => {
    const boom = new Error("injected failure");
    const err = await execute(
      db,
      { type: "approve_draft", subject: { kind: "draft", id: "DR-A" } },
      {
        beforeCommit: () => {
          throw boom;
        },
      },
    ).catch((e: unknown) => e);
    expect(err).toBe(boom);
    expect((await db.drafts.get("DR-A"))?.status).toBe("validated");
    expect(await db.audit.count()).toBe(0);
  });

  it("a role switch rolls back too", async () => {
    await execute(
      db,
      { type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "manager" } },
      {
        beforeCommit: async () => {
          // The write is visible inside the transaction…
          expect((await db.meta.get("role"))?.value).toBe("manager");
          throw new Error("injected");
        },
      },
    ).catch(() => undefined);
    // …but not after the rollback.
    expect(await db.meta.get("role")).toBeUndefined();
    expect(await db.audit.count()).toBe(0);
  });
});
