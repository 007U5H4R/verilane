# TASK-45 — Test cases (Cinematic lighthouse splash screen)

> Stage 5 · Technical Planning · Campfire TASK-45 · 2026-11-02 · **APPROVED (2026-11-03)**
> Plan: [`technical-plan-TASK-45.md`](technical-plan-TASK-45.md). Tickets: [`tickets-TASK-45.md`](tickets-TASK-45.md). Requirements: Solution-PRD-TASK-45 (S21–S24, R1–R13, §6 matrix), Design-TASK-45 §18 Freeze.
> **Block:** TC-126 … TC-171 is reserved for TASK-45 (pointer in root [`test-cases.md`](../test-cases.md)); the next free ID is **TC-172**. Mapping: TC-45.nn → TC-(125+nn).
> **Traceability rule (same as root):** every automated test title starts with its `TC-###`. A TC with no test is `Auto: N`, and its manual evidence goes in HANDOFF.
> **Single run command:** `pnpm test:all`, with `pnpm splash-budget` inserted after `pnpm route-budget` (and after TASK-46's `image-budget`) by TASK-45.7. The perf cases (TC-130, TC-169, TC-170) run separately with `pnpm e2e:splash-perf` (TP-45.h). Specs run against the production build on `E2E_PORT=3145` (never 3000/3141/3900/3920).
> **Common e2e preconditions ("splash-on"):** `pnpm build:e2e`; `addInitScript` sets localStorage `verilane-session=guest` and clears sessionStorage `verilane-splash-seen`; the page is opened with `?__splash=1`; both `chromium-light` and `chromium-dark`.
> **Status values:** Not run · Pass · Fail · Blocked. **Finding:** CR-/SEC-/DES- ID or —.

## Mapping

| TC-45 | TC | Ticket | Campfire | Layer | File |
|---|---|---|---|---|---|
| .01 | TC-126 | TKT-45.01 | TASK-45.1 | manual/diff | — |
| .02 | TC-127 | TKT-45.02 | TASK-45.2 | unit | `src/lib/splash/runtime.test.ts`, `script.test.ts` |
| .03–.04, .06–.10 | TC-128, TC-129, TC-131–TC-135 | TKT-45.02 | TASK-45.2 | e2e | `tests/e2e/splash.spec.ts` |
| .05 | TC-130 | TKT-45.02 | TASK-45.2 | e2e perf | `tests/e2e/splash-perf.spec.ts` |
| .11 | TC-136 | TKT-45.03 | TASK-45.3 | unit | `src/lib/splash/runtime.test.ts` |
| .12–.16 | TC-137–TC-141 | TKT-45.03 | TASK-45.3 | e2e | `tests/e2e/splash.spec.ts` |
| .17 | TC-142 | TKT-45.04 | TASK-45.4 | unit | `src/lib/splash/runtime.test.ts` |
| .18–.25 | TC-143–TC-150 | TKT-45.04 | TASK-45.4 | e2e | `tests/e2e/splash-bar.spec.ts` |
| .26–.30 | TC-151–TC-155 | TKT-45.05 | TASK-45.5 | e2e | `tests/e2e/splash-scene.spec.ts` |
| .31 | TC-156 | TKT-45.05 | TASK-45.5 | e2e + manual | `tests/e2e/splash-scene.spec.ts` |
| .32–.34 | TC-157–TC-159 | TKT-45.06 | TASK-45.6 | e2e (+unit) | `tests/e2e/splash-rm.spec.ts` |
| .35–.37 | TC-160–TC-162 | TKT-45.07 | TASK-45.7 | unit / static | `scripts/splash-budget.test.ts`, `pnpm splash-budget` |
| .38 | TC-163 | TKT-45.08 | TASK-45.8 | manual | scratch `gen/rubric.md` |
| .39–.40 | TC-164, TC-165 | TKT-45.09 | TASK-45.9 | static / e2e | `pnpm splash-budget`, `tests/e2e/splash-scene.spec.ts` |
| .41, .43 | TC-166, TC-168 | TKT-45.10 | TASK-45.10 | e2e | `tests/e2e/splash.spec.ts` |
| .42 | TC-167 | TKT-45.10 | TASK-45.10 | manual | — |
| .44–.45 | TC-169, TC-170 | TKT-45.10 | TASK-45.10 | e2e perf | `tests/e2e/splash-perf.spec.ts` |
| .46 | TC-171 | TKT-45.10 | TASK-45.10 | e2e | `tests/e2e/splash.spec.ts` |

---

## M-45.1 · Foundation and tracer

### TC-126 · Branch-cut commit is docs only and Design.md gains exactly Revision R4
- **Rel:** M-45.1 · TKT-45.01 · TASK-45.1 · 45.1.4–.6 · E1 · **Type:** docs · **Pri:** P2 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** The first branch commit carries only the planning docs plus append-only decisions and Design R4.
- **Preconditions:** `task/45-splash` cut from E1 (plan A8).
- **Steps:** `git diff <E1>..HEAD --stat`; `git diff -U0 <E1> -- decisions.md Design.md`.
- **Data:** decisions S15–S24, D8–D15, S33–S37, TP-45.a–j; Design-TASK-45 §18.
- **Expected:** Only `docs/`, `.design/exploration/task-45/`, `decisions.md` and `Design.md` change. Both files show additions only. R4 sits after the last existing revision.

### TC-127 · Runtime state machine and built script behave in isolation
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.1–.3 · S21, S22 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** `step()` implements on → hold → exit → done with `exitAt = max(t0+D, tReady+250)`, and `buildSplashScript` runs with no bundler residue.
- **Preconditions:** vitest `unit`; fake timestamps.
- **Steps:** Feed event sequences into `step()`: ready at 1 s, ready at 7 s, no ready, skip at 100 ms, skip at 300 ms. Run the built string in `node:vm` with a stub `window`/`document`. Scan the string.
- **Data:** cfg D=5700, exit 300, beat 250, guard 250, ceiling 9700.
- **Expected:**
  - Exit at 5700 for ready at 1 s; exit at 7250 for ready at 7 s (hold in between); ceiling at 9700 with warn + mark effects.
  - A skip at 100 ms is ignored; a skip at 300 ms exits.
  - In the vm, `data-splash=on` is set and `verilaneSplash` is installed.
  - The string has no `require(`, `__webpack` or `import(`, and the non-e2e string has no `__splash`.

### TC-128 · Zero hydration warnings with the splash on
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · RK1, R2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** Pre-hydration `data-splash`/`inert` mutations cause no React hydration mismatch.
- **Preconditions:** splash-on.
- **Steps:** Collect `console` and `pageerror` from navigation until `data-splash=done` (skip via keypress after 300 ms).
- **Data:** —
- **Expected:** No message matching `/hydrat|did not match|mismatch/i`; no `pageerror`. If this fails, apply the TP-45.b fallback and re-run.

### TC-129 · Overlay node identity is stable across ShellGate swaps
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · RK1, R2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** Skeleton → loader → AppShell never remounts `#verilane-splash`.
- **Preconditions:** splash-on; the loader chunk is delayed by 1.5 s via `page.route` so the swap happens under the overlay.
- **Steps:** Take an element handle on `#verilane-splash` at DOMContentLoaded. Wait for the AppShell landmark. Check `isConnected` and `===` against a fresh query.
- **Data:** —
- **Expected:** Same node, still connected. The overlay's `data-*`/status text is unchanged by React.

### TC-130 · `splash:ready` is within ±50 ms of the no-splash baseline
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.9 · RK2, S34 · **Type:** perf · **Pri:** P0 · **Auto:** Y (`@perf`) · **Status:** Pass (2026-11-04, Δ −13.7 ms, EXE45) · **Finding:** —
- **Objective:** The splash does not delay readiness.
- **Preconditions:** `pnpm build:e2e`; `pnpm e2e:splash-perf`; a fresh context per run.
- **Steps:**
  1. Measure the baseline spread of `performance.getEntriesByName("splash:ready")` over n=9 no-splash runs.
  2. If the spread is ≤ ±50 ms, run a simple A/B; otherwise interleave A/B with n≥9.
  3. Compare the medians.
- **Data:** —
- **Expected:** The median Δ is ≤ 50 ms. A larger Δ is a no-go, which reopens Stage 2. Record the numbers in HANDOFF.

### TC-131 · Skip exits within 50 ms and the app is interactive afterwards
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · S22 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** Any key, click or tap skips promptly and removes `inert`.
- **Preconditions:** splash-on.
- **Steps:** Wait 400 ms; press Escape; read the gap between the `splash:skip` and `splash:exit` marks; wait for `done`; click a queue row.
- **Data:** Variants: Escape, Space, mouse click, touch tap (with `hasTouch`).
- **Expected:** The gap is ≤ 50 ms; `#verilane-app` has no `inert`; the row click works.

### TC-132 · The skipping input is swallowed and shortcuts still work
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · S22 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** A skip never acts on the app, and the browser keeps its shortcuts.
- **Preconditions:** splash-on; a test listener on `document` counts click and keydown events reaching the app.
- **Steps:** Skip by clicking where a link sits underneath, then skip with Enter. Separately press Meta/Ctrl+L.
- **Data:** —
- **Expected:**
  - No navigation; no app click or Enter is received.
  - The modifier shortcut is not `preventDefault`-ed: `defaultPrevented` is false and the splash does not skip.

### TC-133 · 250 ms start guard and auto-repeat keys are ignored
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · S22 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** Accidental input at load or a held key does not skip.
- **Preconditions:** splash-on.
- **Steps:** Press a key at 100 ms; dispatch a `keydown` with `repeat:true` at 400 ms; press a fresh key at 500 ms.
- **Data:** —
- **Expected:** Still `on` after the first two; exit after the third.

### TC-134 · The ceiling exits with a mark and a warning
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · S21 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 694f703) · **Finding:** —
- **Objective:** A load that never becomes ready cannot trap the user.
- **Preconditions:** splash-on; the DataProvider chunk route never resolves; `test.slow()`.
- **Steps:** Wait for `done`.
- **Data:** —
- **Expected:**
  - `done` arrives at 9.7 s ± 200 ms.
  - The `splash:ceiling` mark exists, and one `console.warn` mentions the splash ceiling.
  - `inert` is removed.

