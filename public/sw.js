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

function seedUrls(manifest) {
  return [manifest.invoices, manifest.customers, manifest.payments, manifest.emails];
}

/**
 * Makes `manifest.seedVersion` the current cache: stores the manifest in it,
 * precaches the seed files (+ shell when asked), and evicts all other
 * `verilane-*` caches.
 */
async function adoptManifest(manifestResponse, { withShell = false } = {}) {
  const manifest = await manifestResponse.clone().json();
  const name = CACHE_PREFIX + manifest.seedVersion;
  const cache = await caches.open(name);
  await cache.put(SEED_MANIFEST_URL, manifestResponse.clone());
  if (name !== activeCacheName || withShell) {
    const missing = [];
    for (const url of [...(withShell ? SHELL_URLS : []), ...seedUrls(manifest)]) {
      if (!(await cache.match(url))) missing.push(url);
    }
    await cache.addAll(missing);
  }
  activeCacheName = name;
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== name).map((key) => caches.delete(key)),
  );
  return name;
}

async function fetchManifest() {
  const res = await fetch(SEED_MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`seed manifest fetch failed (${res.status})`);
  return res;
}

/** The current cache name; after an SW restart, the single surviving cache. */
async function currentCacheName() {
  if (activeCacheName) return activeCacheName;
  const keys = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX));
  if (keys.length > 0) {
    activeCacheName = keys[0];
    return activeCacheName;
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
      } catch {
        // Offline while activating: keep the cache install created.
      }
      await self.clients.claim();
    })(),
  );
});

async function manifestNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await adoptManifest(response.clone());
    return response;
  } catch {
    const cache = await caches.open(await currentCacheName());
    const cached = await cache.match(SEED_MANIFEST_URL);
    if (cached) return cached;
    throw new Error("offline and no cached seed manifest");
  }
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
      await Promise.all(urls.map(async (u) => ((await cache.match(u)) ? undefined : cache.add(u).catch(() => undefined))));
    })(),
  );
});
