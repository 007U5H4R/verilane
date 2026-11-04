import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// TASK-45.4 · The splash progress bar (TC-143–TC-150). The bar moves only on
// real phases (session 35 → provider 65 → seeding 80 → ready/error 100), is
// revealed at 3.2 s, shows a glint after a 1.5 s stall and a "Still working"
// line after a 4 s stall or at D+1.5 s. Times are read in the page, relative
// to `splash:painted` (t0), on the real clock (EXE71).

const FORCE = "?__splash=1";
const D = 5700;
const PROGRESS: Record<string, number> = { session: 35, provider: 65, seeding: 80, ready: 100, error: 100 };
const COPY = {
  opening: "Verilane. Opening workspace…",
  seeding: "Verilane. Preparing demo data…",
  ready: "Verilane. Workspace ready",
  error: "Verilane. Workspace opened",
  stall: "Still working — first visits can take a few seconds.",
};

type Sample = { at: number; what: string; v: string | null };
type Win = Window & { __bar: Sample[]; __phases: { at: number; phase: string; now: string | null; text: string | null; live: string | null }[] };

/** splash-on (as in splash.spec.ts) plus an in-page recorder: every phase
 * event (sampled after the runtime's own listener), and every change to the
 * bar, the status and `data-splash`, timed from t0. */
async function splashOnAndRecord(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      if (window.sessionStorage.getItem("e2e:splash-reset") === null) {
        window.sessionStorage.removeItem("verilane-splash-seen");
        window.sessionStorage.setItem("e2e:splash-reset", "1");
      }
    } catch {
      // Storage blocked: the splash stays off, and the spec fails loudly.
    }
    const w = window as unknown as Win;
    const since = () => performance.now() - (performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0);
    w.__bar = [];
    w.__phases = [];
    const pb = () => document.querySelector("#verilane-splash [role=progressbar]");
    window.addEventListener("verilane:splash", (e) => {
      const phase = (e as CustomEvent).detail.phase as string;
      // The runtime's listener is added after this one; read once it has run.
      queueMicrotask(() =>
        w.__phases.push({
          at: since(),
          phase,
          now: pb()?.getAttribute("aria-valuenow") ?? null,
          text: pb()?.getAttribute("aria-valuetext") ?? null,
          live: pb()?.getAttribute("aria-live") ?? null,
        }),
      );
    });
    const watch = () => {
      const o = document.getElementById("verilane-splash");
      const rec = (what: string, v: string | null) => w.__bar.push({ at: since(), what, v });
      rec("splash", document.documentElement.dataset.splash ?? null);
      new MutationObserver(() => rec("splash", document.documentElement.dataset.splash ?? null)).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ["data-splash"] },
      );
      if (!o) return;
      const bar = o.querySelector("[data-splash-bar]");
      const msg = o.querySelector("[data-splash-msg]");
      const sub = o.querySelector("[data-splash-sub]");
      rec("msg", msg?.textContent ?? null);
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.attributeName === "data-splash-bar") rec("bar", bar?.getAttribute("data-splash-bar") ?? null);
          else if (r.attributeName === "data-stalled") rec("stalled", bar?.hasAttribute("data-stalled") ? "1" : "0");
        }
      }).observe(bar!, { attributes: true, attributeFilter: ["data-splash-bar", "data-stalled"] });
      new MutationObserver(() => rec("now", pb()?.getAttribute("aria-valuenow") ?? null)).observe(pb()!, {
        attributes: true,
        attributeFilter: ["aria-valuenow"],
      });
      new MutationObserver(() => rec("msg", msg?.textContent ?? null)).observe(msg!, { childList: true, characterData: true, subtree: true });
      new MutationObserver(() => rec("sub", sub?.textContent ?? null)).observe(sub!, { childList: true, characterData: true, subtree: true });
      o.addEventListener("animationstart", (e) => rec("anim", (e as AnimationEvent).animationName));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
    else watch();
  });
}

const splashState = (page: Page) => page.evaluate(() => document.documentElement.dataset.splash ?? "off");
const waitForSplash = (page: Page, state: string, timeout?: number) =>
  page.waitForFunction((s) => document.documentElement.dataset.splash === s, state, { timeout });
async function waitPastT0(page: Page, ms: number) {
  await page.waitForFunction((target) => {
    const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
    return t0 !== undefined && performance.now() - t0 >= target;
  }, ms);
}
const sinceT0 = (page: Page) =>
  page.evaluate(() => performance.now() - (performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0));
