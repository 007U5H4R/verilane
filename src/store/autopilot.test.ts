/**
 * TASK-41 · Copilot autopilot through the real command path (fake-indexeddb):
 * Manager-only policy, one audit event per decision, Copilot labelled as AI,
 * ineligible drafts held (not retried), and the policy enforced server-side.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AUTOPILOT_KEY, COPILOT_LABEL } from "@/domain/autopilot";
import { InvalidCommand, PermissionDenied } from "@/domain/commands";
import { actorOf, describe as describeEvent } from "@/domain/audit/classify";
import type { Customer, Invoice } from "@/domain/schema";
import { VerilaneDb } from "./db";
import { execute } from "./tx";

let db: VerilaneDb;

const setRole = (value: "analyst" | "manager") => db.meta.put({ key: "role", value });
const send = (id: string) => execute(db, { type: "autopilot_send", subject: { kind: "draft", id } });
const setPolicy = (enabled: boolean, max_amount_paise = 5_000_000) =>
  execute(db, { type: "set_autopilot", subject: { kind: "system", id: "autopilot" }, payload: { enabled, max_amount_paise } });

beforeEach(async () => {
  db = new VerilaneDb(`verilane-autopilot-${Math.random()}`);
  await db.invoices.add({
    row_id: 2,
    invoice_id: "INV-2",
    invoice_number: "1002",
    customer_id: "C-2",
    invoice_date: "2026-10-01",
    due_date: "2026-11-15",
    amount_paise: 1_000_000,
    currency: "INR",
    status_raw: "Open",
    status: "open",
    billing_period: null,
    po_number: null,
  } as unknown as Invoice);
  await db.customers.add({
    customer_id: "C-2",
    name: "Acme Co",
    contact_emails: [],
    payment_terms_days: 30,
    segment: "sme",
  } as unknown as Customer);
  await db.drafts.add({
    draft_id: "DR-A",
    invoice_id: "INV-2",
    status: "validated",
    amount_paise: 1_000_000,
    facts: [
      { claimId: "c1", kind: "invoice_number", value: "1002", evidenceId: "e1" },
      { claimId: "c2", kind: "customer_name", value: "Acme Co", evidenceId: "e2" },
      { claimId: "c3", kind: "amount", value: "₹10,000.00", evidenceId: "e3" },
    ],
    footnotes: [],
    body: "",
  });
});

describe("set_autopilot", () => {
  it("is Manager-only and writes nothing when an Analyst tries", async () => {
    await setRole("analyst");
    await expect(setPolicy(true)).rejects.toBeInstanceOf(PermissionDenied);
    expect(await db.meta.get(AUTOPILOT_KEY)).toBeUndefined();
  });

  it("persists the policy with one audit event; rejects caps above Analyst authority", async () => {
    await setRole("manager");
    await setPolicy(true, 2_000_000);
    expect((await db.meta.get(AUTOPILOT_KEY))?.value).toEqual({ enabled: true, max_amount_paise: 2_000_000 });
    const audit = await db.audit.where("action").equals("set_autopilot").toArray();
    expect(audit).toHaveLength(1);
    await expect(setPolicy(true, 50_000_001)).rejects.toBeInstanceOf(InvalidCommand);
    await expect(setPolicy(true, 2_000_000)).rejects.toThrow(/already/);
  });
});

describe("autopilot_send", () => {
  it("refuses while the policy is off", async () => {
    await expect(send("DR-A")).rejects.toThrow(/off/);
    expect((await db.drafts.get("DR-A"))?.status).toBe("validated");
    expect(await db.audit.count()).toBe(0);
  });

  it("sends a clean draft within the cap, attributed to Copilot, never to a person", async () => {
    await setRole("manager");
    await setPolicy(true);
    await setRole("analyst");
    await send("DR-A");
    const draft = await db.drafts.get("DR-A");
    expect(draft?.status).toBe("sent_simulated");
    expect(draft?.sent_by).toBe("copilot");
    const event = (await db.audit.where("action").equals("autopilot_send").toArray())[0]!;
    expect(event.actor_label).toBe(COPILOT_LABEL);
    expect(event.summary).toMatch(/simulated send/);
    expect(actorOf(event)).toMatchObject({ type: "copilot", name: "Copilot", key: "copilot" });
    expect(describeEvent(event).label).toBe("Auto-sent by Copilot");
    // Sent is terminal: a second run is refused, nothing is sent twice.
    await expect(send("DR-A")).rejects.toThrow();
  });

  it("holds a draft over the cap for a person, records why, and leaves it awaiting approval", async () => {
    await setRole("manager");
    await setPolicy(true, 500_000);
    await send("DR-A");
    const draft = await db.drafts.get("DR-A");
    expect(draft?.status).toBe("validated");
    expect(draft?.autopilot_hold).toMatch(/Over the ₹5,000.00 autopilot cap/);
    const event = (await db.audit.where("action").equals("autopilot_held").toArray())[0]!;
    expect(event.actor_label).toBe(COPILOT_LABEL);
    expect(event.summary).toMatch(/held reminder DR-A/);
    // A person can still approve it.
    await execute(db, { type: "approve_draft", subject: { kind: "draft", id: "DR-A" } });
    expect((await db.drafts.get("DR-A"))?.status).toBe("sent_simulated");
  });
});
