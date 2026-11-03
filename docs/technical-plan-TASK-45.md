# TASK-45 — Technical Plan (Cinematic lighthouse splash screen)

> Stage 5 · Technical Planning · Campfire TASK-45 · 2026-11-02 · **APPROVED (2026-11-03)**
> **Status:** **APPROVED (2026-11-03).** All 12 Part E sign-off items as recommended. Stage 6 starts at TASK-45.1.
> Inputs (all approved 2026-11-02): [`Discovery-PRD-TASK-45.md`](Discovery-PRD-TASK-45.md), [`Solution-PRD-TASK-45.md`](Solution-PRD-TASK-45.md) (S15–S24, R1–R13, §6 matrix, §9 phase model), [`Design-TASK-45.md`](Design-TASK-45.md) (§18 Design Freeze, D = 5.7 s, bar reveal 3.2 s), [`milestones-TASK-45.md`](milestones-TASK-45.md) (DAG, RK1–RK8, E1, D8–D15, S33–S37), [`tickets-TASK-45.md`](tickets-TASK-45.md) (TKT-45.01–.10, provisional TC-45.01–.46).
> Tests: [`test-cases-TASK-45.md`](test-cases-TASK-45.md) — **TC-126 … TC-171** (TC-45.nn → TC-(125+nn)). Next free ID after this block: **TC-172**.
> Ticket-scoped. The root [`technical-plan.md`](../technical-plan.md) belongs to TASK-1 and gets only a pointer.
> **IDs.** Campfire native IDs: TKT-45.0N = **TASK-45.N** (subtasks of TASK-45, deps wired in Stage 4). Steps inside a ticket are `45.N.k`. Draft technical decisions are `TP-45.a…`. They are numbered into the `TP#` series when appended in TASK-45.1, after TASK-46's TP9–TP15, so they are likely TP16+. If a number is taken, renumber; never reorder.
> **Next.js:** 16.4.3 (cacheComponents, Turbopack). The plan relies only on the pattern from `node_modules/next/dist/docs/` → *preventing-flash-before-hydration*: an inline `<script dangerouslySetInnerHTML>` in `<head>` runs before first paint, and `suppressHydrationWarning` covers only that element's own attributes and text. Nothing else Next-specific is new.
> **Scroll:** native. No Spatial 3D, no product analytics.

---

## Part A · Technical approach

### A1. Architecture

```
src/app/layout.tsx (server)
  <html data-theme=… suppressHydrationWarning>          ← runtime adds data-splash=on|hold|exit|done
    <head>
      <script THEME_SCRIPT/>                            (unchanged)
      <script SPLASH_SCRIPT/>   = buildSplashScript(cfg) ← NEW, typed source stringified (TP-45.a)
    <body>
      <div id="verilane-splash" suppressHydrationWarning   ← NEW, React owns the container only
           dangerouslySetInnerHTML={splashMarkup()}/>       (scene SVG + status + bar + skip button)
      <div id="verilane-app" style="display:contents"      ← NEW wrapper, gets `inert` pre-hydration
           suppressHydrationWarning>
        <Suspense fallback={<GateSkeleton/>}><ShellGate>{children}</ShellGate></Suspense>
        <Toaster/> <PwaRegister/>                           (moved inside the wrapper; overlay z above toasts)
      </div>

Readiness (observe-only, R7) — src/lib/splash/events.ts emitSplash(phase)
  GatedApp effect        session  (session === "guest")
  DataProvider mount     provider
  DataProvider async     seeding  (only when seedStatus(db) is null, before ensureSeeded)
  DataProvider status    ready | error
        └─► window CustomEvent "verilane:splash" {phase, t} ──► runtime step() ──► bar / exit
Client entry (onboarding → app): GatedApp useLayoutEffect → window.verilaneSplash?.show({entry:"client"})
```

Visibility comes only from `html[data-splash]`. With no attribute, or `done`, the overlay is `display:none` and costs nothing. React never toggles visibility, so a ShellGate swap (skeleton → DataProviderLoader → AppShell) cannot remount the overlay (R2).

### A2. Components and interfaces

