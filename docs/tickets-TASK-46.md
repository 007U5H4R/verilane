# TASK-46 — Tickets (Indian heritage background system)

> Stage 4 · Problem Breakdown · Campfire TASK-46 · 2026-11-02 · **APPROVED 2026-11-02** (Stage 4 gate, all 8 items)
> Milestones and DAG: [`milestones-TASK-46.md`](milestones-TASK-46.md). Requirements: Solution-PRD-TASK-46 §12 (F1–F7, N1–N6), §13 (SC1–SC9), §15 (R1–R10).
> IDs are provisional (`TKT-46.xx`, `TSK-46.xx`, `TC-46.xx`). Campfire native IDs are created after this gate; `TC-###` numbers are allocated in Stage 5.
> **Stage 5 mapping (2026-11-02):** TKT-46.0N = Campfire **TASK-46.N** (N = 1…8, subtasks of TASK-46, deps wired). TC-46.nn = **TC-(090+nn)**, i.e. TC-46.01 → TC-091 … TC-46.35 → TC-125 (full cases: [`test-cases-TASK-46.md`](test-cases-TASK-46.md); plan: [`technical-plan-TASK-46.md`](technical-plan-TASK-46.md)).

## Summary

| Ticket | Title | Type | Priority | P | Milestone | Blocked by | sp |
|---|---|---|---|---|---|---|---|
| TKT-46.01 | Cut the TASK-46 branch and apply Design.md R2/R3 | docs | High | P1 | M-46.1 | E1 (green base) | 1 |
| **TKT-46.02** | **Tracer: placeholder art through `image-set()` in AppShell (kill R5/R5b/R7)** | spike | High | P1 | M-46.1 | 01 | 3 |
| TKT-46.03 | Route levels, responsive rules, forced-colors, print and switch-off | feature | High | P1 | M-46.2 | 02 | 3 |
| TKT-46.04 | Idle preload of the other theme, skipped on Save-Data | feature | Medium | P2 | M-46.2 | 03 | 2 |
| TKT-46.05 | Encode script and `image-budget` gate in `test:all` | chore | High | P1 | M-46.2 | 02 | 2 |
| TKT-46.06 | Contrast and prominence screenshot gate (SC1/SC2), both themes, 3 widths | task | High | P1 | M-46.2 | 03 | 3 |
| TKT-46.07 | Generate and select the heritage panoramas with kie.ai (user-approved spend) | task | High | P1 | M-46.3 | 05 + spend approval | 3 |
| TKT-46.08 | Swap in the final art, calibrate tone, and collect ship evidence | feature | High | P1 | M-46.3 | 04, 06, 07 | 3 |

Total: 8 tickets · 20 sp.

### Common DoD (every ticket)
- Work is on `task/46-heritage-bg` in its own worktree. The commit subject is imperative and carries the Campfire ID.
- `pnpm typecheck && pnpm lint && pnpm test` pass, plus the ticket's own TCs. `test:all` is no worse than the E1 baseline.
- `git diff <base>..HEAD --stat` shows only the files this ticket intends.
- No secrets in code, logs or fixtures. `KIE_API_KEY` is read from `.env.local` only and is never printed.
- Scratch output, screenshots and temp files go to `/Volumes/E Drive/Dev/.scratch/task46/`, with `TMPDIR` exported there. Servers on :3000, :3141 and :3900 are not touched; e2e and preview builds use their own port.
- What is verified, what is assumed and what is untested is stated in the ticket's closing note.

---

## M-46.1 · Foundation and tracer bullet

### TKT-46.01 · Cut the TASK-46 branch and apply Design.md R2/R3
- **Type:** docs · **Priority:** High (P1) · **Milestone:** M-46.1 · **Blocked by:** E1 · **sp:** 1
- **Objective:** start the branch from a known baseline, with the approved design exception in place before any code that depends on it.
- **Acceptance criteria:**
  - `task/46-heritage-bg` is cut in its own worktree from the commit the user names for E1. The `test:all` result at that commit is recorded in HANDOFF as the baseline, including any known-red gates.
  - The **first commit** appends PRD §11.1 (Revision R2) and then §11.2 (Revision R3, with the binding switch-off rule) to `Design.md`, verbatim, after "Revision R1". The diff touches only `Design.md`.
  - A second commit appends S25–S32 from `milestones-TASK-46.md` to `decisions.md`, renumbered if a sibling branch has claimed those numbers by then. The cross-references in both TASK-46 docs are updated in the same commit.