const marks = (page: Page, ...names: string[]) =>
  page.evaluate((ns) => {
    const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0;
    return ns.map((n) => {
      const e = performance.getEntriesByName(n)[0];
      return e ? e.startTime - t0 : null;
    });
  }, names);
const bar = (page: Page) => page.evaluate(() => (window as unknown as Win).__bar);
const phaseLog = (page: Page) => page.evaluate(() => (window as unknown as Win).__phases);
const valueNow = (page: Page) =>
  page.evaluate(() => document.querySelector("#verilane-splash [role=progressbar]")?.getAttribute("aria-valuenow"));
const appInert = (page: Page) => page.evaluate(() => document.getElementById("verilane-app")?.hasAttribute("inert"));

/** Seed this context's database with one plain load, so the next load is a
 * returning visit (no seeding phase) whose manifest check can be held. */
async function seed(context: BrowserContext) {
  const p = await context.newPage();
  await p.goto("/queue");
  await expect(p.locator("main")).toBeAttached({ timeout: 20_000 });
  await p.waitForFunction(() => performance.getEntriesByName("splash:ready").length > 0, undefined, { timeout: 20_000 });
  await p.close();
}

/** Hold the seed manifest (the first fetch that gates seeding, or the
 * returning visit's version check) for `ms`. */
async function holdManifest(context: BrowserContext, ms: number) {
  await context.route("**/seed/manifest.json", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
}

test.beforeEach(async ({ context }) => {
  await splashOnAndRecord(context);
});

test("TC-143: the bar is revealed at 3.2 s and is absent from the a11y tree before that", async ({ page }) => {
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitPastT0(page, 2900);
  const early = await page.evaluate(() => {
    const b = document.querySelector("#verilane-splash [data-splash-bar]")!;
    return { at: performance.now() - performance.getEntriesByName("splash:painted")[0]!.startTime, vis: getComputedStyle(b).visibility };
  });
  const earlyTree = await page.locator("#verilane-splash").ariaSnapshot();
  expect(early.at, "sampled before the reveal").toBeLessThan(3200);
  expect(early.vis).toBe("hidden");
  expect(earlyTree).not.toContain("progressbar");
  await expect(page.getByRole("progressbar")).toHaveCount(0);

  await waitPastT0(page, 3400);
  expect(await splashState(page)).toBe("on");
  const lateTree = await page.locator("#verilane-splash").ariaSnapshot();
  expect(lateTree).toContain('progressbar "Loading Verilane"');
  await expect(page.getByRole("progressbar", { name: "Loading Verilane" })).toBeVisible();
  // the reveal is timed from t0 (Design §7), not from any phase
  const reveal = (await bar(page)).find((s) => s.what === "bar" && s.v === "shown");
  expect(reveal).toBeDefined();
  expect(reveal!.at).toBeGreaterThanOrEqual(3200 - 20);
  expect(reveal!.at).toBeLessThanOrEqual(3200 + 400);
});

test("TC-144: progressbar aria values track the phases", async ({ page }) => {
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => phaseLog(page).then((l) => l.map((p) => p.phase)), { timeout: 20_000 }).toContain("ready");
  const pb = page.locator("#verilane-splash [role=progressbar]");
  await expect(pb).toHaveAttribute("aria-valuemin", "0");
  await expect(pb).toHaveAttribute("aria-valuemax", "100");
  const log = await phaseLog(page);
  const seen: string[] = [];
  for (const p of log) {
    seen.push(p.phase);
    const want = Math.max(10, ...seen.map((s) => PROGRESS[s] ?? 0));
    expect(p.now, `aria-valuenow after ${seen.join(" → ")}`).toBe(String(want));
    expect(p.live, "the progressbar is not a live region").toBeNull();
  }
  expect(log.at(-1)!.text).toBe(COPY.ready.replace("Verilane. ", ""));
  await expect(pb).not.toHaveAttribute("aria-live", /.*/);
});