```ts
// src/lib/splash/runtime.ts — NO imports. Every top-level binding is a function (TP-45.a).
export type Phase = "session" | "provider" | "seeding" | "ready" | "error";
export type SplashAttr = "on" | "hold" | "exit" | "done";
export interface SplashCfg { e2e: boolean; D: number; Drm: number; ceilingExtra: number; ceilingRm: number;
  exitMs: number; beatMs: number; guardMs: number; revealAt: number; stallMs: number; stallLineAfter: number;
  copy: Record<Phase | "start" | "stall", string> }
export interface Env { path: string; session: string | null; seen: boolean; force: boolean; storageOk: boolean; rm: boolean }
export function decide(env: Env, cfg: SplashCfg): boolean;                  // trigger truth table (TKT-45.03)
export function progress(phases: Phase[]): number;                           // 10/35/65/80/100, never ↓, ≤90 pre-ready
export interface Model { attr: SplashAttr; t0: number; tReady?: number; value: number; stalled: boolean; rm: boolean; skipped: boolean }
export type Effect = { k: "attr" | "bar" | "status" | "mark" | "warn" | "timer" | "uninert"; v?: unknown };
export function step(m: Model, ev: { type: string; t: number; [k: string]: unknown }, cfg: SplashCfg): { m: Model; fx: Effect[] };
export function boot(w: Window, cfg: SplashCfg): void;                       // DOM wiring, installs window.verilaneSplash
export function buildSplashScript(cfg: SplashCfg): string;                   // fn.toString() concat + `boot(window, cfg)`

// src/lib/splash/events.ts
export function emitSplash(phase: Phase): void;   // try/catch dispatch; phase "ready" ALWAYS performance.mark("splash:ready")

// src/lib/splash/markup.ts (server)
export function splashMarkup(): string;           // static HTML string, role="status" + role="progressbar" + Skip button

// Public client API (installed by boot), name per TP-45.c:
interface Window { verilaneSplash?: { show(o?: { entry: "client" }): void; skip(): void; state(): SplashAttr | null } }
```

`exitAt = max(t0 + D, tReady + beatMs)`. D = 5700, exit fade 300, ceiling D + 4000 = 9700. Reduced motion: D_rm 1000, ceiling 5000, instant cut, beat 0, bar visible from t0.

### A3. CSS (one file, `src/app/splash.css`, imported by `layout.tsx`)

- `#verilane-splash{display:none}`; `html[data-splash=on] #verilane-splash, html[data-splash=hold] …, html[data-splash=exit] …{display:block;position:fixed;inset:0;z-index:<above toaster>}`.
- `html[data-splash=exit] #verilane-splash{opacity:0;transition:opacity .3s}`.
- Motion uses only transform and opacity, CSS keyframes, no library (S24 parallax: foreground 10vw, background 5vw over 10 s; the beam breathes, with one sheen pass).
- `[data-splash-bar=hidden]{visibility:hidden}` keeps the bar out of the a11y tree before 3.2 s.
- `@media (prefers-reduced-motion:reduce)` sets every animation to none (TKT-45.06).
- Always dark, regardless of `data-theme` (Design §18).
- `forced-colors` gets plain system colours.
- Bar-fill start colour ≥3:1 on the hill (Freeze item 1): resolved as an EXE decision in TASK-45.5 (TP-45.j).

### A4. Asset pipeline

- **Placeholder atmosphere** until TASK-45.9: CSS gradients plus the inline SVG lighthouse, 0 raster bytes.
- **Final art:** G1 sky/sea and G2 clouds come from kie.ai (TASK-45.8). This is manual and approved per round: max 3 rounds per asset, with the cost stated before each round. **Nothing is generated automatically**, and no script calls the API.
- **Encoding (TASK-45.9):** the art goes to `src/assets/splash/` as AVIF plus a WebP fallback through `image-set()` in `splash.css`, so Turbopack hashes the URLs.
- **Budgets:** ≤60 KB for the sky raster and ≤30 KB for the clouds (S-budget), enforced by `splash-budget` (A11).

### A5. Data flows

1. **First load, guest, new tab:**
   - The head runtime runs `decide()` and sets `data-splash=on` and `inert` on `#verilane-app` before first paint, then marks `splash:painted`.
   - React hydrates underneath it, and the events advance the bar.
   - At `exitAt` the attribute becomes `exit`, then `done` after 300 ms; `inert` is removed and `verilane-splash-seen=1` is set in sessionStorage.
