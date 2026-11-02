/**
 * The light half of seeding (TASK-40): the seed-version key and the check a
 * returning visit runs. The loader (papaparse, ingest, match, priority, the
 * simulated extractor) loads only when the database still needs seeding.
 */
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

async function fetchOrThrow(fetcher: Fetcher, url: string): Promise<Response> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`seed fetch failed: ${url} (${res.status})`);
  }
  return res;
}

export async function fetchText(fetcher: Fetcher, url: string): Promise<string> {
  return (await fetchOrThrow(fetcher, url)).text();
}

export async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  return (await fetchOrThrow(fetcher, url)).json() as Promise<T>;
}

/**
 * `"current"` / `"update-available"` for a seeded database, `null` when it
 * has never been seeded (the caller then runs the loader's `ensureSeeded()`).
 */
export async function seedStatus(
  db: VerilaneDb,
  fetcher: Fetcher = fetch,
  manifestUrl = "/seed/manifest.json",
): Promise<Exclude<EnsureSeededResult, "seeded"> | null> {
  const existing = await db.meta.get(SEED_VERSION_KEY);
  if (!existing) return null;
  const manifest = await fetchJson<SeedManifest>(fetcher, manifestUrl);
  return existing.value === manifest.seedVersion ? "current" : "update-available";
}
