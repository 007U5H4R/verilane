/**
 * TKT-75.05 (TASK-79.5), R4 on the real seed (fake-indexeddb):
 * TC-75.29 `approve_write_off` — one rw transaction: can() (Manager only) →
 *   one `CreditNote` per linked short-payment instance → each instance and
 *   the subject itself actioned → one audit event. An Analyst is refused
 *   (`PermissionDenied`), nothing executes, and the attempt is audited.
 * TC-75.30 Execute never auto-writes a credit note for a short-payment kind
 *   (companion unit test lives in src/domain/commands.test.ts / policy.test.ts).
 *
 * C-001 (INV-001/002/003) is patterned: RV-SPP-C-001 links RV-SP-INV-001,
 * RV-SP-INV-002, RV-SP-INV-003, each short by ₹1,000 (₹3,000 total).
 * C-002 (INV-004/005) has only two short payments, so no pattern — each of
 * RV-SP-INV-004 / RV-SP-INV-005 is a standalone instance, short by ₹500.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidCommand, PermissionDenied } from "@/domain/commands";
import type { Role } from "@/domain/permissions";
import { VerilaneDb } from "./db";
import { ensureSeeded, type Fetcher } from "./loader";
import { execute, type CommandInput } from "./tx";

const PATTERN = "RV-SPP-C-001";
const I1 = "RV-SP-INV-001";
const I2 = "RV-SP-INV-002";
const I3 = "RV-SP-INV-003";
const STANDALONE = "RV-SP-INV-004";

function seedFetcher(): Fetcher {
  const dir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = Object.fromEntries(names.map((n) => [`/seed/${n}`, readFileSync(join(dir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files[String(url)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

const writeOff = (id: string): CommandInput => ({ type: "approve_write_off", subject: { kind: "review", id } });

let db: VerilaneDb;

const asRole = (role: Role) => db.meta.put({ key: "role", value: role });

/** Every table (m4): the write-off's scope is WHOLE_DB, so any of them could take a partial write. */
async function snapshot() {
  const entries = await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const));
  return Object.fromEntries(entries) as Record<string, unknown[]>;
}

beforeEach(async () => {
  db = new VerilaneDb(`verilane-writeoff-${Math.random()}`);
  await ensureSeeded(db, seedFetcher());
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("approve_write_off — TC-75.29 (pattern)", () => {
  it("a Manager writes off a pattern: one CreditNote per linked instance, every instance and the pattern actioned, one audit event", async () => {
    await asRole("manager");
    const event = await execute(db, writeOff(PATTERN));

    const notes = await db.creditNotes.toArray();
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.invoice_id).sort()).toEqual(["INV-001", "INV-002", "INV-003"]);
    for (const n of notes) {
      expect(n).toMatchObject({ customer_id: "C-001", amount_paise: 100_000, approved_by: "manager" });
      expect(typeof n.created_at).toBe("string");
    }
    // The stated reason travels; the one instance with none gets a fallback.
    const byInvoice = Object.fromEntries(notes.map((n) => [n.invoice_id, n]));
    expect(byInvoice["INV-001"]?.reason).toBe("Pricing difference against the agreed rate card");
    expect(byInvoice["INV-002"]?.reason).toBe("No reason stated");
    expect(byInvoice["INV-003"]?.reason).toBe("Damaged goods deduction");

    expect((await db.exceptions.get(I1))?.status).toBe("actioned");
    expect((await db.exceptions.get(I2))?.status).toBe("actioned");
    expect((await db.exceptions.get(I3))?.status).toBe("actioned");
    expect((await db.exceptions.get(PATTERN))?.status).toBe("actioned");

    const audit = await db.audit.toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "approve_write_off",
      subject: `review:${PATTERN}`,
      actor_role: "manager",
      before: { status: "open" },
      after: { status: "actioned", amount_paise: 300_000 },
    });
    expect(event.summary).toBe("Approved write-off of ₹3,000.00 (3 credit notes: CN-INV-001, CN-INV-002, CN-INV-003)");
  });

  it("a second write-off of the same pattern is refused once actioned, nothing written", async () => {
    await asRole("manager");
    await execute(db, writeOff(PATTERN));
    const before = await snapshot();
    await expect(execute(db, writeOff(PATTERN))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });
});