2. **Client entry** (onboarding finish → `/`): GatedApp's `useLayoutEffect` calls `show({entry:"client"})`, which re-runs `decide()`. It is idempotent and runs before paint, so the skeleton never paints first. Phases already passed are replayed from the runtime's own event log.
3. **Skip:** any pointer or key after the 250 ms guard goes to `exit`, within 50 ms.
   - The click is swallowed in the capture phase and Enter is not forwarded.
   - `event.repeat` is ignored.
   - Browser shortcuts are not blocked (modifier keys pass through).
4. **Hold:** if D elapses before ready, the attribute becomes `hold` (calm loop) and the bar never restarts. A stall timer, rescheduled per event (1.5 s), shows the glint; the "Still working…" line appears after a 4 s stall or 1.5 s past D.
5. **Ceiling:** at 9.7 s (rm 5 s) the overlay exits with the bar incomplete, calls `console.warn`, and marks `splash:ceiling`.
6. **bfcache:** `pageshow` with `persisted` → `done`.

### A6. Failure modes (and how we would know)

| Failure | Behaviour | Signal |
|---|---|---|
| Storage throws (private mode, blocked) | `decide()` → false, no splash | unit truth table (TC-139) |
| Runtime throws at boot | try/catch around `boot`; attribute never set → no splash | TC-127 asserts zero `pageerror` |
| No `ready` event (chunk failure, hang) | hold → ceiling exit at 9.7 s, `console.warn` + `splash:ceiling` | TC-134, TC-148 |
| DataProvider error | `error` phase → bar shows the error copy, exit after the beat; the app renders its own error | TC-149 |
| Hydration mismatch on wrapper/overlay | would remount the subtree and break R2 | TC-128 (0 warnings), TC-129 (same node); fallback per TP-45.b |
| Splash markup leaks into the e2e hooks gate | `check:e2e-hooks` fails the build | TC-160 plus the HOOKS entry (TP-45.c) |
| Splash bytes creep | `splash-budget` fails `test:all` | TC-160–TC-162 |
| `inert` left on after exit | app unusable | TC-131 / TC-168 (focus reaches the app after exit) |

### A7. Sequencing (DAG, unchanged from Stage 4)

01 → 02 → {03, 04, 06, 07} → 05 → 08 → 09 → 10. Critical path: 01→02→04→05→08→09→10.
- 03, 06 and 07 run in parallel with 04 once the tracer is green.
- 08 (art) can start its spend rounds once 05's scene composition is fixed.

### A8. E1 baseline (amended at the Stage 4 gate)

- Cut `task/45-splash` from the **green merged `task/38-emerald-redesign` head, eb85789 or later**. It must not come from f493a7b.
- The current task/38 tip is cf2c541 (TASK-44 merged).
- The commit is accepted as green only by recorded evidence: the TASK-38 owner's last full `test:all` run, with `route-budget` green. Stage 5 does not run the suite.
- If no recorded green run exists for the chosen head, TASK-45.1 runs `pnpm test:all` once in the new worktree before any code (E2E_PORT=3145), and stops and asks the user if it is red.
- **Baseline numbers to carry forward:** e2e 185 passed / 1 skipped; `/settings` shared JS ≈291.7 / 300 KB. That leaves ≈8.3 KB of headroom, which is why the splash JS delta is gated separately (TP-45.g).

### A9. Rollback

- Remove the single `<script>`, the overlay `<div>` and the wrapper from `layout.tsx`, and the emitSplash calls (each is one line).
- Remove the four e2e specs and the `splash-budget` script.
- Each ticket is its own commit, so `git revert` per ticket works.
- With no `data-splash` attribute, CSS hides everything, so removing only the script is a safe kill switch.

### A10. Draft technical decisions (`TP-45.a…`, appended in TASK-45.1 after D8–D15 and S33–S37)

- **TP-45.a Runtime as typed source, stringified.**
  - `src/lib/splash/runtime.ts` has no imports. Its pure functions are `decide`, `progress` and `step`, and `boot` does the DOM wiring.
  - `buildSplashScript` concatenates their `.toString()` and appends `boot(window, <JSON cfg>)`.
  - Rule: no free references to top-level non-function bindings (constants live inside functions).
  - Guarded by a `node:vm` unit test that runs the string against a stub window/document, and by a string scan for `require(`, `__webpack` and `import(`.
