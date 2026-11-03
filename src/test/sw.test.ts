/**
 * TASK-35: unit tests for `public/sw.js`, run in a `node:vm` sandbox with an
 * in-memory Cache Storage and a fake network. Each test pins a TASK-24 review
 * finding (T24-5, T24-12, N1, N2) or a TASK-35 review finding (T35-n).
 *
 * Harness limits: FakeCache.match ignores `Vary` and request headers (keys are
 * URLs only), and FakeNet ignores fetch options beyond recording them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://app.test";
const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

type Req = { url: string; method: string; mode: string };
type Handler = () => Response | Promise<Response>;

const abs = (input: string | Req) => new URL(typeof input === "string" ? input : input.url, ORIGIN);
const keyOf = (input: string | Req) => abs(input).href;

class FakeCache {
  readonly entries = new Map<string, Response>();
  onKeys: (() => void) | null = null;
  onPut: (() => void) | null = null;
  matches = 0;
  constructor(private readonly net: FakeNet) {}
  async match(input: string | Req, opts?: { ignoreSearch?: boolean }) {
    this.matches++;
    const hit = this.entries.get(keyOf(input));
    if (hit) return hit.clone();
    if (opts?.ignoreSearch) {
      const want = abs(input);
      for (const [k, res] of this.entries) {
        const u = new URL(k);
        if (u.origin === want.origin && u.pathname === want.pathname) return res.clone();
      }
    }
    return undefined;
  }
  async put(input: string | Req, res: Response) {
    // Like the Cache API, a put replaces the entry and moves it to the end of keys().
    this.entries.delete(keyOf(input));
    this.entries.set(keyOf(input), res.clone());
    this.onPut?.();
  }
  async add(input: string | Req) {
    const res = await this.net.fetch(input);
    if (!res.ok) throw new TypeError(`add failed: ${res.status}`);
    await this.put(input, res);
  }
  async addAll(inputs: string[]) {
    const all = await Promise.all(inputs.map((u) => this.net.fetch(u)));
    if (all.some((r) => !r.ok)) throw new TypeError("addAll failed");
    inputs.forEach((u, i) => this.entries.set(keyOf(u), all[i]!.clone()));
  }
  async keys() {
    const keys = [...this.entries.keys()].map((url) => ({ url }));
    this.onKeys?.();
    return keys;
  }
  async delete(input: string | Req) {
    return this.entries.delete(keyOf(input));
  }
  paths() {
    return [...this.entries.keys()].map((k) => new URL(k).pathname + new URL(k).search);
  }
}

class FakeCaches {
  readonly stores = new Map<string, FakeCache>();
  onCreate: ((name: string, cache: FakeCache) => void) | null = null;
  constructor(private readonly net: FakeNet) {}
  async open(name: string) {
    let c = this.stores.get(name);
    if (!c) {
      c = new FakeCache(this.net);
      this.stores.set(name, c);
      this.onCreate?.(name, c);
    }
    return c;
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
}

class FakeNet {
  online = true;
  readonly routes = new Map<string, Handler>();
  readonly calls: { path: string; init?: RequestInit }[] = [];
  fetch = async (input: string | Req, init?: RequestInit) => {
    this.calls.push({ path: abs(input).pathname + abs(input).search, init });
    await Promise.resolve();
    if (!this.online) throw new TypeError("Failed to fetch");
    const u = abs(input);
    const handler = this.routes.get(u.pathname + u.search) ?? this.routes.get(u.pathname);
    return handler ? handler() : new Response("not found", { status: 404 });
  };
  serve(path: string, body: string, type = "text/html") {
    this.routes.set(path, () => new Response(body, { status: 200, headers: { "content-type": type } }));
  }
}

const MANIFEST = {
  seedVersion: "v1",
  invoices: "/seed/invoices.csv",
  customers: "/seed/customers.csv",
  payments: "/seed/payments.csv",
  emails: "/seed/emails.json",
};

function html(marker: string, statics: string[] = []) {
  return `<!doctype html><title>${marker}</title>${statics.map((s) => `<script src="${s}"></script>`).join("")}`;
}

function setup() {
  const net = new FakeNet();
  net.serve("/seed/manifest.json", JSON.stringify(MANIFEST), "application/json");
  for (const f of ["invoices.csv", "customers.csv", "payments.csv", "emails.json"]) net.serve(`/seed/${f}`, `v1 ${f}`);
  for (const p of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]) {
    net.serve(p, "x");
  }
  net.serve("/", html("HOME"));
  net.serve("/offline.html", html("OFFLINE PAGE"));
  net.serve("/queue", html("QUEUE"));

  const caches = new FakeCaches(net);
  const listeners = new Map<string, (event: unknown) => void>();
  const logs = { error: [] as string[], warn: [] as string[] };
  const record = (into: string[]) => (...args: unknown[]) =>
    into.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
  const ctx: Record<string, unknown> = {
    caches,
    fetch: net.fetch,
    console: { error: record(logs.error), warn: record(logs.warn), log: () => {} },
    URL,
    Response,
    Promise,
    Error,
    TypeError,
    location: new URL(ORIGIN),
    clients: { matchAll: async () => [], claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(SW_SOURCE, ctx);

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  /** Dispatches a fetch event; `response` is undefined when the SW doesn't answer. */
  async function fetchEvent(path: string, mode = "cors") {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    const request: Req = { url: new URL(path, ORIGIN).href, method: "GET", mode };
    listeners.get("fetch")!({
      request,
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }

  async function message(data: unknown) {
    const waits: Promise<unknown>[] = [];
    listeners.get("message")!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  async function boot() {
    await lifecycle("install");
    await lifecycle("activate");
  }

  return { net, caches, logs, boot, lifecycle, fetchEvent, message };
}

describe("public/sw.js", () => {
  describe("T24-5: offline navigation", () => {
    it("serves the offline page, not Home's HTML, for a route that was never cached", async () => {
      const sw = setup();
      await sw.boot();
      sw.net.online = false;
      const res = await sw.fetchEvent("/disputes", "navigate");
      const body = await res!.text();
      expect(body).toContain("OFFLINE PAGE");
      expect(body).not.toContain("HOME");
    });

    it("matches a cached page when the URL only adds a query string", async () => {
      const sw = setup();
      await sw.boot();
      await sw.fetchEvent("/queue", "navigate");
      sw.net.online = false;
      const res = await sw.fetchEvent("/queue?band=High", "navigate");
      expect(await res!.text()).toContain("QUEUE");
    });

    it("still serves a visited page offline", async () => {
      const sw = setup();
      await sw.boot();
      await sw.fetchEvent("/queue", "navigate");
      sw.net.online = false;
      expect(await (await sw.fetchEvent("/queue", "navigate"))!.text()).toContain("QUEUE");
    });
  });

  describe("N1: offline after a failed seed adoption", () => {
    it("serves the cached seed files again once the manifest falls back to cache", async () => {
      const sw = setup();
      await sw.boot();
      // A bad deploy: v2 manifest, but payments.csv 404s, so v2 can't be adopted.
      sw.net.serve("/seed/manifest.json", JSON.stringify({ ...MANIFEST, seedVersion: "v2" }), "application/json");
      sw.net.routes.set("/seed/payments.csv", () => new Response("missing", { status: 404 }));
      await sw.fetchEvent("/seed/manifest.json");
      // Online, seed files go to the network so the failure is visible.
      expect(await sw.fetchEvent("/seed/invoices.csv")).toBeUndefined();

      sw.net.online = false;
      const manifest = (await (await sw.fetchEvent("/seed/manifest.json"))!.json()) as { seedVersion: string };
      expect(manifest.seedVersion).toBe("v1");
      const seed = await sw.fetchEvent("/seed/payments.csv");
      expect(seed).toBeDefined();
      expect(await seed!.text()).toBe("v1 payments.csv");
    });
  });

  describe("N2: writes racing a seed adoption", () => {
    async function bumpTo(sw: ReturnType<typeof setup>, version: string) {
      sw.net.serve("/seed/manifest.json", JSON.stringify({ ...MANIFEST, seedVersion: version }), "application/json");
      await sw.fetchEvent("/seed/manifest.json");
    }

    it("keeps a static whose fetch finishes after the adoption", async () => {
      const sw = setup();
      await sw.boot();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      sw.net.routes.set("/_next/static/chunks/late.js", async () => {
        await gate;
        return new Response("late", { status: 200 });
      });
      const pending = sw.fetchEvent("/_next/static/chunks/late.js");
      await bumpTo(sw, "v2");
      release();
      await pending;
      expect([...sw.caches.stores.keys()]).toEqual(["verilane-v2"]);
      expect(sw.caches.stores.get("verilane-v2")!.paths()).toContain("/_next/static/chunks/late.js");
    });

    it("keeps a page cached while the old cache is being copied", async () => {
      const sw = setup();
      await sw.boot();
      const old = sw.caches.stores.get("verilane-v1")!;
      let racing: Promise<unknown> | undefined;
      old.onKeys = () => {
        old.onKeys = null;
        racing = sw.fetchEvent("/queue", "navigate");
      };
      await bumpTo(sw, "v2");
      await racing;
      expect([...sw.caches.stores.keys()]).toEqual(["verilane-v2"]);
      expect(sw.caches.stores.get("verilane-v2")!.paths()).toContain("/queue");
    });
  });

  describe("T24-12: /_next/static/ stays bounded within a seed version", () => {
    it("prunes statics no cached page references once the cap is passed", async () => {
      const sw = setup();
      await sw.boot();
      const live = ["/_next/static/chunks/app.js", "/_next/static/chunks/app.css"];
      // app.js lazy-loads chunk-lazy.js; the CSS pulls a font.
      sw.net.serve(live[0]!, 'load("static/chunks/lazy.js")', "text/javascript");
      sw.net.serve(live[1]!, "@font-face{src:url(/_next/static/media/font.woff2)}", "text/css");
      sw.net.serve("/_next/static/chunks/lazy.js", "lazy", "text/javascript");
      sw.net.serve("/_next/static/media/font.woff2", "font", "font/woff2");
      for (let i = 0; i < 300; i++) sw.net.serve(`/_next/static/chunks/old-${i}.js`, "old", "text/javascript");
      sw.net.serve("/queue", html("QUEUE", live));

      for (const s of [...live, "/_next/static/chunks/lazy.js", "/_next/static/media/font.woff2"]) await sw.fetchEvent(s);
      for (let i = 0; i < 300; i++) await sw.fetchEvent(`/_next/static/chunks/old-${i}.js`);
      await sw.fetchEvent("/queue", "navigate");

      const paths = sw.caches.stores.get("verilane-v1")!.paths();
      const statics = paths.filter((p) => p.startsWith("/_next/static/"));
      expect(statics.sort()).toEqual(
        [...live, "/_next/static/chunks/lazy.js", "/_next/static/media/font.woff2"].sort(),
      );
      // Nothing but statics is pruned.
      expect(paths).toEqual(expect.arrayContaining(["/", "/queue", "/seed/manifest.json", "/seed/invoices.csv"]));
    });

    it("leaves a cache under the cap alone", async () => {
      const sw = setup();
      await sw.boot();
      for (let i = 0; i < 5; i++) {
        sw.net.serve(`/_next/static/chunks/old-${i}.js`, "old", "text/javascript");
        await sw.fetchEvent(`/_next/static/chunks/old-${i}.js`);
      }
      await sw.fetchEvent("/queue", "navigate");
      const statics = sw.caches.stores.get("verilane-v1")!.paths().filter((p) => p.startsWith("/_next/static/"));
      expect(statics).toHaveLength(5);
    });
  });

  it("precaches the offline page with the shell", async () => {
    const sw = setup();
    await sw.boot();
    expect(sw.caches.stores.get("verilane-v1")!.paths()).toContain("/offline.html");
  });

  describe("T35-1: a failed cache write keeps the network response", () => {
    function failWrites(sw: ReturnType<typeof setup>) {
      sw.caches.stores.get("verilane-v1")!.put = async () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      };
    }

    it("serves the fetched page, not the offline page, when the write fails", async () => {
      const sw = setup();
      await sw.boot();
      failWrites(sw);
      const res = await sw.fetchEvent("/queue?band=high", "navigate");
      expect(await res!.text()).toContain("QUEUE");
      expect(sw.logs.warn.some((w) => w.includes("cache-write-failed") && w.includes("QuotaExceededError"))).toBe(true);
      // No URL (and so no query data) in the warning.
      expect(sw.logs.warn.join("\n")).not.toMatch(/queue|band=/);
    });

    it("serves the fetched static when the write fails", async () => {
      const sw = setup();
      await sw.boot();
      sw.net.serve("/_next/static/chunks/app.js", "app", "text/javascript");
      failWrites(sw);
      const res = await sw.fetchEvent("/_next/static/chunks/app.js");
      expect(await res!.text()).toBe("app");
      expect(sw.logs.warn.some((w) => w.includes("cache-write-failed"))).toBe(true);
    });
  });

  describe("T35-3: no prune while an adoption is copying caches", () => {
    it("keeps live statics whose page hasn't been copied yet", async () => {
      const sw = setup();
      await sw.boot();
      const live = ["/_next/static/chunks/app.js", "/_next/static/chunks/app.css"];
      sw.net.serve("/disputes", html("DISPUTES"));
      // v1 holds, in write order: live statics, 160 old ones, then the page that references the live ones.
      const v1 = sw.caches.stores.get("verilane-v1")!;
      const js = (body: string) => new Response(body, { headers: { "content-type": "text/javascript" } });
      for (const s of live) await v1.put(s, js("live"));
      for (let i = 0; i < 160; i++) await v1.put(`/_next/static/chunks/old-${i}.js`, js("old"));
      await v1.put("/queue", new Response(html("QUEUE", live), { headers: { "content-type": "text/html" } }));

      // Mid-copy, once v2 holds more than STATIC_CAP statics but not /queue, a navigation lands.
      let racing: Promise<unknown> | undefined;
      sw.caches.onCreate = (name, cache) => {
        if (name !== "verilane-v2") return;
        cache.onPut = () => {
          const statics = cache.paths().filter((p) => p.startsWith("/_next/static/")).length;
          if (!racing && statics > 150 && !cache.paths().includes("/queue")) {
            racing = sw.fetchEvent("/disputes", "navigate");
          }
        };
      };
      sw.net.serve("/seed/manifest.json", JSON.stringify({ ...MANIFEST, seedVersion: "v2" }), "application/json");
      await sw.fetchEvent("/seed/manifest.json");
      expect(racing).toBeDefined();
      await racing;

      const paths = sw.caches.stores.get("verilane-v2")!.paths();
      expect(paths).toEqual(expect.arrayContaining([...live, "/queue", "/disputes"]));
    });
  });

  describe("T35-2: pruning stays cheap and bounded", () => {
    it("doesn't re-walk the cache on every navigation when the live set is over the cap", async () => {
      const sw = setup();
      await sw.boot();
      const live = Array.from({ length: 160 }, (_, i) => `/_next/static/chunks/live-${i}.js`);
      for (const s of live) sw.net.serve(s, "live", "text/javascript");
      sw.net.serve("/queue", html("QUEUE", live));
      for (const s of live) await sw.fetchEvent(s);
      await sw.fetchEvent("/queue", "navigate"); // walks once, keeps all 160

      const cache = sw.caches.stores.get("verilane-v1")!;
      expect(cache.paths().filter((p) => p.startsWith("/_next/static/"))).toHaveLength(160);
      cache.matches = 0;
      await sw.fetchEvent("/queue", "navigate");
      // No cached response was read back, so no page or chunk text was scanned.
      expect(cache.matches).toBe(0);
    });

    it("caps cached pages, evicting the oldest and keeping the shell", async () => {
      const sw = setup();
      await sw.boot();
      for (let i = 0; i < 60; i++) {
        sw.net.serve(`/p-${i}`, html(`P${i}`));
        await sw.fetchEvent(`/p-${i}`, "navigate");
      }
      const paths = sw.caches.stores.get("verilane-v1")!.paths();
      const pages = paths.filter((p) => p.startsWith("/p-"));
      expect(pages).toHaveLength(50);
      expect(pages).not.toContain("/p-0");
      expect(pages).toContain("/p-59");
      expect(paths).toEqual(expect.arrayContaining(["/", "/offline.html", "/seed/manifest.json"]));
    });
  });

  describe("T35-5: the shell refreshes on SW install", () => {
    it("re-fetches an edited offline page past the HTTP cache", async () => {
      const sw = setup();
      await sw.boot();
      sw.net.serve("/offline.html", html("OFFLINE PAGE V2"));
      sw.net.calls.length = 0;
      await sw.lifecycle("install");
      const cached = await sw.caches.stores.get("verilane-v1")!.match("/offline.html");
      expect(await cached!.text()).toContain("OFFLINE PAGE V2");
      expect(sw.net.calls.find((c) => c.path === "/offline.html")?.init?.cache).toBe("reload");
    });
  });

  describe("T35-9: failures are reported", () => {
    it("logs a failed seed adoption as an error", async () => {
      const sw = setup();
      await sw.boot();
      sw.net.serve("/seed/manifest.json", JSON.stringify({ ...MANIFEST, seedVersion: "v2" }), "application/json");
      sw.net.routes.set("/seed/payments.csv", () => new Response("missing", { status: 404 }));
      await sw.fetchEvent("/seed/manifest.json");
      expect(sw.logs.error.some((e) => e.startsWith("[sw] new seed version not cached"))).toBe(true);
    });
  });
});