### TC-135 · Off by default in e2e builds; `?__splash=1` forces it and survives client navigation
- **Rel:** M-45.1 · TKT-45.02 · TASK-45.2 · 45.2.8 · TP-45.f · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Steps 1–2 Pass (2026-11-04, 694f703); step 3 Pass via TC-137 (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** The existing 185 specs never see the splash; the force param works.
- **Preconditions:** `pnpm build:e2e`; guest session.
- **Steps:**
  1. Load `/` with no param.
  2. Load `/?__splash=1`, skip, and clear the seen flag.
  3. Navigate in the client through onboarding Finish.
- **Data:** —
- **Expected:** (1) no `data-splash` ever. (2) `on`. (3) The client-entry splash shows, because the force flag was persisted in sessionStorage.

---

## M-45.2 · Behaviour on a placeholder scene

### TC-136 · `decide()` truth table
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.1 · S21, §6 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** The splash shows only for a guest, on a non-auth route, once per tab, when storage works.
- **Preconditions:** vitest `unit`.
- **Steps:** Table-test every combination.
- **Data:** path ∈ {`/`, `/welcome`, `/sign-in`, `/sign-up`, `/onboarding`, `/queue`} × session ∈ {guest, null, garbage} × seen ∈ {0,1} × storageOk ∈ {t,f} × e2e/force.
- **Expected:**
  - True only for a non-auth path with guest, not seen and storageOk, and, in e2e builds, force.
  - Any storage throw → false.

### TC-137 · Client entry from onboarding shows the splash before any skeleton frame; a double click shows one
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.3 · §6 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170, EXE49) · **Finding:** —
- **Objective:** No skeleton flash between Finish and the splash.
- **Preconditions:** splash-on started at `/onboarding?step=3` with no session; a rAF probe records the first frame in which `[data-state="loading"]` and `data-splash` exist (EXE49).
- **Steps:** Complete onboarding; double-click Finish.
- **Data:** —
- **Expected:** `data-splash=on` is set in or before the first frame where the skeleton exists. `show()` runs once (one `splash:painted` mark).

