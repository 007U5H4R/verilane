import { describe, expect, it } from "vitest";
import {
  CommandNotImplemented,
  InvalidCommand,
  PermissionDenied,
  run,
  type AuditEventInput,
  type Command,
  type Row,
  type TableName,
  type Tx,
} from "./commands";
import { IllegalTransition } from "./transitions";

/** In-memory Tx for pure tests. */
function memTx(seed: Partial<Record<TableName, Row[]>> = {}) {
  const keyOf: Record<TableName, string> = {
    invoices: "invoice_id",
    drafts: "draft_id",
    disputes: "dispute_id",
    reviewItems: "review_id",
    meta: "key",
  };
  const tables = new Map<TableName, Map<string, Row>>();
  for (const t of Object.keys(keyOf) as TableName[]) {
    tables.set(
      t,
      new Map((seed[t] ?? []).map((r) => [String(r[keyOf[t]]), r])),
    );
  }
  const audits: AuditEventInput[] = [];
  const tx: Tx = {
    async get(table, id) {
      return tables.get(table)?.get(id);
    },
    async put(table, row) {
      tables.get(table)?.set(String(row[keyOf[table]]), row);
    },
    async audit(e) {
      audits.push(e);
    },
    now: () => "2026-10-30T09:00:00.000Z",
  };
  return { tx, tables, audits };
}

const seed = () => ({
  invoices: [{ invoice_id: "INV-1" }],
  drafts: [
    { draft_id: "DR-OK", invoice_id: "INV-1", status: "validated", amount_paise: 1_000_000 },
    { draft_id: "DR-BIG", invoice_id: "INV-1", status: "validated", amount_paise: 60_000_000 },
    { draft_id: "DR-GEN", invoice_id: "INV-1", status: "generated" },
  ],
  disputes: [{ dispute_id: "D-1", invoice_id: "INV-1", status: "under_review" }],
  reviewItems: [
    { review_id: "RV-1", kind: "data_issue", status: "open" },
    { review_id: "RV-REC", kind: "reconciliation", status: "open" },
  ],
});

const cmd = (c: Omit<Command, "actor"> & { actor?: Command["actor"] }): Command => ({
  actor: "analyst",
  ...c,
});

