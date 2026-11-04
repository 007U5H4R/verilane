# TASK-46 — Technical Plan (Indian heritage background system)

> Stage 5 · Technical Planning · Campfire TASK-46 · 2026-11-02 · **APPROVED 2026-11-02**
> **Status:** **APPROVED (2026-11-02).** All 9 Part E items as recommended. Item 4: tablet (768–1023) art height is **Design's fixed 300px**, overriding the PRD clamp. Branch point: the green merged `task/38-emerald-redesign` head (eb85789 or later, with TASK-47/48 merged).
> Inputs (all approved 2026-11-02): [`Solution-PRD-TASK-46.md`](Solution-PRD-TASK-46.md) (§3 contract, §4 levels, §5 delivery, §6 tone, F1–F7, N1–N6, SC1–SC9, R1–R10), [`Design-TASK-46.md`](Design-TASK-46.md), [`milestones-TASK-46.md`](milestones-TASK-46.md) (DAG, R5b, S25–S32), [`tickets-TASK-46.md`](tickets-TASK-46.md) (TKT-46.01–.08, TSK-46.01–.25).
> Tests: [`test-cases-TASK-46.md`](test-cases-TASK-46.md) — **TC-091 … TC-125** (TC-46.nn → TC-(090+nn)).
> Ticket-scoped. The root [`technical-plan.md`](../technical-plan.md) belongs to TASK-1 and is not edited beyond a one-line pointer.
> **IDs.** Campfire native IDs from here on: TKT-46.0N = **TASK-46.N** (subtasks of TASK-46, deps wired). Plan-local steps inside a ticket are `46.N.k`. Draft technical decisions are `TP-46.a…` (numbered into the `TP#` series when appended, see §A10).
> **Scroll:** native. No Spatial 3D, no product analytics (Design-TASK-46 has no §15 override, §26 or §27).

---

## Part A · Technical approach

### A1. Architecture

```
src/app/layout.tsx  THEME_SCRIPT ──sets──► <html data-theme="light|dark">   (pre-hydration, unchanged)
        │
ShellGate ─ auth routes (/welcome /sign-in /sign-up /onboarding) render bare ──► no heritage (F1)
        └─ AppShell (also rendered by ShellLoading skeleton, TASK-43)
              <div class="flex min-w-0 flex-col relative isolate">      ← +2 class tokens (R6)
                 <IndianHeritageBackground/>                            ← +1 child, +1 import
                     <div aria-hidden data-heritage data-level data-home? data-idle?
                          class="pointer-events-none select-none absolute inset-x-0 top-0 -z-10">
                        <span data-heritage-preload/>                   (1×1, opacity 0)
                 TopBar · BannerHost · SeedUpdatePrompt · <main>
        │
src/lib/heritage.ts   heritageLevelFor(pathname) → "normal" | "reduced" | "off"   (pure, single switch-off)
                      scheduleIdleOnce(win, cb) → cancel                           (pure, single-shot)
        │
src/app/globals.css   /* TASK-46 heritage */ block:
                      [data-heritage] { background-image: image-set(url(avif) type("image/avif"), url(webp) type("image/webp")) }
                      light default · dark under (prefers-color-scheme:dark){:root:not([data-theme=light])} and :root[data-theme=dark]
                      height clamp(320px,42vw,620px) · mask linear-gradient(to bottom,#000 55%,transparent)
                      reduced = CSS treatment on the same asset · tablet 38% top · mobile Home-only strip
                      forced-colors / print → display:none · [data-level=off] → display:none
        │
assets   Path A (default): src/assets/heritage/heritage-{light|dark}-{desk|strip}.{avif,webp} → hashed /_next/static/media/* (immutable)
         Path B (fallback): public/heritage/heritage-{theme}-{desk|strip}.v1.{avif,webp} + headers() /heritage/:path* immutable
        │
public/sw.js  STATIC_REF keeps /_next/static/* that cached pages/CSS reference (R5b: must match the emitted url form)
```

- **Rendering.** `IndianHeritageBackground` is a `"use client"` component (it needs `usePathname()` and one `useEffect`). It renders the same markup on server and client: `data-level` derives from `usePathname()`, which is available during SSR/prerender, so there is no hydration mismatch. Theme selection is **pure CSS** on `[data-theme]`, already set by `THEME_SCRIPT` before first paint, so the first heritage request already matches the theme (SC4, no-flash). The component never reads `data-splash`, onboarding state or data hooks (PRD §3.7).
- **Why a CSS background, not `<Image>`.** Never an LCP candidate (N4), no layout box of its own (N3, CLS 0 by construction: `absolute`, behind content), theme swap without JS (S25). `next/image` cannot switch source by `[data-theme]` without JS.
- **ShellLoading (TASK-43).** The skeleton also renders `AppShell`, so the art appears under the skeleton too. That is the intended first frame (no band appears late). Nothing extra is planned for it; TC-095 covers the first request.

### A2. Components and interfaces

