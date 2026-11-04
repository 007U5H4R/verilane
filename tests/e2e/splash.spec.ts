import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// TASK-45.2 · Splash tracer (TC-128, TC-129, TC-131–TC-135). The splash is
// off by default in the e2e build; `?__splash=1` forces it (TP-45.f). Times
// are read from the page's own marks, relative to `splash:painted` (t0).

const FORCE = "?__splash=1";

/** The "splash-on" preconditions from docs/test-cases-TASK-45.md. */
async function splashOn(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("verilane-session", "guest");
      window.sessionStorage.removeItem("verilane-splash-seen");
    } catch {
      // Storage blocked: the splash stays off, and the spec fails loudly.
    }
  });
}

const splashState = (page: Page) => page.evaluate(() => document.documentElement.dataset.splash ?? "off");

const waitForSplash = (page: Page, state: string, timeout?: number) =>
  page.waitForFunction((s) => document.documentElement.dataset.splash === s, state, { timeout });

/** ms since `splash:painted`, read in the page. */
const sinceT0 = (page: Page) =>
  page.evaluate(() => performance.now() - (performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0));

async function waitPastT0(page: Page, ms: number) {
  await page.waitForFunction(
    (target) => {
      const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime;
      return t0 !== undefined && performance.now() - t0 >= target;
    },
    ms,
  );
}

const markAt = (page: Page, name: string) =>
  page.evaluate((n) => performance.getEntriesByName(n)[0]?.startTime ?? null, name);

const appInert = (page: Page) => page.evaluate(() => document.getElementById("verilane-app")?.hasAttribute("inert"));

/** Counts click and keydown events that reach the app (a bubbling listener on document). */
async function countAppInput(context: BrowserContext) {
  await context.addInitScript(() => {
    const seen = { click: 0, keydown: 0, keys: [] as { key: string; prevented: boolean }[] };
    (window as unknown as { __splashSeen: typeof seen }).__splashSeen = seen;
    document.addEventListener("click", () => {
      seen.click += 1;
    });
    document.addEventListener("keydown", (e) => {
      seen.keydown += 1;
      // Read after every other listener has run.
      setTimeout(() => seen.keys.push({ key: e.key, prevented: e.defaultPrevented }), 0);
    });
  });
}

const appInput = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __splashSeen: { click: number; keydown: number; keys: { key: string; prevented: boolean }[] } })
        .__splashSeen,
  );

test.beforeEach(async ({ context }) => {
  await splashOn(context);
});

