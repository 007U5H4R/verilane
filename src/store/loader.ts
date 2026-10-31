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
import { match } from "@/domain/match";
import { prioritise, type PriorityCtx } from "@/domain/priority";
import { reviewItemsFor } from "@/domain/review";
import { deriveSignals } from "@/domain/signals";
import type { Invoice, Match, Payment, Priority, ReviewItem } from "@/domain/schema";
import { simulateExtraction } from "@/ai/simulated";
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

const SEED_VERSION_KEY = "seedVersion";

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
 * write transaction.
 */
async function loadSeed(fetcher: Fetcher, manifestUrl: string) {
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

  await db.transaction(
    "rw",
    recomputeTables(db),
    async () => {
      await db.customers.bulkPut(ingested.customers);
      await db.invoices.bulkPut(ingested.invoices);
      await db.payments.bulkPut(ingested.payments);
      await db.emails.bulkPut(ingested.emails);
      await db.dataIssues.bulkPut(ingested.dataIssues);
      await recomputeCore(db);
      await db.meta.put({ key: SEED_VERSION_KEY, value: manifest.seedVersion });
    },
  );

  return "seeded";
}

/**
 * The Queue's "Load demo data" (TASK-9.4): forgets the recorded seed version
 * and runs the first-run load again, so an emptied database gets the seed
 * back. Upserts only — it never wipes workflow data.
 */
export async function loadDemoData(
  db: VerilaneDb,
  fetcher: Fetcher = fetch,
  manifestUrl = "/seed/manifest.json",
): Promise<void> {
  await db.meta.delete(SEED_VERSION_KEY);
  await ensureSeeded(db, fetcher, manifestUrl);
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

/** Every table `recomputeCore` reads or writes. */
function recomputeTables(db: VerilaneDb) {
  return [
    db.customers,
    db.invoices,
    db.payments,
    db.emails,
    db.extractions,
    db.matches,
    db.reviewItems,
    db.disputes,
    db.dataIssues,
    db.priorities,
    db.meta,
  ];
}

/**
 * The derived-table recompute, callable from inside an already-open
 * transaction (e.g. `ensureSeeded`'s). Recomputes `extractions` (the simulated
 * provider over every email, TASK-12.5), `matches` and review items
 * (TASK-13), then `priorities` with the email-derived signals and DataIssues.
 * "Today" is `meta.asOf` when set, else AS_OF_DATE (R6).
 */
async function recomputeCore(db: VerilaneDb): Promise<void> {
  const storedAsOf = (await db.meta.get("asOf"))?.value;
  const today = asOf({ asOf: typeof storedAsOf === "string" ? storedAsOf : undefined });

  const customers = await db.customers.toArray();
  const invoices = await db.invoices.toArray();
  const payments = await db.payments.toArray();
  const emails = await db.emails.toArray();
  const dataIssues = await db.dataIssues.toArray();
  const disputes = await db.disputes.toArray();

  const extractions = emails.map((e) => simulateExtraction(e));
  await db.extractions.clear();
  await db.extractions.bulkPut(extractions);

  const byMessage = new Map(extractions.map((x) => [x.message_id, x]));
  const matches: Match[] = [];
  const reviewItems: ReviewItem[] = [];
  for (const email of emails) {
    const ext = byMessage.get(email.message_id);
    if (!ext) continue;
    const m = match(ext, email, { customers, invoices });
    matches.push(m);
    reviewItems.push(...reviewItemsFor(m, ext, { invoices, payments }));
  }
  await db.matches.clear();
  await db.matches.bulkPut(matches);
  await syncReviewItems(db, reviewItems);

  const signals = deriveSignals({ asOf: today, extractions, matches, disputes });
  const customerHistory = buildCustomerHistory(invoices, payments);
  const ctx: PriorityCtx = { asOf: today, payments, customerHistory, signals, dataIssues };

  const priorities: Priority[] = invoices.map((invoice) => prioritise(invoice, ctx));
  await db.priorities.clear();
  await db.priorities.bulkPut(priorities);
}

const EMAIL_REVIEW_KINDS = new Set(["uncertain_match", "reconciliation", "dispute"]);

/**
 * Review items are workflow rows: a person may action or dismiss one. Upsert
 * the computed email items keeping any existing row's status; drop open
 * email items the data no longer raises; leave closed ones as history.
 */
async function syncReviewItems(db: VerilaneDb, computed: ReviewItem[]): Promise<void> {
  const existing = new Map((await db.reviewItems.toArray()).map((r) => [r.review_id, r]));
  const keep = new Set(computed.map((r) => r.review_id));
  const stale = [...existing.values()]
    .filter((r) => r.status === "open" && EMAIL_REVIEW_KINDS.has(r.kind) && !keep.has(r.review_id))
    .map((r) => r.review_id);
  await db.reviewItems.bulkDelete(stale);
  await db.reviewItems.bulkPut(
    computed.map((r) => {
      const prev = existing.get(r.review_id);
      return prev ? { ...prev, ...r, status: prev.status } : r;
    }),
  );
}

/** Recomputes every derived table from source + workflow tables, in its own
 * transaction. Call after any command that changes invoices/payments. */
export async function recompute(db: VerilaneDb): Promise<void> {
  await db.transaction("rw", recomputeTables(db), () => recomputeCore(db));
}