### TC-138 · Refresh does not replay, a new tab does, in-app navigation never does
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.4 · S21 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** Once per tab.
- **Preconditions:** splash-on; skip once.
- **Steps:** Reload; navigate to `/queue` via a link; open a new page in the same context.
- **Data:** —
- **Expected:** Reload: no splash. Link: no splash. New page: splash.

### TC-139 · Never on auth routes, without a session, or with blocked storage
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.4 · §6 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** The real browser matches TC-136.
- **Preconditions:** `?__splash=1` in each case.
- **Steps:** Load each of the 4 auth routes as guest; load `/` with no session (`?__session=none`); load `/` with an init script that makes `localStorage.getItem` throw.
- **Data:** —
- **Expected:** No `data-splash` in any case; no `pageerror`.

### TC-140 · bfcache restore does not show the splash
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.4 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** Back/forward restores never re-cover the app.
- **Preconditions:** splash-on; skip.
- **Steps:** Navigate to an external `about:blank`, then `goBack()`.
- **Data:** —
- **Expected:** `data-splash` is `done` or absent; `#verilane-app` is not `inert`.

### TC-141 · Readiness hooks are observe-only (R7 pinning)
- **Rel:** M-45.2 · TKT-45.03 · TASK-45.3 · 45.3.5 · R7 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, aa3b170) · **Finding:** —
- **Objective:** Adding the hooks changes no app behaviour.
- **Preconditions:** splash off (no param).
- **Steps:** Run the existing onboarding, tracer and DataProvider error specs. In addition, assert that `?tour=1`, the null-session redirect to `/welcome`, and the error render match the pre-change behaviour, and that `verilane:splash` events fire in the order session → provider → (seeding) → ready.
- **Data:** —
- **Expected:** All existing specs are green and the order is as listed. No hook throws when the runtime is absent (the `verilaneSplash` undefined path).