test("TC-128: zero hydration warnings with the splash on", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    // Production React minifies: #418/#423/#425 are the hydration errors.
    if (/hydrat|did not match|mismatch|#418|#423|#425/i.test(text)) problems.push(`${msg.type()}: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  // The pre-hydration DOM really carries what the runtime sets (R-1): the
  // attributes React must tolerate are present while it hydrates.
  expect(await splashState(page)).toMatch(/^(on|hold)$/);
  expect(await appInert(page)).toBe(true);
  await waitPastT0(page, 300);
  await page.keyboard.press("x");
  await waitForSplash(page, "done");
  // Hydration finishes once the app shell has mounted; give React a beat to report.
  await page.waitForSelector("main", { state: "attached" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  expect(problems).toEqual([]);
});

test("TC-129: overlay node identity is stable across the ShellGate swaps", async ({ page, context }) => {
  // Hold the seed (the loader's first fetch on a fresh profile) for 1.5 s so
  // skeleton → loader → AppShell all happen under the overlay.
  await context.route("**/seed/manifest.json", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  const overlay = await page.$("#verilane-splash");
  const skip = await page.$("[data-splash-skip]");
  expect(overlay).not.toBeNull();
  // `style` carries the runtime's own --splash-p (it moves with each phase), so
  // it's checked separately; every other attribute must be untouched.
  const before = await overlay!.evaluate((el) => ({
    attrs: el.getAttributeNames().filter((n) => n !== "style").map((n) => `${n}=${el.getAttribute(n)}`),
    status: el.querySelector("[data-splash-status]")?.textContent,
  }));

  await page.waitForSelector("main", { state: "attached", timeout: 15_000 });
  expect(await splashState(page)).not.toBe("done"); // the swap really did happen under the overlay

  const same = await page.evaluate(
    ([o, s]) => ({
      connected: o!.isConnected,
      overlay: o === document.getElementById("verilane-splash"),
      skip: s === document.querySelector("[data-splash-skip]"),
      attrs: o!.getAttributeNames().filter((n) => n !== "style").map((n) => `${n}=${o!.getAttribute(n)}`),
      style: o!.getAttribute("style") ?? "",
      status: o!.querySelector("[data-splash-status]")?.textContent,
    }),
    [overlay, skip] as const,
  );
  expect(same.connected).toBe(true);
  expect(same.overlay).toBe(true);
  expect(same.skip).toBe(true);
  expect(same.attrs).toEqual(before.attrs);
  expect(same.style).toMatch(/^(--splash-p: [\d.]+;)?$/);
  // React never rewrites the overlay; only the runtime's own ready copy may replace the opening copy.
  expect(["Verilane. Opening workspace…", "Verilane. Workspace ready"]).toContain(same.status);
  expect(before.status).toBe("Verilane. Opening workspace…");
});

test.describe("TC-131: skip exits within 50 ms and the app is interactive afterwards", () => {
  type Probe = { input: number | null; handled: number | null; k: number | null; search: number | null; click: number | null };
  // The row opens its invoice as a full document load (splash or not), so the
  // probe lives in sessionStorage to outlive the page that took the input.
  const probe = (page: Page): Promise<Probe> =>
    page.evaluate(() => {
      const n = (k: string) => (sessionStorage.getItem(k) === null ? null : Number(sessionStorage.getItem(k)));
      return { input: n("probe:input"), handled: n("probe:handled"), k: n("probe:k"), search: n("probe:search"), click: n("probe:click") };
    });

  // R-6: times are the browser's own event timestamps, not the runtime's
  // marks. The input listener is an init script, so it is registered before
  // the runtime's capture listener and sees the skipping event first.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const once = (k: string, v: number) => {
        if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, String(v));
      };
      const first = (e: Event) => {
        if (sessionStorage.getItem("probe:input") !== null) return;
        once("probe:input", e.timeStamp);
        once("probe:handled", performance.now());
      };
      window.addEventListener("keydown", first, true);
      window.addEventListener("pointerdown", first, true);
      // N-2: when the driver actually delivered Ctrl/Cmd+K, to tell a slow
      // driver apart from a slow app.
      window.addEventListener(
        "keydown",
        (e) => {
          if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) once("probe:k", e.timeStamp);
        },
        true,
      );
      document.addEventListener("focusin", (e) => {
        const t = e.target as Element;
        if (t.closest("#verilane-app") && t.getAttribute("role") === "combobox") once("probe:search", performance.now());
      });
      // On document, after the runtime's window-capture swallow, so it counts
      // only a click that really reached the row.
      document.addEventListener(
        "click",
        (e) => {
          if ((e.target as Element).closest('a[href^="/invoices/"]')) once("probe:click", e.timeStamp);
        },
        true,
      );
    });
  });

  // `clock` is where "input" is read from: the event's own timeStamp, or (for
  // emulated touch only) when the first page listener ran. Headless touch is
  // delivered 40-220 ms after its timeStamp with or without the splash (EXE47).
  // Each app interaction gets its own pass and is the first driver action
  // after the skip, so the 350 ms measures the app, not driver round-trips.
  async function expectSkipThenInteractive(
    page: Page,
    skip: (page: Page) => Promise<void>,
    clock: "event" | "handler" = "event",
  ) {
    for (const via of ["keyboard", "pointer"] as const) {
      await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => sessionStorage.clear());
      expect(await splashState(page)).toBe("on");
      await waitPastT0(page, 400);
      // The app must be under the overlay before the skip, or "interactive
      // ≤ 350 ms after input" would time the app's own load (EXE46). The
      // first row sits below the fold, so it is scrolled in under the overlay.
      const row = page.locator('a[href^="/invoices/"]').first();
      await row.waitFor({ state: "attached", timeout: 15_000 });
      await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const box = await row.boundingBox();
      expect(box).not.toBeNull();
      await skip(page);
      if (via === "keyboard") {
        // The shell's Ctrl/Cmd+K focuses the search field in the app. (Tab
        // would land on the overlay's skip button, first in DOM order; EXE46.)
        await page.keyboard.press("ControlOrMeta+K");
        await page.waitForFunction(() => sessionStorage.getItem("probe:search") !== null);
        const p = await probe(page);
        const input = clock === "event" ? p.input : p.handled;
        const [skipAt, exitAt] = [await markAt(page, "splash:skip"), await markAt(page, "splash:exit")];
        test.info().annotations.push({
          type: "TC-131 input",
          description: `clock=${clock} · timeStamp ${p.input} · first listener ${p.handled} · exit−input ${exitAt! - input!} · k−input ${p.k! - input!} · search−input ${p.search! - input!}`,
        });
        expect(input).not.toBeNull();
        expect(skipAt).not.toBeNull();
        expect(exitAt! - input!).toBeLessThanOrEqual(50);
        // N-2: Cmd+K reaching the page late is the driver's delay, not the
        // app's; such a run says nothing about the 350 ms, so it is invalid.
        expect(p.k).not.toBeNull();
        if (p.k! - input! > 300) throw new Error(`invalid run: driver gap (k−input ${p.k! - input!} ms > 300)`);
        expect(p.search! - input!).toBeLessThanOrEqual(350);
        await waitForSplash(page, "done");
        expect(await appInert(page)).toBe(false);
      } else {
        // N-3: the skip must have happened; read before the click navigates.
        expect(await markAt(page, "splash:skip")).not.toBeNull();
        // A raw click at the row, with no actionability wait to hide a block.
        await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await expect(page).toHaveURL(/\/invoices\/[^/]+/);
        const p = await probe(page);
        const input = clock === "event" ? p.input : p.handled;
        expect(input).not.toBeNull();
        expect(p.click).not.toBeNull();
        test.info().annotations.push({ type: "TC-131 click", description: `clock=${clock} · click−input ${p.click! - input!}` });
        expect(p.click! - input!).toBeLessThanOrEqual(350);
      }
    }
  }

  test("TC-131: Escape", async ({ page }) => {
    await expectSkipThenInteractive(page, (p) => p.keyboard.press("Escape"));
  });

  test("TC-131: Space", async ({ page }) => {
    await expectSkipThenInteractive(page, (p) => p.keyboard.press(" "));
  });

  test("TC-131: mouse click", async ({ page }) => {
    await expectSkipThenInteractive(page, (p) => p.mouse.click(200, 200));
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true });
    test("TC-131: touch tap", async ({ page }) => {
      await expectSkipThenInteractive(page, (p) => p.touchscreen.tap(200, 200), "handler");
    });
  });
});