test.describe("TC-145: status copy per phase, seeding only when real, a single live region", () => {
  async function statusRun(page: Page) {
    await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#verilane-splash [role=status]")).toHaveCount(1);
    await expect(page.locator("#verilane-splash [aria-live]")).toHaveCount(1);
    await expect(page.locator("#verilane-splash [role=status]")).toHaveAttribute("aria-live", "polite");
    await expect.poll(() => phaseLog(page).then((l) => l.map((p) => p.phase)), { timeout: 20_000 }).toContain("ready");
    await expect.poll(() => bar(page).then((b) => b.filter((s) => s.what === "msg").at(-1)?.v)).toBe(COPY.ready);
    const msgs = (await bar(page)).filter((s) => s.what === "msg").map((s) => s.v);
    const phases = (await phaseLog(page)).map((p) => p.phase);
    // every message is a Design §7 / §18 string
    for (const m of msgs) expect([COPY.opening, COPY.seeding, COPY.ready]).toContain(m);
    expect(msgs[0]).toBe(COPY.opening);
    return { msgs, phases };
  }

  test("TC-145: run A, a seeded database, never says it is preparing data", async ({ page, context }) => {
    await seed(context);
    const { msgs, phases } = await statusRun(page);
    expect(phases).not.toContain("seeding");
    expect(msgs).not.toContain(COPY.seeding);
  });

  test("TC-145: run B, a fresh context, says it is preparing demo data", async ({ page }) => {
    const { msgs, phases } = await statusRun(page);
    expect(phases).toContain("seeding");
    expect(msgs).toContain(COPY.seeding);
  });
});

test("TC-146: a stall shows the glint, then the 'Still working' line, without moving the value", async ({ page, context }) => {
  test.slow();
  // EXE73: the seed manifest is held 6 s (not the loader chunk), so the last
  // phase before the stall is `seeding` at 80.
  await holdManifest(context, 6000);
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => phaseLog(page).then((l) => l.map((p) => p.phase)), { timeout: 25_000 }).toContain("ready");
  const log = await phaseLog(page);
  const ready = log.find((p) => p.phase === "ready")!;
  const before = log.filter((p) => p.at < ready.at);
  const last = before.at(-1)!;
  expect(last.phase).toBe("seeding");
  const samples = await bar(page);

  const stallOn = samples.find((s) => s.what === "stalled" && s.v === "1");
  expect(stallOn, "the glint started").toBeDefined();
  // no glint before the reveal; after it, 1.5 s with no event
  const wantStall = Math.max(3200, last.at + 1500);
  expect(stallOn!.at).toBeGreaterThanOrEqual(wantStall - 30);
  expect(stallOn!.at).toBeLessThanOrEqual(wantStall + 400);

  const subOn = samples.find((s) => s.what === "sub" && s.v === COPY.stall);
  expect(subOn, "the stall line appeared").toBeDefined();
  const wantSub = Math.min(last.at + 4000, D + 1500);
  expect(subOn!.at).toBeGreaterThanOrEqual(wantSub - 30);
  expect(subOn!.at).toBeLessThanOrEqual(wantSub + 400);
  expect(subOn!.at).toBeLessThan(ready.at);

  // the value never moved during the stall
  const moved = samples.filter((s) => s.what === "now" && s.at > last.at && s.at < ready.at);
  expect(moved).toEqual([]);
  expect(last.now).toBe("80");
  // ready ends the stall UI
  await expect(page.locator("#verilane-splash [data-splash-bar]")).not.toHaveAttribute("data-stalled", /.*/);
  await expect(page.locator("#verilane-splash [data-splash-sub]")).toHaveText("");
});

test("TC-147: a slow load holds after D and never restarts the cinematic", async ({ page, context }) => {
  test.slow();
  // Fresh profile: seeding starts near 1 s; holding the manifest 7 s puts ready near 8 s.
  await holdManifest(context, 7000);
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitPastT0(page, 5000);
  const at5 = await splashState(page);
  await waitPastT0(page, 6000);
  const at6 = await splashState(page);
  await waitForSplash(page, "done", 25_000);
  expect(at5).toBe("on");
  expect(at6).toBe("hold");
  const [ready, exit] = await marks(page, "splash:ready", "splash:exit");
  expect(ready, "ready landed after D").toBeGreaterThan(D);
  const states = (await bar(page)).filter((s) => s.what === "splash").map((s) => s.v);
  expect(states.filter((v, i) => v !== states[i - 1])).toEqual(["on", "hold", "exit", "done"]);
  // exit comes within the 250 ms beat plus the 300 ms fade of ready
  expect(exit! - ready!).toBeLessThanOrEqual(250 + 300);
  // EXE74: the intro keyframes are TASK-45.5; until then, no animation other
  // than the looping stall glint may start twice (nothing replays at hold).
  const anims = (await bar(page)).filter((s) => s.what === "anim" && s.v !== "splash-glint").map((s) => s.v!);
  for (const name of new Set(anims)) expect(anims.filter((a) => a === name), name).toHaveLength(1);
  // the bar was revealed once
  expect((await bar(page)).filter((s) => s.what === "bar" && s.v === "shown")).toHaveLength(1);
});