### TC-142 · `progress()` is phase-driven, monotonic and capped before ready
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.1 · S23 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Only real phases move the bar.
- **Preconditions:** vitest `unit`.
- **Steps:** Evaluate `progress()` over phase sequences, including duplicates, out-of-order input and no seeding. Step the model through time-only events.
- **Data:** —
- **Expected:**
  - Values are 10/35/65/(80)/100 and never decrease.
  - Every pre-ready value is ≤ 90.
  - Time-only events never change the value.

### TC-143 · The bar is revealed at 3.2 s and is absent from the a11y tree before that
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.3 · Design §18 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The reveal timing and the a11y tree agree.
- **Preconditions:** splash-on; `page.clock`.
- **Steps:** Take an `accessibility.snapshot()` at 3.0 s and at 3.4 s.
- **Data:** —
- **Expected:** At 3.0 s: no progressbar node, `visibility:hidden`. At 3.4 s: a progressbar is present.

### TC-144 · Progressbar aria values track the phases
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.3 · S23 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Assistive technology reads the real progress.
- **Preconditions:** splash-on.
- **Steps:** Sample `aria-valuenow`/`aria-valuetext` on each `verilane:splash` event.
- **Data:** —
- **Expected:**
  - `aria-valuenow` equals `progress()` for the phases so far.
  - The progressbar is not a live region.
  - `aria-valuemin` is 0 and `aria-valuemax` is 100.

### TC-145 · Status copy per phase, seeding only when real, a single live region
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.3 · S22, S23 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Honest, non-chatty announcements.
- **Preconditions:** splash-on. Run A: a seeded DB, by loading twice. Run B: a fresh context.
- **Steps:** Record the `role=status` text over time; count the live regions in the overlay.
- **Data:** —
- **Expected:**
  - Exactly one `[role=status]`.
  - The seeding copy appears only in run B.
  - The copy matches Design §18 strings.

### TC-146 · A stall shows the glint, then the "Still working…" line, without moving the value
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.4 · Design §18 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The stall UI is visual only.
- **Preconditions:** splash-on; the loader chunk is delayed by 6 s; `test.slow()`.
- **Steps:** Sample `data-stalled`, the sub-line visibility and `aria-valuenow`.
- **Data:** —
- **Expected:**
  - The glint starts after 1.5 s with no event.
  - The sub-line appears after a 4 s stall or at D+1.5 s, whichever comes first.
  - The value is unchanged during the stall.

### TC-147 · A slow load holds after D and never restarts the cinematic
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.4 · S21 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Hold is a calm loop, not a replay.
- **Preconditions:** splash-on; ready is delayed until 8 s; `test.slow()`.
- **Steps:** Read `data-splash` at 5.0, 6.0 and 8.5 s; count the `animationstart` events for the intro keyframes.
- **Data:** —
- **Expected:** `on` → `hold` → `exit`/`done`. The intro keyframes start once. Exit comes ≤ 250 ms + 300 ms after ready.

