/**
 * First-visit seeding (A4) and `recompute()`. `ensureSeeded()` reads
 * `meta.seedVersion`; absent means first run — fetch the manifest + seed
 * files, `ingest()` them, write everything in one transaction, and record
 * the seed version. A version mismatch never auto-wipes (TC-014): the
 * caller decides whether to offer a "Reset" based on the returned status.
 */
import Papa from "papaparse";
import { ingest, type Row } from "@/domain/ingest";
import { asOf, daysBetween } from "@/domain/clock";
import { prioritise, type PriorityCtx } from "@/domain/priority";
import type { Invoice, Payment, Priority } from "@/domain/schema";
import type { VerilaneDb } from "./db";

export interface SeedManifest {
  seedVersion: string;
  invoices: string;
  customers: string;
  payments: string;
  emails: string;
}

/** Matches the global `fetch` signature; injectable so tests can stub it. */
export type Fetcher = typeof fetch;

export const SEED_VERSION_KEY = "seedVersion";

export type EnsureSeededResult = "seeded" | "current" | "update-available";

function parseCsv(text: string): Row[] {
  const { data } = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
  return data;
}

async function fetchOrThrow(fetcher: Fetcher, url: string): Promise<Response> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`seed fetch failed: ${url} (${res.status})`);
  }
  return res;
}

async function fetchText(fetcher: Fetcher, url: string): Promise<string> {
  return (await fetchOrThrow(fetcher, url)).text();
}

async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  return (await fetchOrThrow(fetcher, url)).json() as Promise<T>;
}

/**
 * Loads the manifest + seed files and ingests them, without touching the
 * database — split out so `ensureSeeded()` can run it before opening its
 * write transaction (and `resetDemo()` before its command, TASK-19).
 */
export async function loadSeed(fetcher: Fetcher, manifestUrl: string) {
  const manifest = await fetchJson<SeedManifest>(fetcher, manifestUrl);
  const [invoicesCsv, customersCsv, paymentsCsv, emailsJson] = await Promise.all([
    fetchText(fetcher, manifest.invoices),
    fetchText(fetcher, manifest.customers),
    fetchText(fetcher, manifest.payments),
    fetchJson<unknown>(fetcher, manifest.emails),
  ]);

  const ingested = ingest({
    invoices: parseCsv(invoicesCsv),
    customers: parseCsv(customersCsv),
    payments: parseCsv(paymentsCsv),
    emails: emailsJson,
  });

  return { manifest, ingested };
}

/**
 * Ensures the database holds the seed data on first run. `fetcher` defaults
 * to the global `fetch` and is injectable for tests. Returns:
 * - `"seeded"` — first run, seed just loaded.
 * - `"current"` — already seeded at the manifest's version.
 * - `"update-available"` — seeded at an older version; the caller should
 *   offer a "Reset" (never auto-wipe — TC-014).
 */
export async function ensureSeeded(
  db: VerilaneDb,
  fetcher: Fetcher = fetch,
  manifestUrl = "/seed/manifest.json",
): Promise<EnsureSeededResult> {
  const existing = await db.meta.get(SEED_VERSION_KEY);

  if (existing) {
    const manifest = await fetchJson<SeedManifest>(fetcher, manifestUrl);
    return existing.value === manifest.seedVersion ? "current" : "update-available";
  }

  const { manifest, ingested } = await loadSeed(fetcher, manifestUrl);

  const seeded = await db.transaction(
    "rw",
    [db.customers, db.invoices, db.payments, db.emails, db.dataIssues, db.priorities, db.meta],
    async () => {
      // Two first-run loads can race (StrictMode, two tabs); only the first
      // writes (M-001 R4).
      if (await db.meta.get(SEED_VERSION_KEY)) return false;
      await db.customers.bulkPut(ingested.customers);
      await db.invoices.bulkPut(ingested.invoices);
      await db.payments.bulkPut(ingested.payments);
      await db.emails.bulkPut(ingested.emails);
      // `dataIssues` is keyed `++id`, so replace rather than append (R4).
      await db.dataIssues.clear();
      await db.dataIssues.bulkPut(ingested.dataIssues);
      await recomputeCore(db);
      await db.meta.put({ key: SEED_VERSION_KEY, value: manifest.seedVersion });
      return true;
    },
  );

  return seeded ? "seeded" : "current";
}

/** Average days late a customer's paid invoices ran, keyed by customer_id;
 * absent = no payment history (`priority.ts` scores that as neutral). */
function buildCustomerHistory(invoices: Invoice[], payments: Payment[]): Map<string, number> {
  const paymentsByInvoice = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = paymentsByInvoice.get(payment.invoice_id) ?? [];
    list.push(payment);
    paymentsByInvoice.set(payment.invoice_id, list);
  }

  const daysLateByCustomer = new Map<string, number[]>();
  for (const invoice of invoices) {
    if (invoice.status !== "paid" || invoice.due_date === null) continue;
    const invoicePayments = paymentsByInvoice.get(invoice.invoice_id);
    if (!invoicePayments || invoicePayments.length === 0) continue;

    const lastPaidOn = invoicePayments.reduce(
      (latest, p) => (p.paid_on > latest ? p.paid_on : latest),
      invoicePayments[0]!.paid_on,
    );
    const daysLate = Math.max(0, daysBetween(invoice.due_date, lastPaidOn));

    const list = daysLateByCustomer.get(invoice.customer_id) ?? [];
    list.push(daysLate);
    daysLateByCustomer.set(invoice.customer_id, list);
  }

  const history = new Map<string, number>();
  for (const [customerId, daysLate] of daysLateByCustomer) {
    history.set(customerId, daysLate.reduce((sum, d) => sum + d, 0) / daysLate.length);
  }
  return history;
}

/**
 * The derived-table recompute, callable from inside an already-open
 * transaction (e.g. `ensureSeeded`'s). Only `priorities` is recomputed here
 * for now — `extractions`/`matches`/`evidence` join once TASK-8/13 land.
 */
async function recomputeCore(db: VerilaneDb): Promise<void> {
  const invoices = await db.invoices.toArray();
  const payments = await db.payments.toArray();
  const customerHistory = buildCustomerHistory(invoices, payments);
  const stored = (await db.meta.get("asOf"))?.value;
  const ctx: PriorityCtx = {
    asOf: asOf(typeof stored === "string" ? { asOf: stored } : undefined),
    payments,
    customerHistory,
  };

  const priorities: Priority[] = invoices.map((invoice) => prioritise(invoice, ctx));
  await db.priorities.clear();
  await db.priorities.bulkPut(priorities);
}

/** Recomputes every derived table from source + workflow tables, in its own
 * transaction. Call after any command that changes invoices/payments. */
export async function recompute(db: VerilaneDb): Promise<void> {
  await db.transaction("rw", [db.invoices, db.payments, db.priorities, db.meta], () =>
    recomputeCore(db),
  );
}