- **TP-45.b Overlay via `dangerouslySetInnerHTML`; the app gets a `display:contents` wrapper.**
  - React owns only the two containers, both `suppressHydrationWarning`. The runtime mutates inside the overlay freely.
  - Toaster and PwaRegister move inside the wrapper.
  - The tracer must show 0 hydration warnings and the same overlay node across ShellGate swaps.
  - Fallback (recorded as an EXE decision if needed): `inert` on a node React never renders, i.e. a runtime-created `<div>` sibling.
- **TP-45.c Public API is `window.verilaneSplash`, not `window.__verilaneSplash`.**
  - `scripts/check-e2e-hooks.ts` scans `.next/static` for the substring `__verilane`. The Stage 4 name would trip it.
  - Add `"__splash"` to HOOKS. The e2e force param `?__splash=1` is captured at boot into sessionStorage (e2e builds only).
  - The non-e2e `buildSplashScript` string must not contain `__splash` (unit-asserted), because it ships in server HTML, which the static scan does not see.
- **TP-45.d Baseline-comparable readiness mark.** `emitSplash("ready")` always marks `splash:ready`, with or without a splash, so the S34 A/B measures the same code path. The runtime marks `splash:painted`, `splash:skip`, `splash:exit` and `splash:ceiling`.
- **TP-45.e Hook placement (observe-only, R7).** The phase hooks go where A1 lists them. They have no return values and no state, and no control flow depends on them. Client entry is a `useLayoutEffect` in GatedApp. A pinning test (TC-141) asserts that ShellGate/DataProvider behaviour is unchanged with the splash off.
- **TP-45.f E2E force and session.**
  - Under `NEXT_PUBLIC_E2E=1`, `?__splash=1` is persisted to sessionStorage, so client entry after navigation still honours it.
  - Specs store `verilane-session=guest` via `addInitScript`, because the runtime reads localStorage directly while the e2e default guest comes from `resolveSession`.
  - Otherwise e2e builds never show the splash, so the existing 185 specs are untouched.
