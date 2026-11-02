/**
 * TASK-38 reconciliation commands: workflow flags (analyst) and decisions
 * (manager). They only ever write the review item and one audit event —
 * never a ledger row, an invoice status or a balance.
 */
import { describe, expect, it } from "vitest";
import { InvalidCommand, PermissionDenied, run, type AuditEventInput, type Command, type Row, type TableName, type Tx } from "../commands";
import { can } from "../permissions";
import type { DraftSources } from "../validate";
import { CUSTOMERS, INVOICES, MATCHES, PAYMENTS } from "./fixtures";

function memTx(reviewItems: Row[], invoices: Row[] = INVOICES as unknown as Row[]) {
  const keyOf: Record<TableName, string> = {
    invoices: "invoice_id",
    drafts: "draft_id",
    disputes: "dispute_id",
    reviewItems: "review_id",
    meta: "key",
  };
  const tables = new Map<TableName, Map<string, Row>>();
  for (const t of Object.keys(keyOf) as TableName[]) tables.set(t, new Map());
  for (const r of reviewItems) tables.get("reviewItems")?.set(String(r.review_id), r);
  for (const r of invoices) tables.get("invoices")?.set(String(r.invoice_id), r);
  const audits: AuditEventInput[] = [];
  const puts: TableName[] = [];
  const src: DraftSources = {
    asOf: "2026-10-30",
    invoices: INVOICES,
    customers: CUSTOMERS,
    payments: PAYMENTS,
    extractions: [],
    matches: MATCHES,
    disputes: [],
    reviewItems: [],
  };
  const tx: Tx = {
    async get(table, id) {
      return tables.get(table)?.get(id);
    },
    async put(table, row) {
      puts.push(table);
      tables.get(table)?.set(String(row[keyOf[table]]), row);
    },
    async audit(e) {
      audits.push(e);
    },
    now: () => "2026-10-30T09:00:00.000Z",
    draftSources: async () => src,
  };
  return { tx, tables, audits, puts, review: (id: string) => tables.get("reviewItems")?.get(id) };
}

const REC = {
  review_id: "RV-E-009-1-reconcile",
  kind: "reconciliation",
  message_id: "E-009-1",
  invoice_id: "INV-034",
  status: "open",
  requires_role: "manager",
  ledger_outstanding_paise: 15_000_000,
};
const MATCH = {
  review_id: "RV-E-024-1-match",
  kind: "uncertain_match",
  message_id: "E-024-1",
  status: "open",
  requires_role: "analyst",
};

const flag = (payload: Row, actor: Command["actor"] = "analyst", id = REC.review_id): Command => ({
  type: "reconcile_flag",
  subject: { kind: "review", id },
  payload,
  actor,
});
const decide = (payload: Row, actor: Command["actor"] = "manager", id = REC.review_id): Command => ({
  type: "reconcile_decide",
  subject: { kind: "review", id },
  payload,
  actor,
});

describe("reconcile_flag (analyst workflow steps)", () => {
  it("request proof → awaiting_evidence, status unchanged, one audit with before/after", async () => {
    const m = memTx([REC]);
    const e = await run(flag({ step: "request_proof" }), m.tx);
    expect(m.review(REC.review_id)).toMatchObject({ status: "open", workflow_state: "awaiting_evidence" });
    expect(m.audits).toEqual([e]);
    expect(e).toMatchObject({ action: "reconcile_flag", actor_role: "analyst", invoice_id: "INV-034" });
    expect(e.before).toEqual({ workflow_state: null });
    expect(e.after).toMatchObject({ workflow_state: "awaiting_evidence" });
    expect(m.puts).toEqual(["reviewItems"]);
  });

  it("bank verification step", async () => {
    const m = memTx([REC]);
    await run(flag({ step: "bank_verification" }), m.tx);
    expect(m.review(REC.review_id)?.workflow_state).toBe("bank_verification");
  });

  it("escalate needs a reason and hands the case to a Manager (scenario 14)", async () => {
    const m = memTx([REC]);
    await expect(run(flag({ step: "escalate", note: "  " }), m.tx)).rejects.toBeInstanceOf(InvalidCommand);
    expect(m.audits).toHaveLength(0);
    const e = await run(flag({ step: "escalate", note: "Amount differs from ledger" }), m.tx);
    expect(m.review(REC.review_id)).toMatchObject({ workflow_state: "manager_review", workflow_note: "Amount differs from ledger" });
    expect(e.summary).toContain("Escalated");
  });

  it("assign takes a role only", async () => {
    const m = memTx([REC]);
    await expect(run(flag({ step: "assign", assignee: "bob" }), m.tx)).rejects.toBeInstanceOf(InvalidCommand);
    await run(flag({ step: "assign", assignee: "manager" }), m.tx);
    expect(m.review(REC.review_id)?.assignee).toBe("manager");
  });

  it("partial payment is a manager-review request with the remaining balance, never a ledger write (scenario 18)", async () => {
    const m = memTx([REC]);
    for (const bad of [0, -1, 1.5, 15_000_001, "500"]) {
      await expect(run(flag({ step: "request_partial", amount_paise: bad, note: "x" }), m.tx)).rejects.toBeInstanceOf(InvalidCommand);
    }
    const e = await run(flag({ step: "request_partial", amount_paise: 5_000_000, note: "Bank statement line 14" }), m.tx);
    expect(m.review(REC.review_id)).toMatchObject({
      status: "open",
      workflow_state: "manager_review",
      requested_partial_paise: 5_000_000,
    });
    expect(e.after).toMatchObject({ requested_partial_paise: 5_000_000, remaining_paise: 10_000_000 });
    expect(m.puts).toEqual(["reviewItems"]);
    expect(m.tables.get("invoices")?.get("INV-034")).toEqual(INVOICES.find((i) => i.invoice_id === "INV-034"));
  });

  it("link request: only a same-customer candidate invoice (scenarios 5, 8)", async () => {
    const m = memTx([MATCH]);
    // INV-024 belongs to C-007; the email is from C-006 → refused.
    await expect(run(flag({ step: "request_link", invoice_id: "INV-024" }, "analyst", MATCH.review_id), m.tx)).rejects.toThrow(
      /another customer/,
    );
    await expect(run(flag({ step: "request_link", invoice_id: "INV-NOPE" }, "analyst", MATCH.review_id), m.tx)).rejects.toBeInstanceOf(
      InvalidCommand,
    );
    await run(flag({ step: "request_link", invoice_id: "INV-042", note: "Likely transposed digits" }, "analyst", MATCH.review_id), m.tx);
    expect(m.review(MATCH.review_id)).toMatchObject({ status: "open", proposed_invoice_id: "INV-042", workflow_state: "manager_review" });
  });

  it("refuses unknown steps and closed items", async () => {
    const m = memTx([{ ...REC, status: "dismissed" }]);
    await expect(run(flag({ step: "request_proof" }), m.tx)).rejects.toThrow(/closed/);
    const m2 = memTx([REC]);
    await expect(run(flag({ step: "mark_paid" }), m2.tx)).rejects.toBeInstanceOf(InvalidCommand);
  });
});