### TC-148 · Ceiling with a chunk-load failure exits with the bar incomplete
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.4 · S21, S23 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** A failed `DataProvider` chunk never strands the user behind the splash.
- **Preconditions:** splash-on; `page.route` aborts the DataProvider chunk; `test.slow()`.
- **Steps:** Wait for `done`.
- **Data:** —
- **Expected:** Exit at the ceiling; the last `aria-valuenow` is < 100; the app's own failure UI is reachable and not `inert`.

### TC-149 · The DataProvider error path exits promptly and reveals the error
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.4 · S23 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** `error` is a terminal phase like `ready`.
- **Preconditions:** splash-on; an init script makes `indexedDB.open` fail.
- **Steps:** Wait for `done`.
- **Data:** —
- **Expected:** The error status copy shows; exit is at `max(t0+D, tError+250)`; the bar stays < 100; the existing error render is visible.

### TC-150 · A skip at 65 % does not complete the bar
- **Rel:** M-45.2 · TKT-45.04 · TASK-45.4 · 45.4.4 · S23 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The bar never lies, even on exit.
- **Preconditions:** splash-on; ready is delayed by 3 s.
- **Steps:** Wait for `aria-valuenow=65`; press a key.
- **Data:** —
- **Expected:** The exit fade starts with the value still at 65 (no jump to 100).

### TC-151 · The scene fits at 375 / 768 / 1440 without horizontal scroll
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.2 · Design §18, web-deliverables · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Responsive layout.
- **Preconditions:** splash-on at each viewport, portrait and landscape at 375.
- **Steps:** Check `scrollWidth` against `innerWidth`, and the bounding boxes of the wordmark, the lighthouse, the bar and the skip button.
- **Data:** —
- **Expected:** No overflow. The bar is centred within ±2 px. The skip button does not overlap the bar or the wordmark.

### TC-152 · Cloud parallax: the foreground moves faster than the background
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.2 · S24 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Parallax ratio as frozen.
- **Preconditions:** splash-on; animations are paused at t0+5 s via `getAnimations()` currentTime.
- **Steps:** Read the computed `translateX` of each cloud layer.
- **Data:** —
- **Expected:** Foreground ≈ 5vw and background ≈ 2.5vw at half the 10 s cycle (ratio 2 ± 0.1).

### TC-153 · The splash is always dark in both themes and exits cleanly into either theme
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.3 · Design §18 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Theme independence.
- **Preconditions:** splash-on in `chromium-light` and `chromium-dark`.
- **Steps:** Compare the overlay background pixels; screenshot the first frame after `done`.
- **Data:** —
- **Expected:** The overlay pixels are identical across themes. After the exit, the app shows its theme with no white flash.

### TC-154 · Bar fill ≥ 3:1 and text ≥ 4.5:1 against the scene
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.3 · Freeze item 1 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** WCAG non-text and text contrast.
- **Preconditions:** splash-on; frames paused at reveal and at hold. Re-run on the final art in TASK-45.9.
- **Steps:** Sample pixels at the fill start, the fill end, the status text and the skip label against the pixels behind them.
- **Data:** —
- **Expected:** Fill ≥ 3:1 at both ends; text ≥ 4.5:1. The chosen colour is recorded as the TP-45.j EXE decision.

### TC-155 · Skip intro button: size, placement, label swap, no autofocus
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.4 · S22 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** A real, accessible control.
- **Preconditions:** splash-on; fine and coarse pointers.
- **Steps:** Measure the button; read `document.activeElement` at load; Tab once; check the key-hint text on touch and on desktop.
- **Data:** —
- **Expected:**
  - The target is ≥ 44×44 px.
  - Nothing is focused at load; the first Tab focuses Skip with a visible ring.
  - The label swaps per pointer type (Design §18).

### TC-156 · Frame screenshots match the frozen design beats
- **Rel:** M-45.2 · TKT-45.05 · TASK-45.5 · 45.5.5 · Design §18 · **Type:** visual · **Pri:** P2 · **Auto:** Partial (capture Y, judgement N) · **Status:** Not run · **Finding:** —
- **Objective:** The implementation matches the approved mockup.
- **Preconditions:** splash-on; `page.clock` at each beat; 1440 / 768 / 375.
- **Steps:** Capture each beat; review side by side with `.design/exploration/task-45/shots/`.
- **Data:** —
- **Expected:** Composition, colour and timing match. Differences are listed in HANDOFF as DES- candidates. This is re-run on the final art.