test("TC-148: a ceiling after a DataProvider chunk failure exits with the bar incomplete", async ({ page, context }) => {
  test.slow();
  // The chunk is named by hash, so it is found by content: DataProvider's
  // chunk is the only one with its error log line.
  const aborted: string[] = [];
  await context.route("**/_next/static/chunks/*.js", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (body.includes("failed to open database")) {
      aborted.push(route.request().url());
      await route.abort();
    } else {
      await route.fulfill({ response: res, body });
    }
  });
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "done", 25_000);
  expect(aborted.length).toBeGreaterThan(0);
  const [exit, ceiling, ready] = await marks(page, "splash:exit", "splash:ceiling", "splash:ready");
  expect(ceiling).not.toBeNull();
  expect(ready).toBeNull();
  expect(Math.abs(exit! - (D + 4000))).toBeLessThanOrEqual(300);
  // The failed chunk lands in global-error, which replaces the root layout
  // (overlay included), so the last value is read from the recorder.
  const values = (await bar(page)).filter((s) => s.what === "now").map((s) => Number(s.v));
  expect(values.length).toBeGreaterThan(0);
  expect(values.at(-1)!).toBeLessThan(100);
  expect(values).not.toContain(100);
  // the app's own failure UI is reachable once the overlay has gone
  await expect(page.locator("[inert]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("TC-149: the DataProvider error path exits promptly and reveals the error render", async ({ page, context }) => {
  const logged: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") logged.push(msg.text());
  });
  // EXE72: a failed seed on a fresh profile is the provider's error path (as
  // in TC-141); openDb falls back to fake-indexeddb when indexedDB.open fails.
  await context.route("**/seed/manifest.json", (route) => route.abort());
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "done", 20_000);
  const log = await phaseLog(page);
  const err = log.find((p) => p.phase === "error");
  expect(err).toBeDefined();
  expect(log.map((p) => p.phase)).not.toContain("ready");
  const msgs = (await bar(page)).filter((s) => s.what === "msg").map((s) => s.v);
  expect(msgs).toContain(COPY.error);
  const [exit] = await marks(page, "splash:exit");
  const want = Math.max(D, err!.at + 250);
  expect(exit!).toBeGreaterThanOrEqual(want - 30);
  expect(exit!).toBeLessThanOrEqual(want + 300);
  // EXE70: error is terminal like ready, so the bar completes (PRD R13, Design §7)
  expect(err!.now).toBe("100");
  expect(logged.some((t) => t.includes("[verilane] failed to open database"))).toBe(true);
  expect(await appInert(page)).toBe(false);
  await expect(page.locator("#verilane-app main")).toBeVisible();
});

test("TC-150: a skip at 65 % does not complete the bar", async ({ page, context }) => {
  test.slow();
  // A returning visit stops at provider (65) while its manifest check is held.
  await seed(context);
  await holdManifest(context, 3000);
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  const pb = page.locator("#verilane-splash [role=progressbar]");
  await expect(pb).toHaveAttribute("aria-valuenow", "65", { timeout: 10_000 });
  await waitPastT0(page, 400); // past the 250 ms input guard
  expect(await sinceT0(page)).toBeLessThan(3000);
  await page.keyboard.press("x");
  await waitForSplash(page, "exit", 2000);
  const atExit = await page.evaluate(() => ({
    now: document.querySelector("#verilane-splash [role=progressbar]")?.getAttribute("aria-valuenow"),
    p: document.getElementById("verilane-splash")?.style.getPropertyValue("--splash-p"),
  }));
  expect(atExit).toEqual({ now: "65", p: "0.65" });
  await waitForSplash(page, "done", 5000);
  // ready lands later, after the exit, and never completes the bar
  await expect.poll(() => phaseLog(page).then((l) => l.map((p) => p.phase)), { timeout: 15_000 }).toContain("ready");
  expect(await valueNow(page)).toBe("65");
  expect((await bar(page)).filter((s) => s.what === "now").map((s) => s.v)).not.toContain("100");
});