describe("reconcile_decide (manager decisions)", () => {
  it("an Analyst cannot verify or reject, and nothing is written (scenario 16)", async () => {
    const m = memTx([REC]);
    await expect(
      run(decide({ decision: "verify", payment_id: "P-011", reference: "stmt", confirmed: true }, "analyst"), m.tx),
    ).rejects.toBeInstanceOf(PermissionDenied);
    expect(m.audits).toHaveLength(0);
    expect(m.puts).toHaveLength(0);
    expect(can("analyst", "reconcile_decide", { kind: "review", id: "x" })).toEqual({
      allowed: false,
      reason: "Only a Manager can verify or reject a payment claim.",
    });
  });

  it("verify needs evidence, explicit confirmation and a same-invoice ledger entry (scenario 13)", async () => {
    const m = memTx([REC]);
    await expect(run(decide({ decision: "verify", payment_id: "P-011", reference: " ", confirmed: true }), m.tx)).rejects.toThrow(/evidence/);
    await expect(run(decide({ decision: "verify", payment_id: "P-011", reference: "stmt" }), m.tx)).rejects.toThrow(/confirm/);
    // P-010 is the same customer and amount but another invoice; P-001 is another customer.
    await expect(run(decide({ decision: "verify", payment_id: "P-010", reference: "stmt", confirmed: true }), m.tx)).rejects.toThrow(
      /this invoice/,
    );
    await expect(run(decide({ decision: "verify", payment_id: "P-404", reference: "stmt", confirmed: true }), m.tx)).rejects.toThrow(
      /ledger/,
    );
    expect(m.audits).toHaveLength(0);
  });

  it("manager verify links the existing ledger entry and closes the item (scenarios 10, 15)", async () => {
    const m = memTx([{ ...REC, workflow_state: "manager_review" }]);
    const e = await run(decide({ decision: "verify", payment_id: "P-011", reference: "HDFC stmt 20-Oct line 14", confirmed: true }), m.tx);
    expect(m.review(REC.review_id)).toMatchObject({
      status: "actioned",
      workflow_state: "verified",
      verified_payment_id: "P-011",
      verified_reference: "HDFC stmt 20-Oct line 14",
    });
    expect(e).toMatchObject({ action: "reconcile_decide", actor_role: "manager", evidence_ids: ["P-011"] });
    expect(e.before).toMatchObject({ status: "open", workflow_state: "manager_review" });
    expect(m.puts).toEqual(["reviewItems"]);
    // Already verified: a second decision is refused.
    await expect(run(decide({ decision: "verify", payment_id: "P-011", reference: "x", confirmed: true }), m.tx)).rejects.toThrow(/closed/);
  });

  it("reject needs a reason and dismisses the item", async () => {
    const m = memTx([REC]);
    await expect(run(decide({ decision: "reject", reason: "" }), m.tx)).rejects.toBeInstanceOf(InvalidCommand);
    await run(decide({ decision: "reject", reason: "No such payment on the statement" }), m.tx);
    expect(m.review(REC.review_id)).toMatchObject({ status: "dismissed", workflow_state: "rejected" });
  });

  it("approve link confirms the proposed same-customer invoice", async () => {
    const m = memTx([{ ...MATCH, proposed_invoice_id: "INV-042", workflow_state: "manager_review" }]);
    await run(decide({ decision: "approve_link", confirmed: true }, "manager", MATCH.review_id), m.tx);
    expect(m.review(MATCH.review_id)).toMatchObject({ status: "actioned", workflow_state: "verified", linked_invoice_id: "INV-042" });
    const m2 = memTx([MATCH]);
    await expect(run(decide({ decision: "approve_link", confirmed: true }, "manager", MATCH.review_id), m2.tx)).rejects.toThrow(/proposed/);
  });
});