- **TP-45.g `splash-budget` measures source, deterministically.** It is a new `scripts/splash-budget.ts` plus a test, inserted in `test:all` after `route-budget` (and after TASK-46's `image-budget`). It measures:
  - gzip-9 of the built script string, `splash.css` and `splashMarkup()` together, against ≈15 KB;
  - each raster in `src/assets/splash/` against 60 / 30 KB;
  - the per-route shared-JS delta against E1, read from route-budget's stats, at ≤0.5 KB.
  - `route-budget` itself is unchanged.
- **TP-45.h Perf A/B outside the default e2e run.**
  - `tests/e2e/splash-perf.spec.ts` is tagged `@perf` and excluded from `pnpm e2e` via `grepInvert`. It runs with `pnpm e2e:splash-perf`.
  - It first measures the baseline spread of `splash:ready`. If the spread is wider than ±50 ms, it runs interleaved A/B with n≥9 (S34). A no-go reopens Stage 2.
  - The functional splash specs run in `test:all`. Specs that need the full D use `test.slow()`; the others skip via a keypress, and `page.clock` is used where timers allow.
- **TP-45.i Isolation.**
  - Worktree `.claude/worktrees/task-45-splash`.
  - `E2E_PORT=3145`. Never use 3000/3141/3900/3920; TASK-46 uses 3146.
  - Scratch and temp go to `/Volumes/E Drive/Dev/.scratch/task45/`, with `TMPDIR=E2E_TMPDIR=/Volumes/E Drive/Dev/.scratch/task45/tmp`.
- **TP-45.j Fill-start contrast.** The ≥3:1 bar colour is chosen in TASK-45.5 against the placeholder and re-checked on final art in TASK-45.9. It is recorded as an EXE decision, not a Design revision, unless it changes the hue family.

### A11. Test architecture (5.5)

| Layer | Runner | Files | Notes |
|---|---|---|---|
| unit (node) | vitest `unit` | `src/lib/splash/runtime.test.ts`, `src/lib/splash/script.test.ts`, `src/lib/splash/events.test.ts`, `scripts/splash-budget.test.ts` | `decide` truth table, `progress`, `step` state machine (fake clock), vm execution of the built string |
| e2e functional | Playwright `chromium-light/dark` | `tests/e2e/splash.spec.ts`, `splash-bar.spec.ts`, `splash-scene.spec.ts`, `splash-rm.spec.ts` | `?__splash=1` + guest init script; prod build on `E2E_PORT=3145` |
| e2e perf | Playwright, tag `@perf` | `tests/e2e/splash-perf.spec.ts` | `pnpm e2e:splash-perf`; not in `test:all` (TP-45.h) |
| static gates | tsx scripts | `pnpm splash-budget`, `pnpm check:e2e-hooks` (+`__splash`) | in `test:all` |
| manual | human | screen reader, final-art review, screenshot comparison | evidence goes in HANDOFF (TC-126, TC-156, TC-163, TC-167) |

- **Single run command:** `pnpm test:all`, with `pnpm splash-budget` added after `route-budget` / `image-budget`.
- **Fixtures:** no new data. The scenario fixtures are delays injected with `page.route` on the DataProvider and loader chunks (to force hold, stall and ceiling), plus `emulateMedia({reducedMotion})`.
- **Results:** Playwright HTML report under the task45 scratch dir. Every test title starts with its `TC-###`.
- **No CI exists:** the gate is `test:all` run locally per ticket.
- **E2E runtime budget:** the functional splash specs add an estimated ≤90 s with `--workers=1`. The D-length cases are capped at 6 `test.slow()` tests.

### A12. Security and privacy

- There is no CSP, apart from `/sw.js`, so the inline script needs no nonce. If a CSP is ever added, the script needs a hash (noted for Stage 9).
- The splash makes no network calls and handles no PII.
- Storage keys: it reads `verilane-session`, and reads/writes `verilane-splash-seen` in sessionStorage (plus `verilane-splash-force`, e2e only).
- The kie.ai key lives in `.env.local`. It is never read by code, logged or committed. Generation is manual and done in the tool UI/CLI by the human-approved round.
- `check:secrets` still runs.

---

## Part B · Per-ticket atomic tasks

Each step takes 2–5 minutes and uses TDD (red → green) where it is code. Commits: `feat(TASK-45.N): …`, `test(TASK-45.N): …`, `docs(TASK-45.N): …`. The per-ticket gate is `pnpm typecheck && pnpm lint && pnpm test` plus the ticket's listed specs. The final ticket runs the full `pnpm test:all`.

### TASK-45.1 · Cut the branch, append decisions, Design R4 (TKT-45.01) · M-45.1 · TC-126
- **45.1.1** Confirm E1 (A8): record eb85789+ and the evidence of a green run. If there is no evidence, run `test:all` once on :3145 and stop if it is red. **Gate:** recorded SHA + result.
- **45.1.2** `git worktree add .claude/worktrees/task-45-splash -b task/45-splash <E1>`; create `/Volumes/E Drive/Dev/.scratch/task45/tmp`. **Gate:** `git -C … log -1` = E1.
- **45.1.3** Bring the TASK-45 docs (Discovery, Solution, Design, milestones, tickets, this plan, the test cases, the storyboard) and `.design/exploration/task-45/` onto the branch. **Gate:** `git status` shows only those paths.
- **45.1.4** Append S15–S24, D8–D15, S33–S37 and TP-45.a–j (as TP16+, renumbering if taken) to `decisions.md`. Append only. **Gate:** `git diff -U0 decisions.md` shows additions only.
- **45.1.5** Append Design.md Revision R4 after TASK-46's R2/R3. If 46 has not merged yet, append after R1 and expect a trivial append conflict. **Gate:** TC-126.
- **45.1.6** Commit `docs(TASK-45.1): add splash planning docs, decisions, Design R4`. **Gate:** `git diff <E1>..HEAD --stat` contains docs only.

### TASK-45.2 · Tracer: pre-hydration overlay on real phase events, with skip (TKT-45.02) · M-45.1 · TC-127–TC-135
- **45.2.1** Red: `src/lib/splash/runtime.test.ts` covers `step()` for on → exit at `max(t0+D, tReady+250)`, skip before the guard (ignored), skip after it (exit), repeat keys (ignored), ceiling (warn + mark). **Gate:** fails (no module).
- **45.2.2** Green: implement `step`, `progress` (minimal) and `boot` in `runtime.ts`. **Gate:** unit passes.
- **45.2.3** Red/green: `src/lib/splash/script.test.ts` checks that `buildSplashScript` runs in `node:vm` against a stub and sets `data-splash=on`. It also asserts there is no `require(`, `__webpack` or `import(`, and that the non-e2e string has no `__splash`. **Gate:** unit passes.
- **45.2.4** Add `src/lib/splash/events.ts` (`emitSplash`, with an always-on `splash:ready` mark) and its test. **Gate:** unit passes.
- **45.2.5** `layout.tsx`: add the script, the bare `#verilane-splash` with `splashMarkup()` (status plus skip only), and the `#verilane-app` wrapper; move Toaster and PwaRegister into the wrapper. Add a minimal `splash.css`. **Gate:** typecheck + build.
- **45.2.6** Add the phase hooks per TP-45.e (5 one-liners). **Gate:** the existing unit tests still pass.
- **45.2.7** Add `"__splash"` to HOOKS in `scripts/check-e2e-hooks.ts` and update its test. **Gate:** `pnpm build && pnpm check:e2e-hooks` is green.
- **45.2.8** e2e `tests/e2e/splash.spec.ts`: TC-128 (zero hydration warnings across `chromium-light`/`dark`), TC-129 (overlay node identity before and after AppShell mounts, via `elementHandle` + `isConnected`), TC-131 (skip latency, skip → interactive), TC-132 (click swallow, Enter not forwarded, Cmd/Ctrl+L not blocked), TC-133 (250 ms guard, auto-repeat), TC-134 (ceiling mark + warn, via a never-resolving loader route), TC-135 (off by default in e2e, on with `?__splash=1`). TC-127 is the 45.2.1 unit. **Gate:** specs pass on :3145.
- **45.2.9** `tests/e2e/splash-perf.spec.ts` (`@perf`, TP-45.h), first measuring the baseline spread, then the TC-130 A/B; add the `e2e:splash-perf` script. **Gate:** recorded numbers. Go if Δ ≤ 50 ms; otherwise reopen Stage 2. **RK1 and RK2 go/no-go is recorded in HANDOFF.**
- **45.2.10** If TC-128 or TC-129 fails, apply the TP-45.b fallback, record it as an EXE decision and re-run. **Gate:** TC-128 and TC-129 are green.
- **45.2.11** Commits `feat(TASK-45.2): …` (runtime, layout, hooks) and `test(TASK-45.2): …`.

### TASK-45.3 · Once-per-tab trigger, client entry, observe-only pinning (TKT-45.03) · M-45.2 · TC-136–TC-141
- **45.3.1** Red/green: the `decide()` truth table covers auth routes × session (guest / null / other) × seen × storage-throws × force(e2e). **Gate:** TC-136.
- **45.3.2** Set the seen flag on show; add `show()` idempotence plus a replay of logged phases. **Gate:** unit.
- **45.3.3** Add the GatedApp `useLayoutEffect` client entry. **Gate:** TC-137 (no skeleton frame before the overlay, via a `requestAnimationFrame` probe; a double-click on Finish shows one splash).
- **45.3.4** e2e: TC-138 (refresh: no replay; new tab: replay; in-app nav: none), TC-139 (auth routes, no session, blocked storage), TC-140 (bfcache `pageshow` persisted → done).
- **45.3.5** TC-141 pinning: with the splash off, assert that the ShellGate redirect, the `?tour=1` path and the DataProvider error render match the pre-change behaviour (existing specs green, plus one explicit assertion). **Gate:** `pnpm e2e --grep "TC-13[6-9]|TC-14[01]"` and the onboarding/tracer specs are green.

### TASK-45.4 · Real-phase progress bar, stall, hold, ceiling (TKT-45.04) · M-45.2 · TC-142–TC-150
- **45.4.1** Red/green `progress()`: the targets are 10/35/65/80/100, it is monotonic, it is ≤90 before ready, and seeding is optional. **Gate:** TC-142.
- **45.4.2** Extend `step()` with reveal at 3.2 s, the stall timer, the stall line (4 s stall or D+1.5 s), and hold after D without restarting. **Gate:** unit.
- **45.4.3** Markup: `role="progressbar"` (non-live), with `aria-valuenow`/`aria-valuetext`, and a single `role="status"` live region; status copy per phase. **Gate:** TC-143/144/145.
- **45.4.4** `tests/e2e/splash-bar.spec.ts`: `page.route` delays force a stall (TC-146), hold (TC-147), ceiling with a chunk-load failure (TC-148), the DataProvider error path (TC-149) and a skip at 65 % that leaves the bar incomplete (TC-150). **Gate:** specs pass.

### TASK-45.5 · Lighthouse scene and choreography on placeholder atmosphere (TKT-45.05) · M-45.2 · TC-151–TC-156
- **45.5.1** Port the SVG lighthouse, wordmark, beam, sea and clouds from `.design/exploration/task-45/index.html` into `splashMarkup()` + `splash.css`, implementing the Design §18 tokens and timings verbatim. **Gate:** build.
- **45.5.2** Breakpoints at 375 / 768 / 1440 (TC-151); parallax distances (TC-152, computed transforms at t0+5 s).
- **45.5.3** Always dark in both themes (TC-153); fill-start contrast ≥3:1 and text ≥4.5:1 (TC-154, TP-45.j decision recorded).
- **45.5.4** Skip intro button plus key hint: ≥44 px target, placement, label swap, no autofocus, focus visible (TC-155).
- **45.5.5** Screenshots compared with `.design/exploration/task-45/shots/` at the key beats (TC-156, manual review plus attached images). **Gate:** `splash-scene.spec.ts` is green and the screenshots are attached in HANDOFF.

### TASK-45.6 · Reduced-motion path (TKT-45.06) · M-45.2 · TC-157–TC-159
- **45.6.1** `step()` rm branch: D_rm 1 s, ceiling 5 s, beat 0, instant cut. **Gate:** unit.
- **45.6.2** CSS: no animations under `prefers-reduced-motion`. **Gate:** TC-157 (`document.getAnimations().length === 0`).
- **45.6.3** `splash-rm.spec.ts`: TC-158 (timings, cut), TC-159 (skip under rm).

### TASK-45.7 · `splash-budget` gate in `test:all` (TKT-45.07) · M-45.2 · TC-160–TC-162
- **45.7.1** Red/green `scripts/splash-budget.test.ts` with an injectable reader (the route-budget pattern). **Gate:** TC-160.
- **45.7.2** Implement `scripts/splash-budget.ts` per TP-45.g; add `"splash-budget"` to package.json and insert it into `test:all` after `route-budget`. **Gate:** `pnpm build && pnpm splash-budget` is green.
- **45.7.3** TC-161: per-route delta ≤0.5 KB against E1. TC-162: zero splash bytes in shared JS when off (the runtime lives in HTML, not in JS chunks). **Gate:** script output recorded.

### TASK-45.8 · Generate sky and cloud art with kie.ai (TKT-45.08) · M-45.3 · **High/P1** · TC-163
- **45.8.1** Write the prompts from Design §11.1 (no logo, text, beam or lighthouse) to scratch `gen/prompts.md`, then **state the round cost and wait for approval**. **Gate:** user approval recorded.
- **45.8.2** Round 1 per asset (G1, G2); review against the rubric. Repeat for rounds 2–3 only with fresh approval. **Gate:** TC-163, selected files in scratch.
- No script or test calls kie.ai.

### TASK-45.9 · Encode and swap in the final art within budget (TKT-45.09) · M-45.3 · **High/P1** · TC-164, TC-165, TC-162 re-run
- **45.9.1** Encode AVIF + WebP into `src/assets/splash/` and wire them in `splash.css` via `image-set()`. **Gate:** hashed URLs served; TC-164 (raster budget on the finals).
- **45.9.2** Re-check fill contrast on the real art (TC-154 re-run); compare screenshots (TC-156 re-run); TC-165 (the splash never waits on the art: a 10 s-delayed raster route still exits at `exitAt`).
- **45.9.3** `pnpm splash-budget` (TC-160/162 re-run).

### TASK-45.10 · Release evidence (TKT-45.10) · M-45.3 · TC-166–TC-171
- **45.10.1** axe on the overlay at on and hold, and on the app at ready (TC-166).
- **45.10.2** Manual VoiceOver pass (TC-167).
- **45.10.3** Focus behaviour: no focus inside the app while it is inert; focus lands in the app after exit (TC-168).
- **45.10.4** Run `pnpm e2e:splash-perf` for INP, CLS, long tasks and `splash:ready` Δ (TC-169), and no-splash CWV against E1 (TC-170).
- **45.10.5** TASK-46 handshake: when `html[data-splash=done]`, the heritage panorama is visible and TC-125 passes (TC-171; skip if TASK-46 has not merged, and record that).
- **45.10.6** Full `pnpm test:all` on :3145. **Gate:** green, counts recorded (185 + new passed, 1 skipped).

---

## Part C · Stage 6 execution notes

- **Before any push:** run `git diff <E1>..HEAD --stat`; only the paths in A2/A3/A11, the four hook files and `layout.tsx` may appear. Never commit on task/38.
- **AGENTS.md block:** `next dev` re-adds it. Commit it with the first code commit, or leave it out; don't fight it.
- **Expected merge friction with TASK-46:** trivial appends in `decisions.md` and `Design.md`. `layout.tsx` is touched only by TASK-45. `AppShell` is touched only by TASK-46.
- **Ticket lifecycle:** each TASK-45.N goes to In Progress when it starts and to Done only when its gate is green; the commit message carries the ticket ID.
- **Budget watch:** `/settings` is ≈291.7/300 KB. Keep the hook code inline one-liners so no new client import lands in shared JS.

---

## Part D · Traceability

| Ticket | Campfire | Steps | TCs |
|---|---|---|---|
| TKT-45.01 | TASK-45.1 | 45.1.1–.6 | TC-126 |
| TKT-45.02 | TASK-45.2 | 45.2.1–.11 | TC-127–TC-135 |
| TKT-45.03 | TASK-45.3 | 45.3.1–.5 | TC-136–TC-141 |
| TKT-45.04 | TASK-45.4 | 45.4.1–.4 | TC-142–TC-150 |
| TKT-45.05 | TASK-45.5 | 45.5.1–.5 | TC-151–TC-156 |
| TKT-45.06 | TASK-45.6 | 45.6.1–.3 | TC-157–TC-159 |
| TKT-45.07 | TASK-45.7 | 45.7.1–.3 | TC-160–TC-162 |
| TKT-45.08 | TASK-45.8 | 45.8.1–.2 | TC-163 |
| TKT-45.09 | TASK-45.9 | 45.9.1–.3 | TC-164–TC-165 (+TC-162 re-run) |
| TKT-45.10 | TASK-45.10 | 45.10.1–.6 | TC-166–TC-171 |

**Known inconsistency:** the `tickets-TASK-45.md` table still lists TKT-45.08 and .09 as Medium/P2. The user set them to **High/P1** at the Stage 4 gate, and Campfire carries that. The approved doc is not edited here.

---

## Part E · Stage 5 sign-off items

| # | Item | Recommendation |
|---|---|---|
| 1 | E1: cut from the green task/38 head (eb85789+, tip cf2c541), accepted on recorded evidence; otherwise run `test:all` once in 45.1.1 | Approve. Cheapest honest check; stop and ask if red. |
| 2 | TC block TC-126 … TC-171 (46 cases), next free TC-172 | Approve. |
| 3 | TP-45.a–j as draft decisions, numbered TP16+ at append time | Approve. |
| 4 | **Rename the API to `window.verilaneSplash`** (the Stage 4 docs said `__verilaneSplash`) because `check:e2e-hooks` flags `__verilane` | Approve. Otherwise the production build fails the hooks gate. |
| 5 | Add `"__splash"` to `check:e2e-hooks` HOOKS, plus a unit guard on the inline string | Approve. Keeps the e2e force param out of production. |
| 6 | Overlay via `dangerouslySetInnerHTML` + a `display:contents` app wrapper (Toaster/PwaRegister move inside), with the TP-45.b fallback | Approve. The tracer (TC-128/129) proves it or triggers the fallback. |
| 7 | `splash-budget` measures source (script + CSS + markup gzip, rasters, route delta); `route-budget` unchanged | Approve. Deterministic and independent of chunking. |
| 8 | Perf A/B in a separate `@perf` spec (`pnpm e2e:splash-perf`), not in `test:all` | Approve. A/B with n≥9 would add minutes and noise to every run; it is run at 45.2.9 and 45.10.4. |
| 9 | E2E runtime: ≤90 s added, ≤6 `test.slow()` D-length tests | Approve. |
| 10 | Isolation: worktree `task-45-splash`, `E2E_PORT=3145`, scratch `.scratch/task45` | Approve. |
| 11 | TKT-45.08/.09 priority recorded as High/P1; the tickets doc table left as is (inconsistency noted in Part D) | Approve. Don't re-open an approved doc for a cosmetic field. |
| 12 | Fill-start contrast resolved as an EXE decision in TASK-45.5 (TP-45.j) | Approve. |
