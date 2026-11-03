/**
 * TASK-38 dispute commands through the real `run()` core: assign_dispute,
 * the transition note, and resolve_dispute's optional resolution record.
 */
import { describe, expect, it } from "vitest";
import { InvalidCommand, run, type AuditEventInput, type Command, type Row, type TableName, type Tx } from "../commands";
import { paise } from "../money";
import type { DraftSources } from "../validate";

function memTx(seed: Partial<Record<TableName, Row[]>>) {
  const keyOf: Record<TableName, string> = {
    invoices: "invoice_id",
    drafts: "draft_id",
    disputes: "dispute_id",
    reviewItems: "review_id",
    meta: "key",
  };
  const tables = new Map<TableName, Map<string, Row>>();
  for (const t of Object.keys(keyOf) as TableName[]) {
    tables.set(t, new Map((seed[t] ?? []).map((r) => [String(r[keyOf[t]]), r])));
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
  invoices: [{ invoice_id: "INV-1", status: "open" }],
  disputes: [
    { dispute_id: "D-1", invoice_id: "INV-1", status: "under_review" },
    { dispute_id: "D-2", invoice_id: "INV-1", status: "resolved" },
  ],
});

const cmd = (c: Omit<Command, "actor"> & { actor?: Command["actor"] }): Command => ({ actor: "analyst", ...c });
const D = { kind: "dispute", id: "D-1" } as const;

const ledger = (payments: DraftSources["payments"]): DraftSources => ({
  asOf: "2026-10-30",
  invoices: [],
  customers: [],
  payments,
  extractions: [],
  matches: [],
  disputes: [],
  reviewItems: [],
});

describe("assign_dispute", () => {
  it("sets and clears the owner, one audited before/after each, status untouched", async () => {
    const m = memTx(seed());
    const e = await run(cmd({ type: "assign_dispute", subject: D, payload: { reviewer: "Ananya Rao" } }), m.tx);
    expect(m.tables.get("disputes")?.get("D-1")).toMatchObject({ assigned_reviewer: "Ananya Rao", status: "under_review" });
    expect(e).toMatchObject({
      action: "assign_dispute",
      before: { assigned_reviewer: null },
      after: { assigned_reviewer: "Ananya Rao" },
    });
    await run(cmd({ type: "assign_dispute", subject: D, payload: { reviewer: null } }), m.tx);
    expect(m.tables.get("disputes")?.get("D-1")).not.toHaveProperty("assigned_reviewer");
    expect(m.audits).toHaveLength(2);
    expect(m.audits[1]).toMatchObject({ before: { assigned_reviewer: "Ananya Rao" }, after: { assigned_reviewer: null } });
  });

  it.each([
    ["someone outside the team", D, { reviewer: "Someone Else" }],
    ["a missing reviewer", D, {}],
    ["a closed dispute", { kind: "dispute", id: "D-2" } as const, { reviewer: "Vikram Shah" }],
    ["a no-op unassign", D, { reviewer: null }],
  ])("refuses %s without writing", async (_l, subject, payload) => {
    const m = memTx(seed());
    await expect(run(cmd({ type: "assign_dispute", subject, payload }), m.tx)).rejects.toBeInstanceOf(InvalidCommand);
    expect(m.audits).toHaveLength(0);
  });
});

describe("dispute_transition note", () => {
  it("records an optional trimmed note on the audit event; non-text is refused", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "dispute_transition", subject: D, payload: { event: "await_customer", note: "  Asked for the PO  " } }),
      m.tx,
    );
    expect(e.after).toEqual({ status: "awaiting_customer", note: "Asked for the PO" });
    await expect(
      run(cmd({ type: "dispute_transition", subject: D, payload: { event: "customer_replied", note: 5 } }), m.tx),
    ).rejects.toBeInstanceOf(InvalidCommand);
    expect(m.audits).toHaveLength(1);
  });
});