- **DoD:** common DoD. No code changes.
- **Tasks:** TSK-46.01 cut worktree + record baseline · TSK-46.02 Design.md R2/R3 commit · TSK-46.03 decisions append.
- **TC:** TC-46.01 (Design.md diff is exactly §11.1 + §11.2, checked by a text diff against the PRD).
- **Notes:** R9. The R2 text was confirmed by the TASK-38 owner in PRD §9.12, so no new review is needed. If TASK-45 is also appending to `decisions.md`, expect a trivial merge conflict. Resolve it by renumbering, never by reordering.

### TKT-46.02 · Tracer: placeholder art through `image-set()` in AppShell (kill R5/R5b/R7) — TRACER BULLET
- **Type:** spike · **Priority:** High (P1) · **Milestone:** M-46.1 · **Blocked by:** TKT-46.01 · **sp:** 3
- **Objective:** prove the riskiest assumption end-to-end before anything is built on it. Does Next 16.4.3 Turbopack (with Lightning CSS and the custom `@tailwindcss/turbopack` CSS loader) rewrite a relative `url()` inside `image-set()` to a hashed, immutable `/_next/static/media/*` URL that the service worker keeps? The bundled Next docs are silent on this, and the repo has no prior relative `url()` in `globals.css` (TASK-37 used an absolute `public/` URL).
- **Acceptance criteria:**
  - **Placeholder:** the Stage 3 calibrated placeholders (`.design/exploration/task-46/art/{light,dark}-normal.png`) are encoded once with sharp to AVIF+WebP into `src/assets/heritage/` (path A). The placeholder is marked throwaway and replaced in TKT-46.08.
  - **Mount:** `IndianHeritageBackground` exists per the PRD §3 contract (`aria-hidden`, `pointer-events-none select-none absolute inset-x-0 top-0 -z-10`, `data-heritage`, `data-level`, the preload `<span>`). It is mounted as the first child of AppShell's content column, which gains `relative isolate`. `data-level` is hard-wired to `"normal"` in this ticket. The **AppShell diff is exactly 2 class tokens + 1 child element + 1 import (R6)**, and the PR notes the TASK-44/TASK-41 rebase rule.
  - **CSS:** a `/* TASK-46 heritage */` block in `globals.css` with `image-set(url(...) type("image/avif"), url(...) type("image/webp"))`, the light default, both dark selectors, the box height `clamp(320px,42vw,620px)` and the bottom mask.
  - **R5 evidence** from `pnpm build` (TMPDIR on the E Drive):
    - (a) both `image-set` entries in the emitted CSS are rewritten to hashed `/_next/static/media/*`;
    - (b) the `type()` hints survive;
    - (c) a production server serves those files with `Cache-Control: public, max-age=31536000, immutable`;
    - (d) the dev server (Turbopack) renders it too;
    - (e) `pnpm build:e2e` works.
  - **R5b evidence:** the exact emitted URL form (absolute or relative) is recorded. A cold load, then SW activate, then a second build-hash prune keeps the heritage file in the SW cache. If it is pruned, stop and bring the `STATIC_REF` widening to the user (milestones sign-off item 6). Do not edit `sw.js` unasked.
  - **If R5 fails:** switch to path B: `public/heritage/heritage-{light|dark}-desk.v1.{avif,webp}` with absolute URLs, plus one `headers()` rule in `next.config.ts` for `/heritage/:path*` (`public, max-age=31536000, immutable`) next to the existing `/sw.js` rule. Re-run (c)–(e).
  - **The verdict** (A or B, and R5b) is recorded as an `EXE#` decision and in HANDOFF. Later tickets read their asset paths from it.
  - **No-flash smoke (SC4):** an e2e cold load in light, dark and system-dark modes asserts that the first heritage request URL matches the theme. A toggle changes the computed `background-image` in the same frame, with no transition.
  - **R7:** e2e with AccountMenu open, an AlertDialog open and a Tooltip shown. The menu, dialog and tooltip are topmost at their centre point (`elementFromPoint`), and a click over the art reaches the element underneath (SC3 smoke).
  - **Exposure:** the canvas exposure of `/invoices/[id]`, `/disputes/[id]` and `/settings/eval` at 1440×900 is measured with the Stage 3 method and recorded for TKT-46.03.
