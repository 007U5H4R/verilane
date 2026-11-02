/**
 * TASK-44 tracer bullet · the demo tour's step 7 depends on its autopilot
 * invoice passing all nine checks under the ₹50,000 default cap on the REAL
 * seed. If the seed drifts, this fails before the tour silently stalls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { VerilaneDb } from "@/store/db";
import { ensureSeeded, type Fetcher } from "@/store/loader";
import { execute } from "@/store/tx";
import { TOUR_INVOICES } from "./invoices";

const fetcher = (async (url: string | URL | Request) => {
  try {
    return new Response(readFileSync(join(process.cwd(), "public", String(url)), "utf8"), { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as Fetcher;

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-tour-seed-${Math.random()}`);
  await ensureSeeded(db, fetcher);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

it("INV-B passes all nine checks, is under the default cap, and Copilot sends it", async () => {
  const invoiceId = TOUR_INVOICES.b;
  await db.meta.put({ key: "role", value: "analyst" });
  await execute(db, { type: "generate_draft", subject: { kind: "invoice", id: invoiceId } });
  const generated = await db.drafts.where("invoice_id").equals(invoiceId).first();
  expect(generated).toBeDefined();
  await execute(db, { type: "submit_draft", subject: { kind: "draft", id: generated!.draft_id } });

  const submitted = await db.drafts.get(generated!.draft_id);
  expect(submitted?.failed_checks ?? []).toEqual([]);
  expect(submitted?.status).toBe("validated");
  expect(submitted!.amount_paise).toBeLessThanOrEqual(5_000_000);

  await db.meta.put({ key: "role", value: "manager" });
  await execute(db, {
    type: "set_autopilot",
    subject: { kind: "system", id: "autopilot" },
    payload: { enabled: true, max_amount_paise: 5_000_000 },
  });
  await execute(db, { type: "autopilot_send", subject: { kind: "draft", id: generated!.draft_id } });

  expect(await db.drafts.get(generated!.draft_id)).toMatchObject({ status: "sent_simulated", sent_by: "copilot" });
});
