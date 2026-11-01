/**
 * TASK-25.5 · TC-084: `recompute()` over the real seed (50 invoices + 25
 * emails) takes ≤200 ms, median of 5, in node with fake-indexeddb (wired via
 * src/test/setup.ts). Lives in src/store, not src/domain (as the plan names
 * it), because it drives Dexie + the loader and src/domain must stay pure
 * (SR2).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VerilaneDb } from "./db";
import { ensureSeeded, recompute, type Fetcher } from "./loader";

const BUDGET_MS = 200;
const RUNS = 5;
const QA_DIR = "/Volumes/E Drive/Dev/.scratch/verilane-qa";

function realFetcher(): Fetcher {
  const seedDir = join(process.cwd(), "public", "seed");
  const names = ["manifest.json", "invoices.csv", "customers.csv", "payments.csv", "emails.json"];
  const files = new Map(names.map((n) => [`/seed/${n}`, readFileSync(join(seedDir, n), "utf-8")]));
  return (async (url: string | URL | Request) => {
    const body = files.get(String(url));
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body, { status: 200 });
  }) as Fetcher;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

describe("recompute performance — TC-084", () => {
  it(`recomputes 50 invoices + 25 emails in ≤${BUDGET_MS} ms (median of ${RUNS})`, async () => {
    const db = new VerilaneDb(`verilane-perf-${Math.random()}`);
    // finally: a failed assertion must not leave the Dexie handle open for
    // later tests in the same worker.
    try {
      await ensureSeeded(db, realFetcher());
      expect(await db.invoices.count()).toBe(50);
      expect(await db.emails.count()).toBe(25);

      await recompute(db); // warm-up: JIT + fake-indexeddb first-touch costs
      const timings: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        await recompute(db);
        timings.push(performance.now() - t0);
      }
      const med = median(timings);

      try {
        mkdirSync(QA_DIR, { recursive: true });
        writeFileSync(
          join(QA_DIR, "TC-084-recompute.json"),
          JSON.stringify({ budgetMs: BUDGET_MS, runs: timings, medianMs: med }, null, 2),
        );
      } catch {
        // Evidence file is best-effort (the QA dir only exists on the dev machine).
      }

      expect(med).toBeLessThanOrEqual(BUDGET_MS);
    } finally {
      db.close();
    }
  });
});