describe("resolve_dispute resolution record", () => {
  it("without a resolution behaves exactly as before", async () => {
    const m = memTx(seed());
    const e = await run(cmd({ type: "resolve_dispute", actor: "manager", subject: D, payload: { outcome: "resolved" } }), m.tx);
    expect(e.after).toEqual({ status: "resolved" });
    expect(e.summary).toBe("Dispute D-1 resolved");
  });

  it("records a validated resolution and never touches the invoice", async () => {
    const m = memTx(seed());
    const before = { ...m.tables.get("invoices")?.get("INV-1") };
    const e = await run(
      cmd({
        type: "resolve_dispute",
        actor: "manager",
        subject: D,
        payload: {
          outcome: "resolved",
          resolution: {
            code: "invoice_corrected",
            notes: " Reissued ",
            evidence: "Credit memo CM-4",
            date: "2026-10-29",
            reviewer: "Meera Iyer",
          },
        },
      }),
      m.tx,
    );
    expect(e.after).toEqual({
      status: "resolved",
      resolution: { code: "invoice_corrected", notes: "Reissued", evidence: "Credit memo CM-4", date: "2026-10-29", reviewer: "Meera Iyer" },
    });
    expect(e.summary).toBe("Dispute D-1 resolved: Invoice corrected");
    expect(m.tables.get("invoices")?.get("INV-1")).toEqual(before);
    expect(m.audits).toHaveLength(1);
  });

  it("an Analyst still cannot resolve, resolution or not", async () => {
    const m = memTx(seed());
    await expect(
      run(cmd({ type: "resolve_dispute", subject: D, payload: { outcome: "resolved", resolution: { code: "other", notes: "x" } } }), m.tx),
    ).rejects.toThrow();
    expect(m.audits).toHaveLength(0);
  });

  it.each([
    ["missing notes", { outcome: "resolved", resolution: { code: "other", notes: "  " } }],
    ["a code / outcome mismatch", { outcome: "resolved", resolution: { code: "claim_rejected", notes: "x" } }],
    ["a non-closing code", { outcome: "resolved", resolution: { code: "awaiting_info", notes: "x" } }],
    ["an unknown code", { outcome: "rejected", resolution: { code: "nope", notes: "x" } }],
    ["a bad date", { outcome: "resolved", resolution: { code: "other", notes: "x", date: "29/10/2026" } }],
    ["an outside reviewer", { outcome: "resolved", resolution: { code: "other", notes: "x", reviewer: "Bob" } }],
    ["a non-object", { outcome: "resolved", resolution: "done" }],
  ])("refuses a resolution with %s, writing nothing", async (_l, payload) => {
    const m = memTx(seed());
    await expect(run(cmd({ type: "resolve_dispute", actor: "manager", subject: D, payload }), m.tx)).rejects.toBeInstanceOf(
      InvalidCommand,
    );
    expect(m.tables.get("disputes")?.get("D-1")?.status).toBe("under_review");
    expect(m.audits).toHaveLength(0);
  });

  it("claim_rejected rejects the dispute", async () => {
    const m = memTx(seed());
    const e = await run(
      cmd({ type: "resolve_dispute", actor: "manager", subject: D, payload: { outcome: "rejected", resolution: { code: "claim_rejected", notes: "No basis" } } }),
      m.tx,
    );
    expect(e.after).toMatchObject({ status: "rejected" });
  });

  it("payment reconciled needs a real ledger payment for the disputed invoice (a claim is not proof)", async () => {
    const c = cmd({
      type: "resolve_dispute",
      actor: "manager",
      subject: D,
      payload: { outcome: "resolved", resolution: { code: "payment_reconciled", notes: "Matched" } },
    });
    const none = memTx(seed());
    await expect(run(c, none.tx)).rejects.toThrow(/not proof/);
    const other = memTx(seed());
    other.tx.draftSources = async () =>
      ledger([{ payment_id: "P-9", invoice_id: "INV-9", paid_on: "2026-10-01", amount_paise: paise(100) }]);
    await expect(run(c, other.tx)).rejects.toThrow(/not proof/);
    expect(other.audits).toHaveLength(0);
    const paid = memTx(seed());
    paid.tx.draftSources = async () =>
      ledger([{ payment_id: "P-1", invoice_id: "INV-1", paid_on: "2026-10-01", amount_paise: paise(100) }]);
    const e = await run(c, paid.tx);
    expect(e.after).toMatchObject({ status: "resolved", resolution: { code: "payment_reconciled" } });
  });
});
