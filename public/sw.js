/*
 * TASK-24 (Design §D5): Verilane's service worker.
 *
 * Cache key = `verilane-<seedVersion>`, where seedVersion comes from
 * /seed/manifest.json (the loader's source of truth; generated from
 * scripts/seed.ts). One cache at a time: whenever the SW sees a manifest with
 * a new seedVersion it adopts it and deletes every other `verilane-*` cache,
 * so a seed bump can never serve stale seed files (TC-077).
 *
 * - /seed/manifest.json: network-first (it is the version pointer).
 * - Navigations: network-first, falling back to the cached page, then "/".
 * - App shell statics, seed files, icons: cache-first within the current cache.
 *
 * Failures are logged as "[sw] …" and forwarded to open pages (PwaRegister
 * re-logs them), so nothing fails silently (T24-6).
 */
const CACHE_PREFIX = "verilane-";
const SEED_MANIFEST_URL = "/seed/manifest.json";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

/** In-memory copy of the current cache name; lost when the SW is stopped. */
let activeCacheName = null;
/**
 * Set when the server's manifest names a seed version that couldn't be cached
 * (e.g. a seed file 404s). Until a later adoption succeeds, /seed/* goes to
 * the network so the cache can never pair the new manifest with old seed files.
 */
let seedBypass = false;

async function reportError(message, err) {
  console.error(`[sw] ${message}`, err);
  const detail = err instanceof Error ? err.message : String(err);
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage({ type: "sw-error", message: `${message}: ${detail}` });
  }
}

function seedUrls(manifest) {
  return [manifest.invoices, manifest.customers, manifest.payments, manifest.emails];
}

/**
 * Makes `manifest.seedVersion` the current cache: precaches the seed files
 * (+ shell when asked), carries the shell and visited pages over from the
 * previous cache (T24-1), stores the manifest, and evicts all other
 * `verilane-*` caches. On failure the half-built cache is dropped and the
 * previous one stays current.
 */
async function adoptManifest(manifestResponse, { withShell = false } = {}) {
  const manifest = await manifestResponse.clone().json();
  const name = CACHE_PREFIX + manifest.seedVersion;
  const existed = await caches.has(name);
  const cache = await caches.open(name);
  try {
    if (name !== activeCacheName || withShell) {
      const missing = [];
      for (const url of [...(withShell ? SHELL_URLS : []), ...seedUrls(manifest)]) {
        if (!(await cache.match(url))) missing.push(url);
      }
      await cache.addAll(missing);
    }
    const others = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== name);
    // Everything but seed data is version-independent: keep it.
    for (const key of others) {
      const old = await caches.open(key);
      for (const request of await old.keys()) {
        if (new URL(request.url).pathname.startsWith("/seed/")) continue;
        if (await cache.match(request)) continue;
        const response = await old.match(request);
        if (response) await cache.put(request, response);
      }
    }
    // Last, so a cache holding the manifest is always complete.
    await cache.put(SEED_MANIFEST_URL, manifestResponse.clone());
    activeCacheName = name;
    seedBypass = false;
    await Promise.all(others.map((key) => caches.delete(key)));
    return name;
  } catch (err) {
    if (!existed && name !== activeCacheName) await caches.delete(name);
    throw err;
  }
}

async function fetchManifest() {
  const res = await fetch(SEED_MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`seed manifest fetch failed (${res.status})`);
  return res;
}

/** The current cache name; after an SW restart, the surviving complete cache. */
async function currentCacheName() {
  if (activeCacheName) return activeCacheName;
  for (const key of await caches.keys()) {
    if (!key.startsWith(CACHE_PREFIX)) continue;
    if (await (await caches.open(key)).match(SEED_MANIFEST_URL)) {
      activeCacheName = key;
      return activeCacheName;
    }
  }
  return adoptManifest(await fetchManifest(), { withShell: true });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await adoptManifest(await fetchManifest(), { withShell: true });
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await adoptManifest(await fetchManifest());
      } catch (err) {
        // Offline (or a bad seed) while activating: keep the cache install created.
        await reportError("activate: seed manifest not adopted", err);
      }
      await self.clients.claim();
    })(),
  );
});

async function manifestNetworkFirst(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    // Network failure (offline): the cached manifest matches the cached seed.
    console.warn("[sw] seed manifest unreachable, serving the cached copy", err);
    const cache = await caches.open(await currentCacheName());
    const cached = await cache.match(SEED_MANIFEST_URL);
    if (cached) return cached;
    throw new Error("offline and no cached seed manifest");
  }
  if (!response.ok) {
    await reportError("seed manifest fetch failed", new Error(`HTTP ${response.status}`));
    return response;
  }
  try {
    await adoptManifest(response.clone());
  } catch (err) {
    // Adoption failure while online (e.g. a seed file 404s): serve the real
    // manifest and send seed files to the network, so the loader sees the
    // real failure instead of silently getting the old cached seed.
    seedBypass = true;
    await reportError("new seed version not cached", err);
  }
  return response;
}

async function cacheFirst(request) {
  const cache = await caches.open(await currentCacheName());
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(await currentCacheName());
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(await currentCacheName());
    const cached = (await cache.match(request)) ?? (await cache.match("/"));
    if (cached) return cached;
    throw new Error("offline and page not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === SEED_MANIFEST_URL) {
    event.respondWith(manifestNetworkFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }
  if (seedBypass && url.pathname.startsWith("/seed/")) return;
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/seed/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
  }
});

/*
 * The first visit loads its document and JS/CSS before this SW controls the
 * page, so the page posts them (PwaRegister) to be cached.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    try {
      const url = new URL(u, self.location.origin);
      return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
    } catch {
      return false;
    }
  });
  // The page document itself, so a reload of a first-visited page works offline.
  if (typeof data.page === "string" && data.page.startsWith("/") && !data.page.startsWith("//")) {
    urls.push(data.page);
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(await currentCacheName());
      await Promise.all(
        urls.map(async (u) => {
          if (await cache.match(u)) return;
          try {
            await cache.add(u);
          } catch (err) {
            await reportError(`could not cache ${u}`, err);
          }
        }),
      );
    })(),
  );
});