```ts
// src/lib/heritage.ts  (pure: no React, no DOM globals at import time)
export type HeritageLevel = "normal" | "reduced" | "off";
/** SC9 switch-off: flip to false and every route returns "off". The one line. */
export const HERITAGE_ENABLED = true;
export const HERITAGE_LEVELS: Readonly<Record<string, HeritageLevel>>;   // PRD §4 table, exact paths
export function heritageLevelFor(pathname: string, enabled?: boolean): HeritageLevel;
//   normal: / /queue /disputes /invoices /payments
//   reduced: /emails /settings /drafts /audit, detail routes (/invoices/[id], /disputes/[id], /settings/eval — levels from TKT-46.02 exposure), unmapped default
//   off: /e2e-harness
//   Normalises a trailing slash; ignores ?query/#hash if passed; enabled=false → "off" for all.
export interface IdleHost {
  requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  navigator?: { connection?: { saveData?: boolean } };
}
/** Runs cb once at idle (rIC timeout 4000, else setTimeout 2500). No-op + no-op cancel when saveData. Returns cancel. */
export function scheduleIdleOnce(host: IdleHost, cb: () => void): () => void;

// src/components/shell/IndianHeritageBackground.tsx
"use client";
export function IndianHeritageBackground(): React.JSX.Element;
//   <div aria-hidden="true" data-heritage="" data-level={level} data-home={pathname === "/" ? "" : undefined}
//        data-idle={idle ? "" : undefined} className="pointer-events-none select-none absolute inset-x-0 top-0 -z-10">
//     <span data-heritage-preload="" />
//   </div>
//   useEffect: if level !== "off" → scheduleIdleOnce(window, () => setIdle(true)); return cancel.
```

- `data-home` is how CSS knows "Home" for the mobile rule without a second pure function. TKT-46.02 hard-wires `data-level="normal"`; TKT-46.03 switches to `heritageLevelFor`.
- No new runtime dependency. sharp 0.35.5 (devDependency, `make-icons.ts` precedent) and tsx are already present.

### A3. CSS (one block, `src/app/globals.css`)

Placed after the existing theme blocks and before `@theme inline` consumers, delimited `/* TASK-46 heritage — start */ … /* end */` so a revert is one block. Sketch (path A urls; path B swaps to `/heritage/...v1.*`):

```css
[data-heritage]{height:clamp(320px,42vw,620px);background:no-repeat center top/cover;
  background-image:image-set(url("../assets/heritage/heritage-light-desk.avif") type("image/avif"),
                             url("../assets/heritage/heritage-light-desk.webp") type("image/webp"));
  -webkit-mask-image:linear-gradient(to bottom,#000 55%,transparent);mask-image:linear-gradient(to bottom,#000 55%,transparent);
  transition:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) [data-heritage]{background-image:image-set(/* dark desk */)}}
:root[data-theme="dark"] [data-heritage]{background-image:image-set(/* dark desk */)}
[data-heritage][data-level="reduced"]{/* treatment on the same asset, tuned in TKT-46.06/08 (opacity or filter) */}
[data-heritage][data-level="off"]{display:none}
[data-heritage-preload]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
[data-heritage][data-idle] [data-heritage-preload]{background-image:/* opposite theme, desk ≥768 / strip <768 */}
@media (min-width:768px) and (max-width:1023px){[data-heritage]{background-position:38% top;/* height: see sign-off 4 */}}
@media (max-width:767px){[data-heritage]{display:none}
  [data-heritage][data-level="normal"][data-home]{display:block;height:clamp(160px,44vw,240px);background-image:/* strip, per theme */}}
@media (forced-colors:active){[data-heritage]{display:none}}
@media print{[data-heritage]{display:none}}
```

