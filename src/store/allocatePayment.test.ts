/**
 * TKT-75.02 tracer on the real seed (fake-indexeddb):
 * TC-75.08 `allocate_payment` — one rw transaction: can() → payment.invoice_id
 *   set → invoice balance/status re-derived → exception actioned → one audit event.
 * TC-75.09 failure injection — a throw before commit leaves no partial state.
 * TC-75.10 reminder exclusion — related unapplied cash holds the invoice at G5 until allocated.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidCommand, PermissionDenied } from "@/domain/commands";
import { outstandingOf } from "@/domain/priority";
import { VerilaneDb } from "./db";
import { ensureSeeded, recompute, type Fetcher } from "./loader";
import { execute, type CommandInput } from "./tx";

const EXC = "RV-PAY-P-012";

function seedFetcher(): Fetcher {
  const dir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = Object.fromEntries(names.map((n) => [`/seed/${n}`, readFileSync(join(dir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

const allocate = (invoice_id: unknown, id = EXC): CommandInput => ({
  type: "allocate_payment",
  subject: { kind: "review", id },
  payload: { invoice_id },
});

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-alloc-${Math.random()}`);
  await ensureSeeded(db, seedFetcher());
});

afterEach(async () => {
  db.close();
  await db.delete();
});

async function snapshot() {
  return {
    payments: await db.payments.toArray(),
    exceptions: await db.exceptions.toArray(),
    priorities: await db.priorities.toArray(),
    audit: await db.audit.toArray(),
  };
}

describe("allocate_payment — TC-75.08", () => {
  it("allocates P-012 to INV-F in one transaction with exactly one audit event", async () => {
    const invF = (await db.invoices.filter((i) => i.invoice_id === "INV-F").first())!;
    expect(outstandingOf(invF, { payments: await db.payments.toArray() })).toBe(2_500_000);
    expect(await db.audit.count()).toBe(0);

    const event = await execute(db, allocate("INV-F"));

    // Payment applied.
    expect((await db.payments.get("P-012"))?.invoice_id).toBe("INV-F");
    // Invoice balance and status are derived: outstanding 0, priority closed (G1).
    expect(outstandingOf(invF, { payments: await db.payments.toArray() })).toBe(0);
    expect(await db.priorities.get("INV-F")).toMatchObject({ gate: "G1", band: "closed" });
    // Exception actioned, kept as history (recompute does not re-raise or delete it).
    expect(await db.exceptions.get(EXC)).toMatchObject({ status: "actioned", invoice_id: "INV-F" });
    // P-012 plus FS14–FS17's P-013..P-016 (TKT-75.08).
    expect(await db.exceptions.where("kind").equals("unallocated_payment").count()).toBe(5);
    // Exactly one audit event.
    const audit = await db.audit.toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "allocate_payment",
      subject: `review:${EXC}`,
      invoice_id: "INV-F",
      actor_role: "analyst",
      before: { status: "open", invoice_id: null },
      after: { status: "actioned", invoice_id: "INV-F" },
    });
    expect(event.summary).toBe("Allocated payment P-012 (₹25,000.00) to INV-F");
    expect(event.evidence_ids).toEqual(["P-012:payments.csv:amount_paise", "P-012:payments.csv:invoice_id"]);
  });

  it("refuses an invoice that is not a candidate, writing nothing", async () => {
    const before = await snapshot();
    await expect(execute(db, allocate("INV-A"))).rejects.toBeInstanceOf(InvalidCommand);
    await expect(execute(db, allocate(undefined))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a second allocation once actioned", async () => {
    await execute(db, allocate("INV-F"));
    await expect(execute(db, allocate("INV-F"))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await db.audit.count()).toBe(1);
  });

  it("refuses a non-payment exception", async () => {
    const email = await db.exceptions
      .filter((x) => x.kind !== "unallocated_payment" && x.status === "open" && x.requires_role === "analyst")
      .first();
    expect(email).toBeDefined();
    await expect(execute(db, allocate("INV-F", email!.review_id))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await db.audit.count()).toBe(0);
  });

  it("can() is checked against the stored row: an Analyst cannot allocate a Manager-escalated item", async () => {
    await db.exceptions.update(EXC, { requires_role: "manager" });
    const before = await snapshot();
    await expect(execute(db, allocate("INV-F"))).rejects.toBeInstanceOf(PermissionDenied);
    expect(await snapshot()).toEqual(before);
  });
});

describe("allocate_payment failure injection — TC-75.09", () => {
  it("a throw after every write, before commit, leaves no partial state", async () => {
    const before = await snapshot();
    const boom = new Error("injected");
    const err = await execute(db, allocate("INV-F"), {
      beforeCommit: async () => {
        // Every step is visible inside the transaction…
        expect((await db.payments.get("P-012"))?.invoice_id).toBe("INV-F");
        expect((await db.exceptions.get(EXC))?.status).toBe("actioned");
        expect((await db.priorities.get("INV-F"))?.gate).toBe("G1");
        expect(await db.audit.count()).toBe(1);
        throw boom;
      },
    }).catch((e: unknown) => e);
    expect(err).toBe(boom);
    // …and none of it survives the rollback.
    expect(await snapshot()).toEqual(before);
  });
});

describe("reminder exclusion — TC-75.10", () => {
  it("on the seed, INV-F is never sent a reminder while P-012 is unapplied", async () => {
    // INV-F is already gated earlier (G3); the hold is recorded, never a reminder.
    const p = (await db.priorities.get("INV-F"))!;
    expect(["G1", "G2", "G3", "G4", "G5"]).toContain(p.gate);
  });

  it("an otherwise-remindable invoice with related unapplied cash is held at G5 until allocation", async () => {
    // Fixture: a new bank line whose amount matches exactly one invoice that
    // would otherwise be scored for a reminder (no gate before G5).
    const payments = await db.payments.toArray();
    const invoices = await db.invoices.toArray();
    const priorities = new Map((await db.priorities.toArray()).map((x) => [x.invoice_id, x]));
    const outs = new Map(invoices.map((i) => [i.invoice_id, outstandingOf(i, { payments })]));
    const target = invoices.find((i) => {
      const gate = priorities.get(i.invoice_id)?.gate;
      const out = outs.get(i.invoice_id)!;
      const unique = [...outs.values()].filter((o) => o === out).length === 1;
      return out > 0 && unique && !["G1", "G2", "G3", "G4", "G5"].includes(gate ?? "");
    });
    expect(target, "seed has a remindable invoice with a unique outstanding").toBeDefined();
    const id = target!.invoice_id;

    await db.payments.put({ payment_id: "P-T10", invoice_id: null, paid_on: "2026-10-29", amount_paise: outs.get(id)! });
    await recompute(db);
    expect(await db.exceptions.get("RV-PAY-P-T10")).toMatchObject({ status: "open", candidate_invoice_ids: [id] });
    expect(await db.priorities.get(id)).toMatchObject({
      gate: "G5",
      band: "hold_reconcile",
      recommended_action: "Reconcile payment",
    });
    expect((await db.priorities.get(id))!.reason).toContain("[P-T10:payments.csv:invoice_id]");

    await execute(db, allocate(id, "RV-PAY-P-T10"));
    expect(await db.priorities.get(id)).toMatchObject({ gate: "G1", band: "closed" });
  });
});