describe("run()", () => {
  it("add_note writes exactly one audit event with the note", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text: "  Called AP team  " } }),
      m.tx,
    );
    expect(m.audits).toEqual([e]);
    expect(e).toMatchObject({
      at: "2026-10-30T09:00:00.000Z",
      actor_role: "analyst",
      actor_label: "Analyst",
      action: "add_note",
      subject: "invoice:INV-1",
      invoice_id: "INV-1",
      after: { note: "Called AP team" },
      evidence_ids: [],
    });
    expect(e.summary).toMatch(/Called AP team/);
  });

  it.each(["", "   ", "x".repeat(2001)])("add_note rejects invalid text %#", async (text) => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "add_note", subject: { kind: "invoice", id: "INV-1" }, payload: { text } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
    expect(m.audits).toHaveLength(0);
  });

  it("add_note on an unknown invoice is invalid", async () => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "add_note", subject: { kind: "invoice", id: "NOPE" }, payload: { text: "hi" } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
  });

  it("switch_role persists meta.role with before/after", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "manager" } }),
      m.tx,
    );
    expect(m.tables.get("meta")?.get("role")).toEqual({ key: "role", value: "manager" });
    expect(e).toMatchObject({ before: { role: "analyst" }, after: { role: "manager" } });
    expect(e.summary).toBe("Switched role from Analyst to Manager");
  });

  it("switch_role rejects an unknown role or no-op", async () => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "admin" } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
    await expect(
      run(cmd({ type: "switch_role", subject: { kind: "system", id: "workspace" }, payload: { role: "analyst" } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
    expect(m.audits).toHaveLength(0);
  });

  it("approve_draft moves validated → sent_simulated in one audit", async () => {
    const m = memTx(seed());
    const e = await run(cmd({ type: "approve_draft", subject: { kind: "draft", id: "DR-OK" } }), m.tx);
    expect(m.tables.get("drafts")?.get("DR-OK")?.status).toBe("sent_simulated");
    expect(e).toMatchObject({
      before: { status: "validated" },
      after: { status: "sent_simulated" },
      invoice_id: "INV-1",
    });
    expect(m.audits).toHaveLength(1);
  });

  it("permission facts come from the stored row: Analyst cannot approve > ₹5,00,000", async () => {
    const m = memTx(seed());
    const forced = cmd({
      type: "approve_draft",
      // A caller-supplied amount must not override the stored one.
      subject: { kind: "draft", id: "DR-BIG", amount_paise: 1 } as Command["subject"],
    });
    const err = await run(forced, m.tx).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(PermissionDenied);
    expect((err as PermissionDenied).message).toBe(
      "Only a Manager can approve reminders above ₹5,00,000.",
    );
    expect(m.tables.get("drafts")?.get("DR-BIG")?.status).toBe("validated");
    expect(m.audits).toHaveLength(0);
  });

  it("a Manager can approve > ₹5,00,000", async () => {
    const m = memTx(seed());
    await run(cmd({ type: "approve_draft", subject: { kind: "draft", id: "DR-BIG" }, actor: "manager" }), m.tx);
    expect(m.tables.get("drafts")?.get("DR-BIG")?.status).toBe("sent_simulated");
  });

  it("illegal transitions throw and write nothing", async () => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "approve_draft", subject: { kind: "draft", id: "DR-GEN" } }), m.tx),
    ).rejects.toBeInstanceOf(IllegalTransition);
    expect(m.tables.get("drafts")?.get("DR-GEN")?.status).toBe("generated");
    expect(m.audits).toHaveLength(0);
  });

  it("edit_draft applies text changes and returns to validation", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "edit_draft", subject: { kind: "draft", id: "DR-OK" }, payload: { body: "New body", status: "approved" } }),
      m.tx,
    );
    const row = m.tables.get("drafts")?.get("DR-OK");
    expect(row).toMatchObject({ status: "edited", body: "New body" });
    expect(e).toMatchObject({ before: { status: "validated" }, after: { status: "edited" } });
  });

  it("submit_draft validates on failed_checks", async () => {
    const m = memTx({
      drafts: [
        { draft_id: "A", invoice_id: "INV-1", status: "edited" },
        { draft_id: "B", invoice_id: "INV-1", status: "edited", failed_checks: ["amount"] },
      ],
    });
    await run(cmd({ type: "submit_draft", subject: { kind: "draft", id: "A" } }), m.tx);
    await run(cmd({ type: "submit_draft", subject: { kind: "draft", id: "B" } }), m.tx);
    expect(m.tables.get("drafts")?.get("A")?.status).toBe("validated");
    expect(m.tables.get("drafts")?.get("B")?.status).toBe("blocked");
  });

  it("reject_draft rejects with an optional reason", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "reject_draft", subject: { kind: "draft", id: "DR-GEN" }, payload: { reason: "Wrong tone" } }),
      m.tx,
    );
    expect(e.after).toEqual({ status: "rejected", reason: "Wrong tone" });
  });

  it("dispute_transition only accepts non-terminal events", async () => {
    const m = memTx(seed());
    await run(
      cmd({ type: "dispute_transition", subject: { kind: "dispute", id: "D-1" }, payload: { event: "await_customer" } }),
      m.tx,
    );
    expect(m.tables.get("disputes")?.get("D-1")?.status).toBe("awaiting_customer");
    await expect(
      run(cmd({ type: "dispute_transition", subject: { kind: "dispute", id: "D-1" }, payload: { event: "resolve" } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
  });

  it("resolve_dispute is Manager-only", async () => {
    const m = memTx(seed());
    const c = { type: "resolve_dispute", subject: { kind: "dispute", id: "D-1" }, payload: { outcome: "resolved" } } as const;
    await expect(run(cmd(c), m.tx)).rejects.toBeInstanceOf(PermissionDenied);
    await run(cmd({ ...c, actor: "manager" }), m.tx);
    expect(m.tables.get("disputes")?.get("D-1")?.status).toBe("resolved");
  });

  it("review items: action and dismiss (reconciliation dismiss is Manager-only)", async () => {
    const m = memTx(seed());
    await run(cmd({ type: "action_review", subject: { kind: "review", id: "RV-1" } }), m.tx);
    expect(m.tables.get("reviewItems")?.get("RV-1")?.status).toBe("actioned");
    await expect(
      run(cmd({ type: "dismiss_review", subject: { kind: "review", id: "RV-REC" } }), m.tx),
    ).rejects.toBeInstanceOf(PermissionDenied);
    await run(cmd({ type: "dismiss_review", subject: { kind: "review", id: "RV-REC" }, actor: "manager" }), m.tx);
    expect(m.tables.get("reviewItems")?.get("RV-REC")?.status).toBe("dismissed");
  });

  it("a subject of the wrong kind is invalid", async () => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "approve_draft", subject: { kind: "invoice", id: "INV-1" } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
  });

  it.each([
    ["generate_draft", { kind: "invoice", id: "INV-1" }, "TASK-15"],
    ["mark_disputed", { kind: "invoice", id: "INV-1" }, "TASK-17"],
    ["import_csv", { kind: "system", id: "workspace" }, "TASK-19"],
    ["reset_demo", { kind: "system", id: "workspace" }, "TASK-19"],
    ["set_as_of", { kind: "system", id: "workspace" }, "TASK-19"],
  ] as const)("%s is owned by a later ticket", async (type, subject, owner) => {
    const m = memTx(seed());
    const err = await run(cmd({ type, subject }), m.tx).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(CommandNotImplemented);
    expect((err as Error).message).toContain(owner);
    expect(m.audits).toHaveLength(0);
  });
});
