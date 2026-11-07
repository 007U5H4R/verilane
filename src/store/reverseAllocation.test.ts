/**
 * TKT-75.06 (TASK-79.6) on the real seed (fake-indexeddb):
 * TC-75.32 `reverse_allocation` — one rw transaction: can() (Manager only) →
 *   payment.invoice_id back to null → invoice balance/status re-derived →
 *   exception actioned → open (reason `reversed`, sticky `reversed` marker) →
 *   one audit event that references the original allocation's event. A throw
 *   before commit leaves no partial state.
 * TC-75.33 an Analyst is refused (`PermissionDenied`), nothing executes, and
 *   the attempt is audited as one `permission_denied` event (FS21).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidCommand, PermissionDenied } from "@/domain/commands";
import { outstandingOf } from "@/domain/priority";
import { IllegalTransition } from "@/domain/transitions";
import type { Role } from "@/domain/permissions";
import { VerilaneDb } from "./db";
import { ensureSeeded, type Fetcher } from "./loader";
import { execute, type CommandInput } from "./tx";

const EXC = "RV-PAY-P-012";

/** The real seed; `extraInvoiceRows` are appended to invoices.csv (m3 fixture). */
function seedFetcher(extraInvoiceRows: string[] = []): Fetcher {
  const dir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = Object.fromEntries(names.map((n) => [`/seed/${n}`, readFileSync(join(dir, n), "utf-8")]));
  if (extraInvoiceRows.length > 0) {
    files["/seed/invoices.csv"] = `${(files["/seed/invoices.csv"] ?? "").trimEnd()}\n${extraInvoiceRows.join("\n")}\n`;
  }
  return (async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

const allocate: CommandInput = {
  type: "allocate_payment",
  subject: { kind: "review", id: EXC },
  payload: { invoice_id: "INV-F" },
};
const reverse = (id = EXC): CommandInput => ({ type: "reverse_allocation", subject: { kind: "review", id } });

let db: VerilaneDb;

const asRole = (role: Role) => db.meta.put({ key: "role", value: role });

/** Every table (m4): the reversal's scope is WHOLE_DB, so any of them could take a partial write. */
async function snapshot() {
  const entries = await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const));
  return Object.fromEntries(entries) as Record<string, unknown[]>;
}

async function outstandingF() {
  const invF = (await db.invoices.filter((i) => i.invoice_id === "INV-F").first())!;
  return outstandingOf(invF, { payments: await db.payments.toArray() });
}