test.describe("TC-132: the skipping input is swallowed and shortcuts still work", () => {
  test.beforeEach(async ({ context }) => {
    await countAppInput(context);
  });

  test("TC-132: a click over a link skips without reaching the app", async ({ page }) => {
    await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
    const row = page.locator('a[href^="/invoices/"]').first();
    await row.waitFor({ state: "attached", timeout: 15_000 });
    expect(await splashState(page)).toMatch(/^(on|hold)$/);
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    const url = page.url();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await waitForSplash(page, "done");
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    expect((await appInput(page)).click).toBe(0);
  });

  test("TC-132: Enter skips without reaching the app", async ({ page }) => {
    await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
    await waitPastT0(page, 400);
    const url = page.url();
    await page.keyboard.press("Enter");
    await waitForSplash(page, "done");
    expect(page.url()).toBe(url);
    expect((await appInput(page)).keydown).toBe(0);
  });

  test("TC-132: Meta/Ctrl+L is not swallowed and does not skip", async ({ page }) => {
    await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
    await waitPastT0(page, 400);
    await page.keyboard.press("ControlOrMeta+L");
    await page.waitForTimeout(100);
    expect(await splashState(page)).toBe("on");
    const keys = (await appInput(page)).keys.filter((k) => k.key.toLowerCase() === "l");
    expect(keys).toHaveLength(1);
    expect(keys[0]!.prevented).toBe(false);
    expect(await markAt(page, "splash:skip")).toBeNull();
  });
});