### TC-157 · Reduced motion: zero running animations
- **Rel:** M-45.2 · TKT-45.06 · TASK-45.6 · 45.6.2 · S21 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** A static frame only.
- **Preconditions:** splash-on; `emulateMedia({reducedMotion:"reduce"})`.
- **Steps:** Run `document.getAnimations().filter(a => a.playState === "running").length` at 100 ms and at 600 ms.
- **Data:** —
- **Expected:** 0 both times.

### TC-158 · Reduced motion: D_rm 1 s, ceiling 5 s, instant cut
- **Rel:** M-45.2 · TKT-45.06 · TASK-45.6 · 45.6.1–.3 · S21 · **Type:** e2e (+unit) · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The rm timings.
- **Preconditions:** As TC-157. Run A: ready fast. Run B: ready never.
- **Steps:** Time `on` → `done`; check that no `exit` attribute with an opacity transition occurs.
- **Data:** —
- **Expected:** A: `done` at 1.0 s ± 150 ms. B: `done` at 5.0 s ± 200 ms. Both are an instant cut with beat 0. The bar is visible from t0.

### TC-159 · Skip works under reduced motion
- **Rel:** M-45.2 · TKT-45.06 · TASK-45.6 · 45.6.3 · S22 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Same skip contract.
- **Preconditions:** As TC-157.
- **Steps:** Press a key at 400 ms.
- **Data:** —
- **Expected:** `done` within 50 ms; `inert` removed.

### TC-160 · The `splash-budget` gate measures and fails correctly
- **Rel:** M-45.2 · TKT-45.07 · TASK-45.7 · 45.7.1 · TP-45.g · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, ad6ac80) · **Finding:** —
- **Objective:** The gate is trustworthy.
- **Preconditions:** vitest `unit`; injectable readers.
- **Steps:** Feed under-budget and over-budget inputs: inline bytes, rasters (60/30 KB) and route deltas.
- **Data:** synthetic buffers.
- **Expected:** Exit 0 when under budget. Over budget gives a non-zero exit, and the message names the offending item and its bytes.

### TC-161 · The per-route shared-JS delta against E1 is ≤ 0.5 KB
- **Rel:** M-45.2 · TKT-45.07 · TASK-45.7 · 45.7.3 · S-budget · **Type:** static · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, ad6ac80) · **Finding:** —
- **Objective:** The hooks are nearly free.
- **Preconditions:** `pnpm build`; the E1 stats snapshot is committed under `scripts/fixtures/` in TASK-45.7.
- **Steps:** `pnpm splash-budget`.
- **Data:** E1 route stats.
- **Expected:** Every route's delta is ≤ 512 B; `route-budget` stays green (`/settings` < 300 KB).

### TC-162 · Zero splash bytes in shared JS when the splash is off; the inline total is ≤ ≈15 KB gzip
- **Rel:** M-45.2 · TKT-45.07 · TASK-45.7 · 45.7.3 · TP-45.g · **Type:** static · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, ad6ac80) · **Finding:** —
- **Objective:** The runtime and scene live in HTML and CSS, not in JS chunks.
- **Preconditions:** `pnpm build`. This is re-run after TASK-45.9.
- **Steps:** Scan `.next/static/chunks` for runtime markers such as `verilane-splash-seen`; run `pnpm splash-budget` for the inline total.
- **Data:** —
- **Expected:** No marker is found in the chunks, apart from the `events.ts` dispatch. The script + CSS + markup gzip total is within budget.

---

## M-45.3 · Art and release evidence

### TC-163 · Generated sky and cloud art meets the asset spec
- **Rel:** M-45.3 · TKT-45.08 · TASK-45.8 · 45.8.2 · Design §11.1 · **Type:** manual · **Pri:** P1 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** The paid art is usable before encoding.
- **Preconditions:** A user-approved round, with its cost stated first (max 3 rounds per asset).
- **Steps:** Check each candidate against the rubric in scratch `gen/rubric.md`.
- **Data:** G1 sky/sea, G2 clouds.
- **Expected:**
  - Dimensions and aspect are as specified; G2 has alpha.
  - There is no text, logo, beam or lighthouse in the art.
  - The palette matches §18.
  - The selection, round count and spend are recorded in HANDOFF.

