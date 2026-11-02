import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { VerilaneDb } from "@/store/db";
import { ensureSeeded, type Fetcher } from "@/store/loader";
import { execute } from "@/store/tx";
import { AUTOPILOT_KEY, parsePolicy } from "@/domain/autopilot";
import { TOUR_INVOICES } from "@/domain/tour/invoices";
import { confirmStartTour } from "./startTour";
import { exitTour, getTour } from "./tourStore";

const fetcher = (async (url: string | URL | Request) => {
  try {
    return new Response(readFileSync(join(process.cwd(), "public", String(url)), "utf8"), { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as Fetcher;

let db: VerilaneDb;

beforeEach(async () => {
  db = new VerilaneDb(`verilane-tour-start-${Math.random()}`);
  await ensureSeeded(db, fetcher);
  exitTour();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

it("resets a used demo to a known start: Analyst, autopilot off at ₹50,000, no drafts, tour at step 1", async () => {
  // Leave the demo the way a previous run would: Manager, autopilot on, INV-A sent.
  await db.meta.put({ key: "role", value: "analyst" });
  await execute(db, { type: "generate_draft", subject: { kind: "invoice", id: TOUR_INVOICES.a } });
  const d = await db.drafts.where("invoice_id").equals(TOUR_INVOICES.a).first();
  await execute(db, { type: "submit_draft", subject: { kind: "draft", id: d!.draft_id } });
  await db.meta.put({ key: "role", value: "manager" });
  await execute(db, {
    type: "set_autopilot",
    subject: { kind: "system", id: "autopilot" },
    payload: { enabled: true, max_amount_paise: 5_000_000 },
  });

  await confirmStartTour(db, fetcher);

  expect((await db.meta.get("role"))?.value).toBe("analyst");
  expect(parsePolicy((await db.meta.get(AUTOPILOT_KEY))?.value)).toEqual({ enabled: false, max_amount_paise: 5_000_000 });
  expect(await db.drafts.count()).toBe(0);
  expect(getTour()).toEqual({ phase: "running", step: 0, substage: 0 });
});

it("starts cleanly on a fresh demo that is already Analyst", async () => {
  await db.meta.put({ key: "role", value: "analyst" });
  await confirmStartTour(db, fetcher);
  expect((await db.meta.get("role"))?.value).toBe("analyst");
  expect(getTour().phase).toBe("running");
});