test("TC-133: the 250 ms start guard and auto-repeat keys are ignored", async ({ page, context }) => {
  // Fire keydowns on the page's own clock, relative to t0, so load latency
  // can't push the first one past the guard. Each logs when it fired and the
  // state right after.
  await context.addInitScript(() => {
    const log: { at: number; state: string }[] = [];
    (window as unknown as { __splashKeys: typeof log }).__splashKeys = log;
    const fire = (init: KeyboardEventInit) => {
      const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime ?? 0;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true, ...init }));
      log.push({ at: performance.now() - t0, state: document.documentElement.dataset.splash ?? "off" });
    };
    const mo = new MutationObserver(() => {
      if (document.documentElement?.dataset.splash !== "on") return;
      mo.disconnect();
      const t0 = performance.getEntriesByName("splash:painted")[0]?.startTime ?? performance.now();
      const at = (ms: number, init: KeyboardEventInit) =>
        setTimeout(() => fire(init), Math.max(0, t0 + ms - performance.now()));
      at(100, {});
      at(400, { repeat: true });
      at(500, {});
    });
    // The init script runs before <html> exists, so watch the whole document.
    mo.observe(document, { attributes: true, subtree: true, attributeFilter: ["data-splash"] });
  });
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as { __splashKeys: unknown[] }).__splashKeys.length === 3);
  const log = await page.evaluate(() => (window as unknown as { __splashKeys: { at: number; state: string }[] }).__splashKeys);
  expect(log[0]!.at).toBeLessThan(250); // the guard case really ran inside the guard
  expect(log.map((l) => l.state)).toEqual(["on", "on", "exit"]);
});

test("TC-134: the ceiling exits with a mark and a warning", async ({ page, context }) => {
  test.slow();
  const warns: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" && /splash ceiling/i.test(msg.text())) warns.push(msg.text());
  });
  // Readiness never arrives: the seed manifest never answers.
  await context.route("**/seed/manifest.json", () => {});
  await page.goto(`/queue${FORCE}`, { waitUntil: "domcontentloaded" });
  await waitForSplash(page, "done", 20_000);
  const [t0, ceiling, exit, done] = await page.evaluate(() =>
    ["splash:painted", "splash:ceiling", "splash:exit", "splash:done"].map(
      (n) => performance.getEntriesByName(n)[0]?.startTime ?? null,
    ),
  );
  expect(ceiling).not.toBeNull();
  expect(await markAt(page, "splash:ready")).toBeNull();
  // Technical plan §5: the overlay exits at 9.7 s; done follows the 300 ms fade.
  expect(Math.abs(exit! - t0! - 9700)).toBeLessThanOrEqual(200);
  // Measured from the exit, not t0: exit and done are separate timers whose
  // lateness stacks under CPU contention (a gate run saw done at t0 + 10244).
  // Lower bound: the 300 ms fade less timer slack (timers fire up to ~6 ms
  // early vs performance.now()). Upper bound: done is not stranded; one run
  // saw an 814 ms main-thread stall after un-inert (EXE44).
  expect(done! - exit!).toBeGreaterThanOrEqual(300 - 20);
  expect(done! - exit!).toBeLessThanOrEqual(1500);
  expect(warns).toHaveLength(1);
  expect(await appInert(page)).toBe(false);
});

test.describe("TC-135: off by default in e2e builds; ?__splash=1 forces it", () => {
  test("TC-135: no param means no data-splash, ever", async ({ page, context }) => {
    await context.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __splashAttrs: string[] }).__splashAttrs = seen;
      new MutationObserver(() => {
        const v = document.documentElement?.getAttribute("data-splash");
        if (v != null) seen.push(v);
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-splash"] });
    });
    await page.goto("/");
    await page.waitForSelector("main", { state: "attached" });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __splashAttrs: string[] }).__splashAttrs)).toEqual([]);
    expect(await splashState(page)).toBe("off");
    expect(await markAt(page, "splash:painted")).toBeNull();
  });

  test("TC-135: ?__splash=1 turns it on and skips cleanly", async ({ page }) => {
    await page.goto(`/${FORCE}`, { waitUntil: "domcontentloaded" });
    expect(await splashState(page)).toBe("on");
    expect(await sinceT0(page)).toBeGreaterThanOrEqual(0);
    await waitPastT0(page, 300);
    await page.keyboard.press("Escape");
    await waitForSplash(page, "done");
    // Step 3 (client-entry splash after onboarding Finish) needs the seen flag
    // and client entry from TASK-45.3; it is covered there by TC-137 (EXE decision).
  });
});