- `display:none` on the box means the browser never fetches its `background-image` (F5/F6/SC9 rely on this; TCs assert it from the network, not from CSS).
- The `image-set()` is written in the **standard** form. Lightning CSS (Next's CSS pipeline) may add a `-webkit-image-set()` fallback; TC-092 inspects the emitted CSS to see exactly what ships.

### A4. Asset pipeline

1. Master (3360×1440 PNG) → `scripts/encode-heritage.ts` → `heritage-{theme}-desk` 2400×1029 and `heritage-{theme}-strip` 1200×480 (crop of the 15–55% band around the Taj and gopuram), each AVIF (q45, effort 9, 4:2:0) + WebP (q70, smart subsample), sRGB, metadata stripped. `--width 2000` for the R3 fallback. Output dir = the path chosen by the TKT-46.02 verdict (`--out` flag, default path A).
2. `scripts/image-budget.ts` → exit 1 on desk > 60 KB, strip > 25 KB, or any of the 8 expected files missing (2 themes × 2 sizes × 2 formats).
3. Path A: Next emits `/_next/static/media/<name>.<hash>.<ext>`, served `public, max-age=31536000, immutable` (Next docs: `01-app/02-guides/self-hosting.md` "truly immutable assets … cannot be overridden"). Path B: `public/` defaults to `public, max-age=0` (`03-api-reference/03-file-conventions/public-folder.md` "Caching"), so B needs the `headers()` rule (`03-api-reference/05-config/01-next-config-js/headers.md`) and a manual `.v1` → `.v2` filename bump per art change.
4. **Next docs gap (R5).** Neither `01-getting-started/11-css.md` nor `03-api-reference/08-turbopack.md` documents relative `url()` rewriting inside `image-set()` with a custom `*.css` loader rule (`@tailwindcss/turbopack`, `next.config.ts`). That is exactly why TKT-46.02 is the tracer: the build output is the evidence.

### A5. Data flows

- **First paint:** HTML (SSR'd `data-level`) + CSS → THEME_SCRIPT sets `data-theme` → CSS selects one desk (or strip on mobile Home) image → one request, theme-correct.
- **Idle:** after mount, one `requestIdleCallback` (timeout 4 s) or `setTimeout(2500)` → `data-idle` → the preload span requests the opposite theme's image once. Skipped on `saveData`, on `off`, and implicitly under forced-colors/print (the box is `display:none`, so its descendant is not rendered).
- **Toggle:** ThemeToggle flips `data-theme` → CSS swaps `background-image` in the same style recalc; the opposite image is already cached after idle (F4).
- **Route change:** `usePathname()` changes → `data-level` attribute changes; no remount of the art box (it lives in AppShell, outside `<main>`).

### A6. Failure modes (and how we would know)

| Failure | Effect | Detection |
|---|---|---|
| Image 404 / decode failure | Canvas shows through (the art is decorative). No error UI. | TC-092/093 at build; e2e request assertions (status 200) in TC-095. |
| AVIF unsupported | `image-set` falls back to WebP. | TC-092 checks both entries and `type()` survive. |
| `url()` not rewritten (R5) | Broken path at runtime. | TC-092 fails on the build; switch to path B. |
| SW prunes the asset (R5b) | Art missing offline only; refetched online. | TC-094 static check of `STATIC_REF` vs emitted form; TC-124 offline. |
| Art too strong (R1) | Text contrast < 4.5:1. | TC-113/114 screenshot gate fails `pnpm e2e`. |
| Art over budget (N1) | Slower first paint. | TC-109/110 `image-budget` fails `test:all`. |
| Overlay stacking (R7) | Menu/dialog under the art. | TC-097/098 `elementFromPoint`. |
| Idle callback leaks | Callback after unmount. | TC-108 unit with fake timers. |

There is no runtime telemetry in this app (local-first demo). Observability is the gates above plus the QA screenshot index; a regression fails `pnpm test:all` rather than being noticed at 3 AM.

### A7. Sequencing (DAG, unchanged from Stage 4)

`46.1 → 46.2 (tracer) → {46.3, 46.5}`; `46.3 → {46.4, 46.6}`; `46.5 → 46.7 (+spend approval)`; `{46.4, 46.6, 46.7} → 46.8`. Critical path 46.1 → 46.2 → 46.3 → 46.6 → 46.8 (13 sp); 46.5 → 46.7 can run beside 46.3/46.6. Gantt: the Campfire hours-axis view renders this from the wired deps; no parallel Gantt.

### A8. E1 baseline (resolved by record, not by running the suite)

- **Base:** `f493a7b` (`task/38-emerald-redesign`). **Baseline at that commit, all green:** typecheck, eslint, vitest 1105/1105, build, `check:secrets`, `check:e2e-hooks`, `route-budget` (all 18 routes ≤ 300 KB). **Known-red:** e2e **TC-062** and **TC-079** (fixes on `task/38-e2e-fixes` as TASK-47 `d49d547` and TASK-48 `dd0ef32`, about to merge), and pre-existing failures in `eval/gates.eval.ts` (not caused by TASK-46).
- **Branch point:** cut `task/46-heritage-bg` from the `task/38-emerald-redesign` tip **after** TASK-47/48 merge (expected baseline then: only `eval/gates.eval.ts` red). If they have not merged when Stage 6 starts, cut from `f493a7b` and carry the three known-reds as the frozen baseline. Either way the base commit and its known-reds are written into HANDOFF in step 46.1.1. N6 = "no worse than this baseline".
- Note: `main` (`6e53103`) does not contain TASK-38; branching from `main` is not an option.

### A9. Rollback

- **Switch off (SC9, binding R3 rule):** `HERITAGE_ENABLED = false` in `src/lib/heritage.ts` — one line, no fetch, an inert hidden div.
- **Remove:** revert the AppShell diff (2 class tokens, 1 child, 1 import = 3 lines) and delete the CSS block; assets and scripts are inert without them.
- **Path B only:** remove the `headers()` entry. **SW:** untouched unless sign-off item 6 is approved.

### A10. Draft technical decisions (`TP-46.a…`)

Appended to `decisions.md` on `task/46-heritage-bg` in TKT-46.01's decisions commit, right after S25–S32, numbered **TP9, TP10, …** at append time (TP8 is last today; renumber if TASK-45 claims TP9+ first, never reorder). Format `## TPn · title — approved`. **Appended in TASK-46.1 as TP9–TP15 (a→TP9 … g→TP15), no renumbering needed; see EXE54.**

- **TP-46.a (= TP9) · `heritageLevelFor` + `HERITAGE_ENABLED` in `src/lib/heritage.ts` is the only level source and the switch-off.** Pure, unit-tested; the component and CSS never decide levels.
- **TP-46.b (= TP10) · Idle scheduling is a pure `scheduleIdleOnce(host, cb)` helper**, unit-tested with fake timers in the node `unit` project (the repo has no DOM test environment); the component only wires it in one `useEffect`.
- **TP-46.c (= TP11) · `data-home` attribute carries the mobile Home rule into CSS.** No second route function.
- **TP-46.d (= TP12) · L\*/contrast helpers live in `src/test/lstar.ts`** (unit-tested in `src/test/lstar.test.ts`, precedent `src/test/tokens.test.ts`), decode screenshots with sharp, and are imported by the Playwright spec.
- **TP-46.e (= TP13) · The contrast/prominence spec runs in one Playwright project** (`chromium-light`) and sets each theme itself (`emulateMedia` + `verilane-theme`), so both themes are covered once, not twice (sign-off item 5).
- **TP-46.f (= TP14) · SW compatibility is asserted, not assumed:** an e2e check runs `sw.js`'s own `STATIC_REF` against the heritage URLs in the served CSS (TC-094).
- **TP-46.g (= TP15) · Asset path A by default; path B only on a failed TKT-46.02 R5 check.** The verdict itself is an `EXE#` decision recorded in TKT-46.02.

### A11. Test architecture (5.5)

- **Single command:** `pnpm test:all`. TKT-46.05 inserts `pnpm image-budget` right after `pnpm route-budget`:
  `… && pnpm route-budget && pnpm image-budget && pnpm build:e2e && pnpm e2e --workers=1`.
- **Layers.** `unit` (vitest, `src/**/*.test.ts`, `scripts/**/*.test.ts` already globbed in `vitest.config.ts`): `src/lib/heritage.test.ts`, `src/test/lstar.test.ts`, `scripts/image-budget.test.ts`, `scripts/encode-heritage.test.ts`. `static`: `image-budget` on the committed assets. `e2e` (Playwright, production build with `NEXT_PUBLIC_E2E=1`, port `E2E_PORT` default 3100 — never 3000/3141/3900): `tests/e2e/heritage.spec.ts` (tracer, levels, preload, overlays), `tests/e2e/heritage-contrast.spec.ts` (SC1/SC2), `tests/e2e/heritage-pwa.spec.ts` (opts into `serviceWorkers: "allow"` like `pwa.spec.ts`; everything else keeps the config's `block`).
- **Fixtures:** `tests/e2e/fixtures/heritage/` — a darkened negative asset (TC-116), an oversized budget fixture is generated in a temp dir by the unit test (not committed).
- **Results:** screenshots, JSON measurements and QA sets under `/Volumes/E Drive/Dev/.scratch/task46/` (`E2E_TMPDIR` and `TMPDIR` exported there; Playwright `outputDir` stays `test-results`, gitignored). Measurements reuse TC-083's `save()` JSON pattern.
- **Traceability:** every automated test title starts with its `TC-###`. `grep -rn "TC-09[1-9]\|TC-1[01][0-9]\|TC-12[0-5]" src scripts tests` lists coverage.
- **Runtime budget:** baseline e2e 185 passed / 1 skipped with `--workers=1`. The contrast spec is ≈ 13 shell routes × 2 themes × ≤ 3 widths ≈ 60 screenshots in one project; target ≤ +90 s on `pnpm e2e`. The rest of the heritage specs run in both projects (cheap). If the contrast spec exceeds +120 s, split it per width with `test.describe.configure({ mode: "serial" })` and report before trimming coverage.
- **CI:** none exists in the repo; `test:all` is the gate, run locally per ticket and at Stage 8.

### A12. Security and privacy

No auth, data or network surface changes. `KIE_API_KEY` is used only in TKT-46.07, read from `.env.local`, never printed, logged or committed; generation scripts live in scratch, not the repo. `check:secrets` stays in `test:all`. No new e2e hook name is added (so `check:e2e-hooks` needs no change; see sign-off item 9).

---

## Part B · Per-ticket atomic tasks

Format: `46.N.k` = one 2–5 minute step. **Gate** must pass before the next step. TDD tickets write the failing test first. Every ticket ends with the common DoD from `tickets-TASK-46.md` (`pnpm typecheck && pnpm lint && pnpm test`, own TCs, `git diff <base>..HEAD --stat` shows only intended files, closing note: verified / assumed / untested). All commands run with `TMPDIR` and `E2E_TMPDIR` = `/Volumes/E Drive/Dev/.scratch/task46/tmp` and `E2E_PORT=3146` (any free port other than 3000/3141/3900).

### TASK-46.1 · Cut the branch and apply Design.md R2/R3 (TKT-46.01) · M-46.1 · TSK-46.01–.03

- **46.1.1** Worktree. `git worktree add .claude/worktrees/task-46-heritage-bg -b task/46-heritage-bg <base per A8>`. Write the base SHA and its known-reds into HANDOFF's TASK-46 section. **Gate:** `git -C <wt> log -1` shows the base.
- **46.1.2** LCP baseline for N4 (needed later, cheap now). In the worktree: `pnpm build && E2E_PORT=3146 pnpm exec playwright test perf.spec.ts -g TC-083 --project chromium-light` (production build, same type used in TKT-46.08). Copy the Home `lcpMs` JSON into `/Volumes/E Drive/Dev/.scratch/task46/baseline/`. **Gate:** file exists with a number.
- **46.1.3** Design.md R2/R3 commit. Append PRD §11.1 then §11.2 verbatim after "Revision R1" in `Design.md`. Commit `docs(TASK-46.1): Design.md — Revision R2 (retroactive) and R3 (heritage background, switch-off rule)`. **Gate:** TC-091.
- **46.1.4** Decisions commit. Append S25–S32 (from `milestones-TASK-46.md`) and TP-46.a–g (A10, as TP9+) to `decisions.md`; renumber if taken; update cross-references in both TASK-46 docs in the same commit. **Gate:** `grep -c "^## S2[5-9]\|^## S3[0-2]\|^## TP9" decisions.md` matches; diff is `decisions.md` + the two docs only.

### TASK-46.2 · Tracer: placeholder art through `image-set()` in AppShell (TKT-46.02) · M-46.1 · TSK-46.04–.07

- **46.2.1** Placeholder encode (throwaway). One-off `pnpm tsx -e` sharp call (command recorded in the commit body) from `.design/exploration/task-46/art/{light,dark}-normal.png` → `src/assets/heritage/heritage-{light,dark}-{desk,strip}.{avif,webp}` (desk 2400 wide, strip 1200×480 centre band). **Gate:** 8 files exist; `file` reports AVIF/WebP.
- **46.2.2** Component. Create `src/components/shell/IndianHeritageBackground.tsx` per A2 with `data-level="normal"` hard-wired and no idle effect yet. **Gate:** typecheck.
- **46.2.3** Mount. `src/components/shell/AppShell.tsx`: column `className="relative isolate flex min-w-0 flex-col"`, `<IndianHeritageBackground />` as first child, one import. **Gate:** `git diff -U0 src/components/shell/AppShell.tsx` = 3 changed/added lines (R6).
- **46.2.4** CSS. Add the A3 block (light default, both dark selectors, height, mask; no levels/breakpoints yet) to `src/app/globals.css`. **Gate:** `pnpm dev` on 3146 (Turbopack) renders art behind `/` in both themes (R5 d).
- **46.2.5** Write `tests/e2e/heritage.spec.ts` TC-092 (fetch the page's stylesheets, assert both `image-set` entries are hashed `/_next/static/media/heritage-…` and keep `type()`), TC-093 (asset `cache-control` contains `immutable` and `max-age=31536000`). **Gate:** `pnpm build && pnpm build:e2e && E2E_PORT=3146 pnpm e2e heritage.spec.ts` (R5 a,b,c,e).
- **46.2.6** R5b. Add TC-094 to the same spec: fetch `/sw.js` text, extract the `STATIC_REF` regex literal, assert it matches every heritage URL found in the served CSS (in the emitted form). Record the emitted form (absolute or relative) in HANDOFF. **If TC-094 fails: stop** — bring the `STATIC_REF` widening to the user (sign-off item 6); do not edit `sw.js`.
- **46.2.7** If R5 (46.2.5) fails → path B: move files to `public/heritage/heritage-{theme}-{desk|strip}.v1.{avif,webp}`, absolute `url("/heritage/…")` in CSS, add `{ source: "/heritage/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }` beside the `/sw.js` rule in `next.config.ts`; switch TC-092 to the path-B form; re-run 46.2.4–.6. Timebox: if neither path passes, stop and escalate.
- **46.2.8** No-flash. TC-095: three contexts — light (`colorScheme: light`, no stored theme), dark (`localStorage verilane-theme=dark` via `addInitScript`), system-dark (`colorScheme: dark`, nothing stored); `page.on("request")` filtered on `/heritage-/`; first match contains the theme's stem. TC-096: click ThemeToggle, then in the same `requestAnimationFrame` read `getComputedStyle([data-heritage]).backgroundImage` → new theme stem; `transitionDuration` is `0s`. **Gate:** both green in both projects.
- **46.2.9** Overlays. TC-097: open AccountMenu, an AlertDialog (Settings reset), and a Tooltip; `document.elementFromPoint` at each centre is inside the overlay. TC-098: `elementFromPoint` at a point over the art band returns a non-heritage element and a click there reaches it. **Gate:** green.
- **46.2.10** Exposure. With the Stage 3 method (`/Volumes/E Drive/Dev/.scratch/task46/scripts/shots2.mjs`, `stats2.mjs`), measure canvas exposure of `/invoices/[id]`, `/disputes/[id]`, `/settings/eval` at 1440×900; write the numbers to HANDOFF for 46.3.1. **Gate:** three numbers recorded.
- **46.2.11** Verdict. Record the `EXE#` decision (A or B, R5b result) in `decisions.md` and HANDOFF. Commit `feat(TASK-46.2): shell — heritage background tracer with placeholder art (path X)`. **Gate:** common DoD; production-build demo of `/` in both themes.

### TASK-46.3 · Route levels, responsive, forced-colors, print, switch-off (TKT-46.03) · M-46.2 · TSK-46.08–.10

- **46.3.1** Red: `src/lib/heritage.test.ts` — TC-099 (every PRD §4 row incl. detail routes at the levels from 46.2.10, trailing slash, `?q`), TC-100 (unmapped → `reduced`), TC-103a (`enabled=false` → `off` for every route in the table plus an unmapped one). **Gate:** fails (module missing).
- **46.3.2** Green: `src/lib/heritage.ts` (`HeritageLevel`, `HERITAGE_ENABLED`, `HERITAGE_LEVELS`, `heritageLevelFor`). **Gate:** `pnpm test src/lib/heritage.test.ts` green.
- **46.3.3** Wire: component uses `heritageLevelFor(usePathname())` and sets `data-home`. No `AppShell.tsx` edit (R6). **Gate:** typecheck; `git diff <46.2>..HEAD -- src/components/shell/AppShell.tsx` empty.
- **46.3.4** CSS: levels (`reduced` treatment, `off` none), tablet `38% top` (+ height per sign-off 4), mobile rule with `[data-home]` strip, forced-colors, print. **Gate:** visual check at 1440/768/390 on `pnpm dev`.
- **46.3.5** e2e in `heritage.spec.ts`: TC-101 (390 wide: heritage request on `/` only; none on `/queue`, `/drafts`), TC-102 (`emulateMedia({ forcedColors: "active" })` and `emulateMedia({ media: "print" })` before navigation → zero heritage requests and `display:none`), TC-103b (`/e2e-harness` → `data-level="off"`, zero requests), TC-104 (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding` → no `[data-heritage]` element). **Gate:** green both projects.
- **46.3.6** TC-105: `pnpm build && pnpm route-budget`; compare per-route gzip with the A8 baseline JSON; shell routes ≤ +1.5 KB, `/settings` ≤ 300 KB. Record in HANDOFF. **Gate:** within budget. Commit `feat(TASK-46.3): …`.

### TASK-46.4 · Idle preload of the other theme, Save-Data skip (TKT-46.04) · M-46.2 · TSK-46.11–.12

- **46.4.1** Red: add to `src/lib/heritage.test.ts` — TC-106a (rIC path: called once with `{timeout:4000}`; fallback `setTimeout(…,2500)` when rIC absent; cb runs once), TC-107a (`saveData: true` → nothing scheduled), TC-108 (cancel before fire → cb never runs, no throw) with `vi.useFakeTimers()`. **Gate:** red.
- **46.4.2** Green: `scheduleIdleOnce` in `src/lib/heritage.ts`. **Gate:** unit green.
- **46.4.3** Wire: component `useEffect` (skip when `off`) sets `data-idle`; cleanup calls cancel. CSS: preload span rules (opposite theme; desk ≥768, strip <768). **Gate:** typecheck + lint (`react-hooks/exhaustive-deps`).
- **46.4.4** e2e: TC-106b (after idle — `page.waitForFunction` on `[data-idle]` — exactly one request for the opposite-theme stem), TC-107b (`addInitScript` defines `navigator.connection = { saveData: true }` → no opposite-theme request within 5 s). **Gate:** green both projects. Commit `feat(TASK-46.4): …`.

### TASK-46.5 · Encode script and `image-budget` gate (TKT-46.05) · M-46.2 · TSK-46.13–.14

- **46.5.1** Red: `scripts/image-budget.test.ts` — exported `checkBudget(files: {name: string; bytes: number}[], expected: string[]): { ok: boolean; errors: string[] }`; TC-109 (desk 61 KB fails, message has name + size), TC-110 (strip 26 KB fails), TC-111 (missing expected file fails; empty dir fails). **Gate:** red.
- **46.5.2** Green: `scripts/image-budget.ts` (`DESK_BUDGET = 60*1024`, `STRIP_BUDGET = 25*1024`, `EXPECTED` = 8 names; `main()` reads the TKT-46.02 verdict directory, exits 1 on errors; route-budget.ts structure). `package.json`: `"image-budget": "tsx scripts/image-budget.ts"` and insert `&& pnpm image-budget` after `pnpm route-budget` in `test:all`. **Gate:** `pnpm image-budget` green on placeholders.
- **46.5.3** Red→green: `scripts/encode-heritage.ts` exporting `encodeHeritage(master: string, theme: "light"|"dark", opts: { out: string; width?: number }): Promise<string[]>`; `scripts/encode-heritage.test.ts` TC-112 (synthetic 3360×1440 sharp image in a temp dir under `TMPDIR` → 4 files, desk 2400×1029, strip 1200×480, formats avif/webp, no ICC/EXIF). **Gate:** unit green.
- **46.5.4** Demonstrate red then green: copy an oversized fixture into the asset dir in a scratch copy, run `pnpm image-budget` → exit 1; remove → exit 0. Paste both outputs in the ticket note. Commit `chore(TASK-46.5): …`.

### TASK-46.6 · Contrast and prominence gate (TKT-46.06) · M-46.2 · TSK-46.15–.17

- **46.6.1** Red→green helpers: `src/test/lstar.ts` — `srgbToLstar(r,g,b): number`, `contrastRatio(fg: RGB, bg: RGB): number`, `percentile(values: number[], p: number): number`, `prominence(lCanvas, lPeak, lText): number`, `decodeRegion(png: Buffer, box): Promise<RGB[]>` (sharp `.extract().raw()`). `src/test/lstar.test.ts` checks against known pairs (#000/#fff = 21, Design token pairs, Stage 3 L\* values). Ported from scratch `lstar.mjs`/`stats2.mjs`. **Gate:** unit green.
- **46.6.2** Spec skeleton `tests/e2e/heritage-contrast.spec.ts`: `test.skip(info.project.name !== "chromium-light")`; route list = every shell route with `heritageLevelFor ≠ off` + the three detail routes; themes via `emulateMedia` + `verilane-theme`; widths 1440, 768, 390 (390 only `/`). **Gate:** loops and screenshots land in scratch.
- **46.6.3** SC1: for each text element in the text zone (left 55% of the content column, top-bar bottom → +160 px, plus canvas-exposed headings), screenshot with `color: transparent !important` injected, take the 2nd/98th-percentile background luminance inside its box, assert ≥ 4.5:1 body / ≥ 3:1 large text and UI glyphs (TC-113 light, TC-114 dark). **Gate:** green on the Stage 3 placeholder.
- **46.6.4** SC2: outside the text zone, P per §6.2 (2nd-percentile darkest light / 98th brightest dark) → normal 8–15 %, reduced 4–8 %; light text-zone L\* ≥ 92.1; dark normal L\* 13–19.5, reduced 9.5–13 (TC-115). Tune the `reduced` CSS treatment here if it is out of band. **Gate:** green; if light normal cannot coexist with the text zone on a route, **stop** — the P ≤ 6.5 % fallback is a user decision (R1).
- **46.6.5** Negative: `tests/e2e/fixtures/heritage/negative-dark.webp` (placeholder darkened) served via `page.route(/heritage-light-desk/, …)` → TC-116 expects SC1 to fail (`expect(() => assertSc1(…)).toThrow()` pattern). **Gate:** green (i.e. the gate fails as designed). Record spec runtime vs the 185-test baseline. Commit `test(TASK-46.6): …`.

### TASK-46.7 · Generate and select panoramas with kie.ai (TKT-46.07) · M-46.3 · TSK-46.18–.21

- **46.7.1** Cost statement to the user: model (Nano Banana 2, TASK-39 path), 6 calls round 1, per-call cost, total. **No call before written approval.** Record it in HANDOFF.
- **46.7.2** Round 1 in scratch (`/Volumes/E Drive/Dev/.scratch/task46/gen/`): Design §6.2 prompts verbatim, 3 per theme, same seed family, dark generated separately. Key from `.env.local`, never echoed. **Gate:** 6 candidates on disk; spend recorded.
- **46.7.3** Score every candidate with the PRD §6.3 rubric in order (accuracy → composition → tone via `src/test/lstar.ts` → bytes via `encode-heritage.ts` + `image-budget` on a scratch out dir → taste) into `gen/rubric.md` (TC-118). Review pack beside the TASK-45 splash final frame.
- **46.7.4** User picks and signs off accuracy in writing (TC-117, SC8). If none pass: inpaint per landmark first, then round 2/3, each with its own approval. **Stop after round 3** and escalate. Repo diff: none (scratch only).

### TASK-46.8 · Final art, tone calibration, ship evidence (TKT-46.08) · M-46.3 · TSK-46.22–.25

- **46.8.1** `pnpm tsx scripts/encode-heritage.ts <master> light|dark --out <verdict dir>`; delete placeholders; `pnpm image-budget` (TC-119). **Gate:** green.
- **46.8.2** Tone: run `heritage-contrast.spec.ts` on the finals; adjust only the `reduced` treatment (and, per Design §6.1, re-calibrate the master tint against rendered L\*) until TC-120 is green at all widths and themes.
- **46.8.3** Evidence: TC-121 (Home LCP vs 46.1.2 baseline, same build type, ±5 %), TC-122 (CLS: `layout-shift` entries attributable to `[data-heritage]` = 0), TC-123 (existing TC-080 axe run + compare violations with base: zero new), TC-105 re-run, TC-097/098 re-run, TC-095 re-run.
- **46.8.4** TC-124 offline: `heritage-pwa.spec.ts` (`serviceWorkers: "allow"`), one online visit to `/`, `context.setOffline(true)`, reload → art request served from SW cache (computed image loaded, `naturalWidth` via an `Image()` probe). Under path B a failure is reported to the user (PRD §5.4), not patched.
- **46.8.5** TC-125 SC7: if TASK-45 has landed, cold load with the cinematic path, at `html[data-splash=done]` the heritage image is complete; else mark *Blocked — TASK-45 not merged* in the TC and HANDOFF.
- **46.8.6** QA screenshot set (every route × theme × width) to `/Volumes/E Drive/Dev/.scratch/task46/qa/`, indexed in HANDOFF for Stage 7. `pnpm test:all` vs the A8 baseline (N6). Commit `feat(TASK-46.8): …`.

---

## Part C · Stage 6 execution notes

- One worktree (`task/46-heritage-bg`), one implementer subagent per ticket, sequential along the critical path; 46.5 may run beside 46.3 only if both stay off each other's files (`globals.css` belongs to 46.3, `package.json` to 46.5).
- Rebase rule (R6): TASK-44 and TASK-41 also edit shell files. Whoever merges second rebases; the heritage AppShell diff stays exactly 3 lines.
- `AGENTS.md`: `next dev` may re-add its Next.js block to `AGENTS.md`; commit it with the work rather than fighting it.
- Stop conditions: 46.2 R5 and R5b failures, 46.6 R1 conflict, 46.7 spend approval and round 3, 46.8 offline gap under path B — each returns to the user.

## Part D · Traceability

| Ticket | Campfire | Steps | TCs |
|---|---|---|---|
| TKT-46.01 | TASK-46.1 | 46.1.1–.4 | TC-091 |
| TKT-46.02 | TASK-46.2 | 46.2.1–.11 | TC-092–TC-098 |
| TKT-46.03 | TASK-46.3 | 46.3.1–.6 | TC-099–TC-105 |
| TKT-46.04 | TASK-46.4 | 46.4.1–.4 | TC-106–TC-108 |
| TKT-46.05 | TASK-46.5 | 46.5.1–.4 | TC-109–TC-112 |
| TKT-46.06 | TASK-46.6 | 46.6.1–.5 | TC-113–TC-116 |
| TKT-46.07 | TASK-46.7 | 46.7.1–.4 | TC-117–TC-118 |
| TKT-46.08 | TASK-46.8 | 46.8.1–.6 | TC-119–TC-125 |

## Part E · Stage 5 sign-off items

| # | Item | Recommendation |
|---|---|---|
| 1 | **E1 baseline and branch point** (A8) | Approve: cut from the `task/38-emerald-redesign` tip after TASK-47/48 merge; else from `f493a7b` with TC-062, TC-079 and `eval/gates.eval.ts` as frozen known-reds. |
| 2 | **TC-091–TC-125 allocated to TASK-46** (35 IDs, one per TC-46.nn) | Approve. A reservation line goes into root `test-cases.md` so TASK-45 starts at TC-126. |
| 3 | **TP decisions** drafted as TP-46.a–g, appended as TP9+ on the branch in TKT-46.01 (with S25–S32) | Approve. Appending to root `decisions.md` now would race TASK-45 on the shared checkout. |
| 4 | **Tablet height conflict:** PRD §3.5 says `clamp(320px,42vw,620px)` for desktop **and** tablet (322–430 px at 768–1023); Design-TASK-46 §4/§7 says a fixed `300px` on tablet | Use Design's `300px`: it is the later, mockup-measured spec and the Stage 3 exposure numbers assume it. The PRD line is treated as superseded in the TKT-46.01 decisions commit. |
| 5 | **Contrast spec in one Playwright project**, both themes set inside the test (TP-46.e) | Approve: same coverage, half the runtime. |
| 6 | **R5b `sw.js` path:** if TC-094 shows the emitted URL is relative (`../media/…`), widening `STATIC_REF` is a shared-infrastructure change | Pre-approve nothing; stop at 46.2.6 and bring the one-line regex change (plus a check that `pwa.spec.ts` stays green) to you. |
| 7 | **Path A default**, B only on a failed R5 check (TP-46.g) | Approve. |
| 8 | **e2e runtime budget:** heritage specs ≤ +90 s on `pnpm e2e --workers=1`; above +120 s, report before trimming | Approve. |
| 9 | **SC9 e2e via `/e2e-harness`** (already `off` by the table) plus the `enabled=false` unit test, instead of a new `?__heritage=off` test hook | Approve: proves the `off` render path fetches nothing without adding a hook that `check:e2e-hooks` would then have to police. Alternative: add the hook and `"__heritage"` to `HOOKS` in `scripts/check-e2e-hooks.ts`. |