### TC-164 · Final rasters are within budget and served hashed
- **Rel:** M-45.3 · TKT-45.09 · TASK-45.9 · 45.9.1, 45.9.3 · S-budget · **Type:** static + e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The art ships cheaply.
- **Preconditions:** Finals are in `src/assets/splash/`; `pnpm build`.
- **Steps:** Run `pnpm splash-budget`; load `/?__splash=1` and collect the image requests.
- **Data:** —
- **Expected:** Sky ≤ 60 KB and clouds ≤ 30 KB (AVIF, with a WebP fallback within the same caps). The URLs are content-hashed via `image-set()`.

### TC-165 · The splash never waits on the art
- **Rel:** M-45.3 · TKT-45.09 · TASK-45.9 · 45.9.2 · S21 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** A slow image does not extend the splash or block readiness.
- **Preconditions:** splash-on; `page.route` delays the splash rasters by 10 s.
- **Steps:** Time to `done`, with ready fast.
- **Data:** —
- **Expected:** `done` at D + 300 ms ± 200 ms. The placeholder gradient is visible meanwhile; there is no blank frame.

### TC-166 · axe finds no serious or critical violations at on, hold and ready
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.1 · a11y · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Overlay accessibility.
- **Preconditions:** splash-on; `@axe-core/playwright`, already used by the suite.
- **Steps:** Run axe at `on` (1 s), at `hold` (slow ready) and after `done`.
- **Data:** —
- **Expected:** 0 serious and 0 critical violations. The decorative layers are `aria-hidden`; one status and one progressbar are exposed.

### TC-167 · Screen-reader pass (VoiceOver, Safari and Chrome)
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.2 · S22, S23 · **Type:** manual · **Pri:** P1 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** The real assistive-technology experience.
- **Preconditions:** A production build on :3145 with `?__splash=1`.
- **Steps:** Load with VO on; listen through the reveal and to ready; skip with VO-Space on the button.
- **Data:** —
- **Expected:**
  - Status changes are announced politely, with no repeated chatter.
  - The progressbar is readable on demand.
  - Skip is discoverable, and focus lands in the app after exit.
  - The evidence is recorded in HANDOFF.

### TC-168 · Focus cannot enter the app while it is covered, and lands in the app after exit
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.3 · S22 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** `inert` is correct and is always cleared.
- **Preconditions:** splash-on.
- **Steps:** Tab 10× during `on` and record `activeElement`; skip; Tab once.
- **Data:** —
- **Expected:** While covered, focus stays on Skip or body (never inside `#verilane-app`). After exit, the first Tab reaches the app's skip link or first control.

### TC-169 · Splash-on performance: INP, CLS, long tasks
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.4 · N-perf · **Type:** perf · **Pri:** P1 · **Auto:** Y (`@perf`) · **Status:** Not run · **Finding:** —
- **Objective:** The animation stays off the main thread.
- **Preconditions:** `pnpm e2e:splash-perf`; 4× CPU throttle via CDP.
- **Steps:** PerformanceObserver on `longtask`, `layout-shift` and `event`, from load until `done` plus one interaction.
- **Data:** —
- **Expected:**
  - No long task attributable to the splash runtime above 50 ms.
  - CLS = 0 when the overlay exits.
  - INP for the skip input is ≤ 200 ms.
  - `splash:ready` Δ is re-checked per TC-130.

### TC-170 · No-splash Core Web Vitals unchanged against E1
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.4 · R1 · **Type:** perf · **Pri:** P1 · **Auto:** Y (`@perf`) · **Status:** Not run · **Finding:** —
- **Objective:** Returning tabs and non-guests pay nothing.
- **Preconditions:** A seen flag set (so no splash); the E1 build alongside the branch build.
- **Steps:** Interleaved A/B, n ≥ 9: LCP, CLS, `splash:ready`.
- **Data:** —
- **Expected:** Median LCP Δ ≤ 50 ms; CLS unchanged; `splash:ready` Δ ≤ 50 ms.

### TC-171 · Handshake with TASK-46: the heritage panorama shows when the splash is done
- **Rel:** M-45.3 · TKT-45.10 · TASK-45.10 · 45.10.5 · TASK-46 TC-125 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The splash's exit target is the TASK-46 background.
- **Preconditions:** TASK-46 is merged into the branch base; otherwise `Blocked`, with the reason recorded.
- **Steps:** splash-on; wait for `html[data-splash=done]`; run TASK-46's TC-125 assertion.
- **Data:** —
- **Expected:** `[data-heritage]` is visible right after `done`, with no flash between the overlay and the panorama; TC-125 passes.