describe("approve_write_off — TC-75.29 (standalone instance)", () => {
  it("a Manager writes off a standalone short payment (no pattern) with one CreditNote", async () => {
    await asRole("manager");
    const event = await execute(db, writeOff(STANDALONE));

    const notes = await db.creditNotes.toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      credit_note_id: "CN-INV-004",
      invoice_id: "INV-004",
      customer_id: "C-002",
      amount_paise: 50_000,
      reason: "Late delivery penalty",
      approved_by: "manager",
    });
    expect((await db.exceptions.get(STANDALONE))?.status).toBe("actioned");
    expect(event.summary).toBe("Approved write-off of ₹500.00 (1 credit note: CN-INV-004)");
  });

  it("the audit event records the instance's real end status: open → actioned (regression)", async () => {
    await asRole("manager");
    await execute(db, writeOff(STANDALONE));

    const audit = await db.audit.toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "approve_write_off",
      subject: `review:${STANDALONE}`,
      before: { status: "open" },
      after: { status: "actioned", credit_note_ids: ["CN-INV-004"], amount_paise: 50_000 },
    });
    // The audit's `after` agrees with the persisted row.
    expect((await db.exceptions.get(STANDALONE))?.status).toBe("actioned");
  });

  it("a second write-off attempt on an already-written-off instance is refused, nothing written", async () => {
    await asRole("manager");
    await execute(db, writeOff(STANDALONE));
    const before = await snapshot();
    await expect(execute(db, writeOff(STANDALONE))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a non-short-payment exception, nothing written", async () => {
    const other = await db.exceptions
      .filter((x) => x.kind !== "short_payment" && x.kind !== "short_payment_pattern" && x.status === "open")
      .first();
    await asRole("manager");
    const before = await snapshot();
    await expect(execute(db, writeOff(other!.review_id))).rejects.toBeInstanceOf(InvalidCommand);
    expect(await snapshot()).toEqual(before);
  });
});

describe("approve_write_off failure injection — TC-75.29", () => {
  it("a throw after every write, before commit, leaves no partial state", async () => {
    await asRole("manager");
    const before = await snapshot();
    const boom = new Error("injected");
    const err = await execute(db, writeOff(PATTERN), {
      beforeCommit: async () => {
        expect(await db.creditNotes.count()).toBe(3);
        expect((await db.exceptions.get(PATTERN))?.status).toBe("actioned");
        expect((await db.exceptions.get(I1))?.status).toBe("actioned");
        expect(await db.audit.count()).toBe(1);
        throw boom;
      },
    }).catch((e: unknown) => e);
    expect(err).toBe(boom);
    expect(await snapshot()).toEqual(before);
  });
});

describe("approve_write_off refusal — TC-75.29 (Analyst blocked)", () => {
  it("an Analyst is refused, nothing executes, and the attempt is audited once", async () => {
    const before = await snapshot();

    const err = await execute(db, writeOff(PATTERN)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionDenied);
    expect((err as PermissionDenied).reason).toBe("Only a Manager can approve a write-off.");

    const after = await snapshot();
    // Nothing executed: no credit note, exceptions untouched.
    expect(after.creditNotes).toEqual([]);
    expect(after.exceptions).toEqual(before.exceptions);
    // Exactly one new audit event: the refusal.
    expect(after.audit).toHaveLength((before.audit ?? []).length + 1);
    expect(after.audit?.at(-1)).toMatchObject({
      action: "permission_denied",
      actor_role: "analyst",
      subject: `review:${PATTERN}`,
      after: { refused_action: "approve_write_off", reason: "Only a Manager can approve a write-off." },
    });
  });

  it("a failing refusal audit still surfaces PermissionDenied, logs the failure, and persists nothing (M1)", async () => {
    const before = await snapshot();
    const quota = new Error("QuotaExceededError (injected)");
    const add = vi.spyOn(db.audit, "add").mockRejectedValue(quota);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const err = await execute(db, writeOff(PATTERN)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PermissionDenied);
      expect((err as Error).cause).toBe(quota);
      expect(add).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("permission_denied"), quota);
    } finally {
      add.mockRestore();
      log.mockRestore();
    }
    expect(await snapshot()).toEqual(before);
  });
});