- **DoD:** common DoD. A demo on a production build: placeholder art behind `/` in both themes, the verdict written down.
- **Tasks:** TSK-46.04 placeholder encode + component + mount · TSK-46.05 build/header/SW inspection (R5, R5b) · TSK-46.06 no-flash + stacking e2e · TSK-46.07 detail-route exposure.
- **TC:** TC-46.02 (emitted CSS: hashed URLs, both entries, `type()` kept), TC-46.03 (immutable header on the asset), TC-46.04 (SW keeps the asset across a prune), TC-46.05 (SC4 first-request theme match, 3 modes), TC-46.06 (toggle swap, same frame), TC-46.07 (R7 overlays topmost), TC-46.08 (SC3 click-through).
- **Notes:** this is the tracer because every later ticket (paths in the encode script and budget gate, selectors in the levels CSS, the URLs that SW and no-flash depend on) branches on its outcome, and it costs nothing. Generating art first would spend money on assets whose delivery path might not work. Timebox: if neither path works within the ticket, stop and escalate. Do not invent a third path.

---

## M-46.2 · Behaviour on placeholder art

### TKT-46.03 · Route levels, responsive rules, forced-colors, print and switch-off
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-46.2 · **Blocked by:** TKT-46.02 · **sp:** 3
- **Objective:** the art appears at the right strength on every route and viewport, and disappears where it must, all from one pure function.
- **Acceptance criteria:**
  - `src/lib/heritage.ts` exports a pure `heritageLevelFor(pathname): "normal" | "reduced" | "off"` implementing PRD §4. The detail routes use the levels measured in TKT-46.02; the default is `reduced`. It has unit tests for every row, plus an unmapped route, trailing slashes and query-free paths.
  - The component reads `usePathname()` and sets `data-level`. `off` is `display:none`, so nothing is fetched.
  - **Reduced** is a CSS treatment on the same asset (milestones sign-off item 7). TKT-46.06 measures that it is in band.
  - **Tablet (768–1023):** the same desktop asset at `background-position: 38% top`.
  - **Mobile (<768):** `display:none` unless the level is `normal` **and** the route is Home. On Home it uses the strip asset at `clamp(160px,44vw,240px)`. Until TKT-46.08, the strip is a placeholder crop.
  - `@media (forced-colors: active)` and `@media print` hide `[data-heritage]` (F6).
  - **SC9:** a unit test proves that mapping every route to `off` produces `off` for all routes. An e2e run with a test-only override shows no heritage request on any route.
  - **F1:** auth routes (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`) never render `[data-heritage]`.
  - **N2:** `route-budget` shows ≤ +1.5 KB gzip on shell routes, and `/settings` stays ≤ 300 KB.
  - **R6:** no further edits to `AppShell.tsx` beyond TKT-46.02's.
- **DoD:** common DoD.
- **Tasks:** TSK-46.08 `heritageLevelFor` + unit tests · TSK-46.09 CSS for levels and breakpoints · TSK-46.10 forced-colors/print/switch-off e2e.
- **TC:** TC-46.09 (route table unit), TC-46.10 (unmapped defaults to reduced), TC-46.11 (F5: mobile fetches only on Home), TC-46.12 (F6: forced-colors and print fetch nothing), TC-46.13 (SC9 switch-off), TC-46.14 (F1: no mount on auth routes), TC-46.15 (N2 route-budget delta).
- **Notes:** Playwright can emulate forced colors and print media. The fetch assertions use `page.on("request")` filtered on the heritage filename stem, so they work for both path A and path B.

### TKT-46.04 · Idle preload of the other theme, skipped on Save-Data
- **Type:** feature · **Priority:** Medium (P2) · **Milestone:** M-46.2 · **Blocked by:** TKT-46.03 · **sp:** 2
- **Objective:** a theme toggle never shows a blank band, at the cost of one idle-priority fetch.
- **Acceptance criteria:**
  - On mount, `requestIdleCallback(cb, { timeout: 4000 })` runs once, falling back to `setTimeout(cb, 2500)`. It sets `data-idle`, is cleaned up on unmount (no callback after unmount), and has no loop or retry (the stop rule).
  - It is skipped when `navigator.connection?.saveData === true`.
  - CSS gives `[data-heritage][data-idle] [data-heritage-preload]` the **opposite** theme's image. The preload span is 1×1px, `opacity:0`, absolute. It uses the desktop asset at ≥768px and the strip below (and only on Home, since other mobile routes are off).
  - Off-level routes and forced-colors/print preload nothing.
- **DoD:** common DoD.
- **Tasks:** TSK-46.11 idle hook + cleanup · TSK-46.12 preload CSS + e2e.
- **TC:** TC-46.16 (F4: exactly one other-theme request after idle), TC-46.17 (Save-Data: no preload request), TC-46.18 (unmount before idle: no request, no error).
- **Notes:** Playwright can't set `saveData` natively. Stub `navigator.connection` with an init script. Unit-test the hook with fake timers.

### TKT-46.05 · Encode script and `image-budget` gate in `test:all`
- **Type:** chore · **Priority:** High (P1) · **Milestone:** M-46.2 · **Blocked by:** TKT-46.02 · **sp:** 2
- **Objective:** byte weight is enforced mechanically from the start, and the final art goes through one repeatable encode step.
- **Acceptance criteria:**
  - `scripts/encode-heritage.ts` (sharp 0.35.5, already a dependency) turns a 3360×1440 master into:
    - `heritage-{theme}-desk` at 2400×1029;
    - `heritage-{theme}-strip` at 1200×480, cropped from the 15–55% band around the Taj and gopuram;
    - AVIF (q≈45, effort 9, 4:2:0) and WebP (q≈70, smart subsample);
    - converted to sRGB with the profile stripped.
    It writes to the path chosen in TKT-46.02. It accepts `--width 2000` for the R3 fallback.
  - `scripts/image-budget.ts` fails (exit 1, with file and size in the message) if any `heritage-*-desk.*` is > 60 KB or any `heritage-*-strip.*` is > 25 KB. It also fails if an expected file is **missing**, so the gate can't pass on an empty directory.
  - `package.json` gets an `image-budget` script, wired into `test:all` immediately after `route-budget`.
  - Both scripts run green on the placeholder assets.
- **DoD:** common DoD. The gate is demonstrated red with an oversized fixture, then green.
- **Tasks:** TSK-46.13 encode script · TSK-46.14 budget script + `test:all` wiring + unit test.
- **TC:** TC-46.19 (gate fails > 60 KB desk), TC-46.20 (gate fails > 25 KB strip), TC-46.21 (gate fails on a missing file), TC-46.22 (encode output dimensions and format).

### TKT-46.06 · Contrast and prominence screenshot gate (SC1/SC2), both themes, 3 widths
- **Type:** task · **Priority:** High (P1) · **Milestone:** M-46.2 · **Blocked by:** TKT-46.03 · **sp:** 3
- **Objective:** make "every text pixel ≥ 4.5:1 over the art" a gate that can fail, not a claim. This is net-new tooling: `tests/e2e` has no screenshot or contrast tests today.
- **Acceptance criteria:**
  - A Playwright spec runs every shell route in light and dark, at 1440, 768 and 390 widths (390 only where the art is mounted).
  - **SC1:** for text in the text zone (the left ~55% of the content column, from the top-bar bottom to ~160px below, plus any canvas-exposed heading), it computes contrast between each text element's colour and the 2nd/98th-percentile background pixel behind its box in a screenshot with the text hidden (or with the art on versus off). It asserts ≥ 4.5:1 for body text and ≥ 3:1 for large text and UI glyphs.
  - **SC2:** it computes P = (L\*canvas − L\*art_peak)/(L\*canvas − L\*text) with the PRD §6.2 percentile peak, outside the text zone. It asserts normal 8–15% and reduced 4–8%, plus light text-zone L\* ≥ 92.1 and the dark bands (normal L\* 13–19.5, reduced 9.5–13).
  - **Proven to fail:** a darkened fixture asset makes SC1 fail.
  - It reuses the Stage 3 L\* method (`/Volumes/E Drive/Dev/.scratch/task46/scripts/lstar.mjs`, `stats2.mjs`), ported into the repo as test helpers.
  - Runs inside the `pnpm e2e` step of `test:all`. Screenshots are written under the E Drive scratch directory, not committed.
- **DoD:** common DoD. It is green on the Stage 3 calibrated placeholder.
- **Tasks:** TSK-46.15 L\*/contrast helpers + unit tests · TSK-46.16 route × theme × width spec · TSK-46.17 negative fixture.
- **TC:** TC-46.23 (SC1 light), TC-46.24 (SC1 dark), TC-46.25 (SC2 bands per level), TC-46.26 (negative fixture fails).
- **Notes:** R1 lives here. If the light normal band can't coexist with the text zone on a route, the PRD fallback is a global P ≤ 6.5%, and that is a user decision, not a silent tweak. Watch the e2e runtime. The current baseline is 185 passed, 1 skipped, with `--workers=1`.

---

## M-46.3 · Final art and ship readiness

### TKT-46.07 · Generate and select the heritage panoramas with kie.ai (user-approved spend)
- **Type:** task · **Priority:** High (P1) · **Milestone:** M-46.3 · **Blocked by:** TKT-46.05, plus explicit user approval of the spend · **sp:** 3
- **Objective:** accurate, on-brand masters for both themes, chosen by the user against a fixed rubric.
- **Acceptance criteria:**
  - **Before the first call:** the model, the call count (6 for round 1) and the per-call cost are stated, and the user approves. **No call happens without this.** Each further round needs its own approval.
  - The `KIE_API_KEY` is read from `.env.local` and never echoed, logged or written to files.
  - Prompts are taken from Design-TASK-46 §6.2 verbatim. 3 variations per theme, using the same seed family. Dark is generated as its own image, not inverted.
  - **Rubric in order (PRD §6.3).** Any failure eliminates the candidate:
    1. accuracy, with the user as cultural reviewer: gopuram not shikhara, chariot drawn by elephants, Mysore present, no birds, people, text or flags;
    2. composition: skyline at 15–55% height, mist-only text zone, mist breaks, no shared ground line, edges dissolving across the outer 6%;
    3. tone: measured P in band and text-zone contrast ≥ 4.5:1, using TKT-46.06's helpers;
    4. bytes: under budget after `encode-heritage.ts`;
    5. taste: the user's pick, shown beside the TASK-45 splash final frame (Design §8).
  - **Stop rule:** at most 3 rounds. Per-landmark inpainting is tried before regenerating everything. After round 3, escalate to the user.
  - Candidates, masters and the scored rubric go to `/Volumes/E Drive/Dev/.scratch/task46/gen/`. Only the chosen masters move on to TKT-46.08.
  - **SC8:** the user's written accuracy sign-off is recorded in HANDOFF.
- **DoD:** common DoD. The spend actually incurred is recorded next to the approval.
- **Tasks:** TSK-46.18 cost statement + approval · TSK-46.19 round 1 generation · TSK-46.20 rubric scoring + review pack · TSK-46.21 (conditional) inpaint/round 2–3.
- **TC:** TC-46.27 (SC8 sign-off recorded), TC-46.28 (rubric sheet complete for every candidate).
- **Notes:** R2 and R10. TASK-39 used kie.ai (Nano Banana 2) for the onboarding art, so the call path is known. Master masks and the tint follow the Design §6.1 finding: calibrate `linear(a,b)` against the target **rendered** L\* and verify with a stats script.

### TKT-46.08 · Swap in the final art, calibrate tone, and collect ship evidence
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-46.3 · **Blocked by:** TKT-46.04, TKT-46.06, TKT-46.07 · **sp:** 3
- **Objective:** the real panoramas ship inside every gate, with evidence for each success criterion on the real thing.
- **Acceptance criteria:**
  - The chosen masters are encoded with `encode-heritage.ts` and replace the placeholders. The placeholder files are deleted. `image-budget` is green (N1, SC5).
  - The reduced treatment is tuned so the SC1/SC2 gate passes on the finals in both themes at all three widths.
  - **Evidence collected:**
    - SC4 cold load per mode;
    - SC7: with the cinematic splash on a cold load, the art is painted when `data-splash=done`, if TASK-45 has landed; otherwise noted as pending;
    - N3: CLS contribution 0;
    - N4: Home LCP within ±5% of the pre-TASK-46 baseline, measured on the same build type;
    - N5: zero new axe violations;
    - N2: route-budget;
    - R7: re-run with the final art.
  - **SW cold-offline:** the heritage art renders offline after one online visit. Under path B, a gap here is reported to the user, who decides on adding `/heritage/` to the SW prefixes (PRD §5.4).
  - The QA screenshot set (every route × theme × width) goes to the E Drive scratch directory and is indexed in HANDOFF for Stage 7.
  - **N6:** `test:all` is green, or no worse than the E1 baseline, with the difference explained.
- **DoD:** common DoD. A demo on the real build in both themes and at mobile width.
- **Tasks:** TSK-46.22 encode + swap · TSK-46.23 tone tuning to the gate · TSK-46.24 perf/a11y/offline evidence · TSK-46.25 QA screenshot set + HANDOFF index.
- **TC:** TC-46.29 (N1/SC5 on the finals), TC-46.30 (SC1/SC2 on the finals), TC-46.31 (N4 LCP), TC-46.32 (N3 CLS), TC-46.33 (N5 axe), TC-46.34 (SW cold-offline), TC-46.35 (SC7 splash first frame).

---

## Requirement coverage

| Req | Ticket(s) | | Req | Ticket(s) |
|---|---|---|---|---|
| F1 | 03 | | N1 | 05, 08 |
| F2 | 02, 08 | | N2 | 03, 08 |
| F3 | 02 | | N3 | 08 |
| F4 | 04 | | N4 | 08 |
| F5 | 03 | | N5 | 08 |
| F6 | 03 | | N6 | all |
| F7 | 03 | | SC1/SC2 | 06, 08 |
| SC3 | 02 | | SC4 | 02, 08 |
| SC5 | 05, 08 | | SC6 | 03, 08 |
| SC7 | 08 | | SC8 | 07 |
| SC9 | 03 | | Design.md R2/R3 | 01 |

## Campfire tickets (created after the Stage 4 gate as TASK-46.1 … TASK-46.8, row # = N)

Create from the project root as subtasks of TASK-46 (`--parent TASK-46`), with `--dep` mirroring "Blocked by" once the earlier IDs exist:

| # | Title (imperative) | --type | --priority | -l | Depends on |
|---|---|---|---|---|---|
| 1 | Cut the TASK-46 branch and apply Design.md R2/R3 revisions | docs | High | P1 | — |
| 2 | Prove image-set() asset hashing and AppShell mount with placeholder art (tracer) | spike | High | P1 | 1 |
| 3 | Add route levels, responsive, forced-colors, print and switch-off for heritage art | feature | High | P1 | 2 |
| 4 | Preload the other theme's heritage art at idle, skipping Save-Data | feature | Medium | P2 | 3 |
| 5 | Add heritage encode script and image-budget gate to test:all | chore | High | P1 | 2 |
| 6 | Add contrast and prominence screenshot gate for heritage art | task | High | P1 | 3 |
| 7 | Generate and select heritage panoramas with kie.ai after spend approval | task | High | P1 | 5 |
| 8 | Ship final heritage art with tone calibration and release evidence | feature | High | P1 | 4, 6, 7 |