beforeEach(async () => {
  db = new VerilaneDb(`verilane-reverse-${Math.random()}`);
  await ensureSeeded(db, seedFetcher());
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("reverse_allocation — TC-75.32", () => {
  it("a Manager reverses P-012 → INV-F in one transaction: balance restored, item reopened, one audit event", async () => {
    const priorityBefore = await db.priorities.get("INV-F");
    const exceptionBefore = await db.exceptions.get(EXC);
    await execute(db, allocate);
    const allocation = (await db.audit.where("action").equals("allocate_payment").first())!;
    expect(await outstandingF()).toBe(0);

    await asRole("manager");
    const event = await execute(db, reverse());

    // Ledger: the payment is unapplied cash again.
    expect((await db.payments.get("P-012"))?.invoice_id).toBeNull();
    // Invoice balance and status are derived: back to the pre-allocation values.
    expect(await outstandingF()).toBe(2_500_000);
    expect(await db.priorities.get("INV-F")).toEqual(priorityBefore);
    // Exception reopened with the reason and the sticky marker the NSM reads.
    const reopened = await db.exceptions.get(EXC);
    expect(reopened).toMatchObject({
      status: "open",
      reopen_reason: "reversed",
      reversed: true,
      candidate_invoice_ids: ["INV-F"],
      invoice_id: exceptionBefore?.invoice_id,
    });
    // Exactly one new audit event, referencing the original allocation.
    const audit = await db.audit.toArray();
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({
      action: "reverse_allocation",
      subject: `review:${EXC}`,
      invoice_id: "INV-F",
      actor_role: "manager",
      before: { status: "actioned", invoice_id: "INV-F", payment_id: "P-012" },
      after: { status: "open", invoice_id: null, reopen_reason: "reversed", reverses_event_id: allocation.event_id },
    });
    expect(event.summary).toBe(
      `Reversed allocation of payment P-012 (₹25,000.00) from INV-F (audit event #${allocation.event_id})`,
    );
  });

  it("the reopened item can be allocated again and keeps its reversed marker", async () => {
    await execute(db, allocate);
    await asRole("manager");
    await execute(db, reverse());
    await execute(db, allocate);
    expect(await db.exceptions.get(EXC)).toMatchObject({ status: "actioned", reversed: true, invoice_id: "INV-F" });
    expect(await outstandingF()).toBe(0);
  });

  it("an open (never allocated) item cannot be reversed: IllegalTransition, nothing written", async () => {
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, reverse())).rejects.toBeInstanceOf(IllegalTransition);
    expect(await snapshot()).toEqual(before);
  });

  it("a second reversal is refused once reopened, nothing written", async () => {
    await execute(db, allocate);
    await asRole("manager");
    await execute(db, reverse());
    const before = await snapshot();
    await expect(execute(db, reverse())).rejects.toBeInstanceOf(IllegalTransition);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a non-payment exception, nothing written", async () => {
    const email = await db.exceptions.filter((x) => x.kind !== "unallocated_payment" && x.status === "open").first();
    await db.exceptions.update(email!.review_id, { status: "actioned" });
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, reverse(email!.review_id))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses an actioned item whose payment is not applied (actioned without allocation), nothing written", async () => {
    await db.exceptions.update(EXC, { status: "actioned" });
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, reverse())).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });
});

describe("reverse_allocation preconditions and references — TC-75.32 (m3, m5)", () => {
  it("refuses when the payment is applied to a different invoice than the item's, nothing written", async () => {
    await execute(db, allocate);
    await db.payments.update("P-012", { invoice_id: "INV-049" });
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, reverse())).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses when the allocate_payment audit event is missing, nothing written", async () => {
    await execute(db, allocate);
    await db.audit.clear();
    await asRole("manager");
    const before = await snapshot();
    const err = await execute(db, reverse()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidCommand);
    expect((err as Error).message).toMatch(/No allocation of payment P-012/);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses when the latest allocation event names another invoice, nothing written", async () => {
    await execute(db, allocate);
    const allocation = (await db.audit.where("action").equals("allocate_payment").first())!;
    await db.audit.update(allocation.event_id!, { after: { status: "actioned", invoice_id: "INV-049" } });
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, reverse())).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });

  it("allocate → reverse → allocate → reverse: the second reversal names the second allocation", async () => {
    await asRole("manager");
    await execute(db, allocate);
    const first = await execute(db, reverse());
    await execute(db, allocate);
    const second = await execute(db, reverse());
    const allocations = await db.audit.where("action").equals("allocate_payment").toArray();
    expect(allocations).toHaveLength(2);
    const [firstAllocation, secondAllocation] = allocations;
    expect(first.after).toMatchObject({ reverses_event_id: firstAllocation?.event_id });
    expect(second.after).toMatchObject({ reverses_event_id: secondAllocation?.event_id });
    expect(secondAllocation?.event_id).not.toBe(firstAllocation?.event_id);
  });

  it("a multi-candidate item reopens with invoice_id cleared and every candidate restored", async () => {
    // A second open invoice with INV-F's outstanding makes P-012 ambiguous.
    db.close();
    await db.delete();
    db = new VerilaneDb(`verilane-reverse-multi-${Math.random()}`);
    await ensureSeeded(db, seedFetcher(["51,INV-F2,,C-005,2026-09-25,2026-10-25,2500000,INR,open,,2026-09,PO-4551"]));
    const seeded = await db.exceptions.get(EXC);
    expect(seeded?.candidate_invoice_ids).toEqual(["INV-F", "INV-F2"]);
    expect(seeded?.invoice_id).toBeUndefined();

    await execute(db, allocate);
    expect((await db.exceptions.get(EXC))?.invoice_id).toBe("INV-F");
    await asRole("manager");
    await execute(db, reverse());

    const reopened = await db.exceptions.get(EXC);
    expect(reopened).toMatchObject({ status: "open", reversed: true, candidate_invoice_ids: ["INV-F", "INV-F2"] });
    expect(reopened).not.toHaveProperty("invoice_id");
  });
});

describe("reverse_allocation failure injection — TC-75.32", () => {
  it("a throw after every write, before commit, leaves no partial state", async () => {
    await execute(db, allocate);
    await asRole("manager");
    const before = await snapshot();
    const boom = new Error("injected");
    const err = await execute(db, reverse(), {
      beforeCommit: async () => {
        expect((await db.payments.get("P-012"))?.invoice_id).toBeNull();
        expect((await db.exceptions.get(EXC))?.status).toBe("open");
        expect((await db.priorities.get("INV-F"))?.gate).not.toBe("G1");
        expect(await db.audit.count()).toBe(2);
        throw boom;
      },
    }).catch((e: unknown) => e);
    expect(err).toBe(boom);
    expect(await snapshot()).toEqual(before);
  });
});

describe("reverse_allocation refusal — TC-75.33", () => {
  it("an Analyst is refused, nothing executes, and the attempt is audited once", async () => {
    await execute(db, allocate);
    const before = await snapshot();

    const err = await execute(db, reverse()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionDenied);
    expect((err as PermissionDenied).reason).toBe("Only a Manager can reverse an allocation.");

    const after = await snapshot();
    // Nothing executed: ledger, exception and priorities untouched.
    expect(after.payments).toEqual(before.payments);
    expect(after.exceptions).toEqual(before.exceptions);
    expect(after.priorities).toEqual(before.priorities);
    // Exactly one new audit event: the refusal.
    expect(after.audit).toHaveLength((before.audit ?? []).length + 1);
    expect(after.audit?.at(-1)).toMatchObject({
      action: "permission_denied",
      actor_role: "analyst",
      subject: `review:${EXC}`,
      invoice_id: "INV-F",
      summary: "Refused reverse allocation on RV-PAY-P-012: Only a Manager can reverse an allocation.",
      after: { refused_action: "reverse_allocation", reason: "Only a Manager can reverse an allocation." },
    });
  });

  it("a failing refusal audit still surfaces PermissionDenied, logs the failure, and persists nothing (M1)", async () => {
    await execute(db, allocate);
    const before = await snapshot();
    const quota = new Error("QuotaExceededError (injected)");
    const add = vi.spyOn(db.audit, "add").mockRejectedValue(quota);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = await execute(db, reverse()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PermissionDenied);
      expect((err as PermissionDenied).reason).toBe("Only a Manager can reverse an allocation.");
      expect((err as Error).cause).toBe(quota);
      expect(add).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("permission_denied"), quota);
    } finally {
      add.mockRestore();
      log.mockRestore();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("the refusal records the role that was denied, not a role switched in between (m6)", async () => {
    await execute(db, allocate);
    // The role flips to Manager after the denial, before the refusal is written.
    const realTransaction = db.transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
    let calls = 0;
    const spy = vi.spyOn(db, "transaction").mockImplementation(((...args: unknown[]) => {
      calls += 1;
      if (calls === 2) {
        return db.meta.put({ key: "role", value: "manager" }).then(() => realTransaction(...args));
      }
      return realTransaction(...args);
    }) as typeof db.transaction);
    try {
      await expect(execute(db, reverse())).rejects.toBeInstanceOf(PermissionDenied);
    } finally {
      spy.mockRestore();
    }
    expect((await db.audit.toArray()).at(-1)).toMatchObject({ action: "permission_denied", actor_role: "analyst" });
  });

  it("other denials keep v1 behaviour: refused with nothing audited", async () => {
    await db.exceptions.update(EXC, { requires_role: "manager" });
    await expect(execute(db, allocate)).rejects.toBeInstanceOf(PermissionDenied);
    expect(await db.audit.count()).toBe(0);
  });
});
