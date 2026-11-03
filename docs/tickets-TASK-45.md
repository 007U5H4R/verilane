# TASK-45 — Tickets (cinematic lighthouse splash)

> Stage 4 · Problem Breakdown · Campfire TASK-45 · 2026-11-02 · **APPROVED 2026-11-02**
> Milestones and DAG: [`milestones-TASK-45.md`](milestones-TASK-45.md). Requirements: Solution-PRD-TASK-45 §4 (R1–R13), §5 (success criteria 1–5), §6 (test matrix), §7 (NFRs), §8 (risks); Design-TASK-45 §5–§13, §18 (Freeze + 4 Stage 6 requirements).
> **Status:** **APPROVED (2026-11-02).** All 10 sign-off items as recommended; E1 amended: cut from the green merged task/38 head (eb85789+), not f493a7b. User set TKT-45.08/.09 to **High/P1** (final art required before release). Campfire: TKT-45.01–.10 = TASK-45.1–45.10 (subtasks of TASK-45, deps per DAG).
> IDs are provisional (`TKT-45.xx`, `TC-45.xx`). Campfire IDs are created by the caller after this gate; `TC-###` numbers are allocated in Stage 5.

## Summary

| Ticket | Title | Type | Priority | P | Milestone | Blocked by | sp |
|---|---|---|---|---|---|---|---|
| TKT-45.01 | Cut the TASK-45 branch; append decisions and Design.md R4 | docs | High | P1 | M-45.1 | E1 (green base) | 1 |
| **TKT-45.02** | **Tracer: bare overlay + inline runtime + real phase events + skip (kill RK1/RK2)** | spike | High | P1 | M-45.1 | 01 | 5 |
| TKT-45.03 | Once-per-tab trigger matrix, client entry from onboarding, R7 pinning | feature | High | P1 | M-45.2 | 02 | 3 |
| TKT-45.04 | Event-driven bar, status copy, stall states, hold and ceiling | feature | High | P1 | M-45.2 | 02 | 3 |
| TKT-45.05 | Scene and choreography on placeholder atmosphere (F01–F07, 900/600) | feature | High | P1 | M-45.2 | 04 | 5 |
| TKT-45.06 | Reduced-motion path (static frame, 1 s, instant cut) | feature | High | P1 | M-45.2 | 05 | 2 |
| TKT-45.07 | `splash-budget` gate in `test:all` | chore | High | P1 | M-45.2 | 02 | 2 |
| TKT-45.08 | Generate G1/G2 art with kie.ai (per-round user-approved spend) | task | High | P1 | M-45.3 | 05, 07 + spend approval | 3 |
| TKT-45.09 | Encode and swap in the final art within 60/30 KB | feature | High | P1 | M-45.3 | 06, 08 | 2 |
| TKT-45.10 | Release evidence: a11y, perf/INP, breakpoints, handshake, full e2e | task | High | P1 | M-45.3 | 03, 09 | 3 |

Total: 10 tickets · 29 sp.

Art is P2: the splash is shippable on the placeholder atmosphere (S19, S36), so the art lane must not hold the behaviour lanes hostage. Everything that enforces a requirement or a gate is P1.

### Common DoD (every ticket)
- Work is on `task/45-splash` in its own worktree. The commit subject is imperative and carries the Campfire ID. No AI attribution.
- `pnpm typecheck && pnpm lint && pnpm test` pass, plus the ticket's own TCs. `test:all` is no worse than the E1 baseline. With the splash off, the e2e baseline count is unchanged (R8).
- `git diff <base>..HEAD --stat` shows only the files this ticket intends. Root `milestones.md` / `tickets.md` are not touched.
- No secrets in code, logs or fixtures. `KIE_API_KEY` is read from `.env.local` only and is never printed.
- Scratch output, traces and screenshots go to `/Volumes/E Drive/Dev/.scratch/task45/`, with `TMPDIR` exported there. Servers on :3000, :3141 and :3900 are not touched; production/e2e builds use their own port.
- Frozen design values (Design §18) are not changed; only "allowed after freeze" fixes.
- The closing note states what is verified, assumed and untested.

---

## M-45.1 · Foundation and tracer bullet

### TKT-45.01 · Cut the TASK-45 branch; append decisions and Design.md R4
- **Type:** docs · **Priority:** High (P1) · **Milestone:** M-45.1 · **Blocked by:** E1 · **sp:** 1
- **Objective:** start from a known baseline with every approved decision and the design exception on record before any dependent code (S20).
- **Acceptance criteria:**
  - `task/45-splash` is cut in its own worktree from the commit the user names for E1 (candidate `f493a7b`). Its `test:all` result, including any known-red gate and the e2e pass/fail count, is recorded in HANDOFF as the baseline.
  - Commit 1 adds the TASK-45 docs (`docs/*TASK-45*`, the storyboard) to the branch.
  - Commit 2 appends to `decisions.md`, in order: S15–S24 verbatim from Solution-PRD Appendix A, D8–D15 and S33–S37 from `milestones-TASK-45.md`, renumbered if a sibling has claimed those numbers by then; cross-references in both TASK-45 docs updated in the same commit.
  - Commit 3 appends Design-TASK-45 §5 to the root `Design.md` as "Revision R4 — TASK-45 splash scoped exception" (S37), after the last revision on the base. The diff touches only `Design.md`.
- **DoD:** common DoD. Nothing appended on `task/38-emerald-redesign`.
- **Notes:** TASK-46 also appends to `decisions.md` and `Design.md`; a trivial merge conflict is expected. Resolve by renumbering, never by reordering.
- **TC:** TC-45.01 (doc-only diff check).

### TKT-45.02 · Tracer: bare overlay + inline runtime + real phase events + skip
- **Type:** spike (code is kept) · **Priority:** High (P1) · **Milestone:** M-45.1 · **Blocked by:** 01 · **sp:** 5
- **Objective:** prove the S16 architecture on the real render tree before any visual work (S33). Kills RK1 and RK2.
- **Scope:**
  - `src/lib/splash/runtime.ts`: a typed pure state machine (`on → hold → exit → done`), the D / ceiling timers via `setTimeout` + `performance.now`, the 250 ms guard, the skip handlers, the R10 marks; stringified into an inline head script the way `THEME_SCRIPT` is (R9). Unit tests on the pure function with fake timers.
  - The overlay in `src/app/layout.tsx` as a sibling before `<Suspense><ShellGate/>`: a flat dark panel, the official logo `<img>`, the skip button, one `role="status"`. Visibility only via `html[data-splash]`.
  - The app subtree in a `display:contents` wrapper that is `inert` while covered.
  - Observe-only events (`verilane:splash` CustomEvent): `painted` (runtime), `session` (GatedApp), `provider` (DataProvider mount), `seeding` (only when `seedStatus` is null and `ensureSeeded` runs), `ready` (after-commit effect), `error` (treated as ready).
  - Exit at `max(t₀ + D, ready)` ±50 ms as a ≤ 300 ms fade; ceiling at D + 4 s with `splash:ceiling` mark + `console.warn`.
  - Trigger in this ticket is the minimum: hard load of a gated route with `verilane-session === "guest"` and no `verilane-splash-seen` flag (set on show). Under `NEXT_PUBLIC_E2E=1` off unless `?__splash=1` (R8).
- **Acceptance criteria (the go/no-go):**
  - Zero React hydration warnings in dev and in a production build, with the runtime having set `data-splash` and `inert` pre-hydration (RK1). If impossible, record the fallback placement of `inert` as an `EXE#` decision.
  - The overlay is the same DOM node from first paint to `done` across every ShellGate fallback swap (R2), asserted in e2e by a node handle captured at first paint.
  - Baseline spread of `splash:ready` (no splash) measured first; then `splash:ready` with splash is within ±50 ms of baseline per S34 (5-run median, or interleaved A/B n ≥ 9 if the spread exceeds ±50 ms). Fast-4G + 4× CPU, production build, own port.
  - Skip at ~2 s after `ready`: exit starts ≤ 50 ms after input; app accepts pointer and keyboard input ≤ 350 ms after input; a tap over an app link does not activate it (click swallowed); Enter does not activate an app control; browser shortcuts are not blocked.
  - Input in the first 250 ms and key auto-repeat are ignored. A skip during exit is a no-op; `show()` twice and skip+ready in one frame are idempotent (unit).
  - e2e baseline unchanged with the splash off.
- **Deliverables:** verdict note (go / no-go with numbers) linked from HANDOFF, raw series in `/Volumes/E Drive/Dev/.scratch/task45/tracer/`.
- **Notes:** No-go → stop and reopen Stage 2 (S16) with the user; do not patch around it in later tickets. R7: `GatedApp`'s and `DataProvider`'s rendered output must not change; the pinning tests land in 03, but this ticket must not change output either.
- **TC:** TC-45.02 (runtime state machine unit), TC-45.03 (hydration warnings = 0), TC-45.04 (node identity), TC-45.05 (`splash:ready` ±50 ms), TC-45.06 (skip latency + skip→interactive), TC-45.07 (click swallow / Enter not forwarded / shortcut not blocked), TC-45.08 (250 ms guard + auto-repeat), TC-45.09 (ceiling mark + warn), TC-45.10 (e2e-off default, `?__splash=1`).

---

## M-45.2 · Behaviour on a placeholder scene

### TKT-45.03 · Once-per-tab trigger matrix, client entry from onboarding, R7 pinning
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-45.2 · **Blocked by:** 02 · **sp:** 3
- **Objective:** the splash shows exactly when R5 says, and never otherwise.
- **Acceptance criteria:**
  - `decide()` (pure, in the runtime) covers: not on AUTH_ROUTES (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`); guest session required; `verilane-splash-seen` unset; storage readable (every access wrapped as in `session.ts`; a throw → no splash, app still loads). Unit-tested as a truth table.
  - Client entry from onboarding "Continue as guest": `show()` in a GatedApp layout effect; the skeleton never paints first (RK6); a double-click does not skip it (250 ms guard).
  - Refresh (mid-session, mid-splash, after skip) → no splash. New tab → splash. In-app navigation → no splash. bfcache restore never re-shows a finished splash. No session → no splash and the redirect still happens.
  - R7 pinning tests: `GatedApp` and `DataProvider` render output and phase timing are unchanged with the hooks present (snapshot + timing assertions).
- **Notes:** Cross-tab "once per day" is out of scope (PRD §8); do not add it.
- **TC:** TC-45.11 (`decide()` truth table), TC-45.12 (client entry, no skeleton flash, double-click), TC-45.13 (refresh / new tab / in-app nav), TC-45.14 (auth routes, no session, blocked storage), TC-45.15 (bfcache), TC-45.16 (R7 pinning).

### TKT-45.04 · Event-driven bar, status copy, stall states, hold and ceiling
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-45.2 · **Blocked by:** 02 · **sp:** 3
- **Objective:** an honest progress bar and status line (R6, R13, S23, D8, D12, D13).
- **Acceptance criteria:**
  - `progress()` (pure): targets 10/35/65/(80)/100 from the latest real phase; never decreases; ≤ 90 before `ready`/`error`; 100 only on `ready`/`error`; unchanged when only time passes (10 s under fake timers / `page.clock`); never completed by skip or ceiling.
  - Fill animates `scaleX` over 350 ms ease-out; revealed at t₀ + 3.2 s (D8), absent from the a11y tree before, present after. Warm load fills to 100 within 600 ms of reveal; completion beat ≤ 250 ms before exit when `ready` lands late.
  - `role="progressbar"`, non-live; `aria-valuenow` equals the target and `aria-valuetext` equals the phase text at each step.
  - Status copy: "Opening workspace…", "Preparing demo data…" (only after a real `seeding`), "Workspace ready", error "Workspace opened". One polite `role="status"` with the "Verilane. " prefix; exactly one announcement live at a time.
  - Stall (> 1.5 s since last event, after reveal, not ready): glint clipped inside the fill, 2.4 s period, value unchanged. Sub-line "Still working — first visits can take a few seconds." after a 4 s stall or 1.5 s past D. `data-splash="hold"` after D while not ready.
  - Ceiling at 9.7 s exits with the bar < 100 to the skeleton (R4). Injected chunk-load failure → ceiling. DataProvider db error → treated as ready, exit at `max(t₀ + D, t_error)`.
- **TC:** TC-45.17 (`progress()` unit incl. monotonic, ≤ 90, time-invariance), TC-45.18 (reveal timing + a11y tree presence), TC-45.19 (aria values), TC-45.20 (status copy / seeding only when real / single live region), TC-45.21 (stall glint + sub-line), TC-45.22 (hold, slow load, no restart), TC-45.23 (ceiling + chunk-load failure), TC-45.24 (error path), TC-45.25 (skip at 65 % does not complete the bar).

### TKT-45.05 · Scene and choreography on placeholder atmosphere
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-45.2 · **Blocked by:** 04 · **sp:** 5
- **Objective:** the frozen "Harbour light at dusk" scene in production CSS, with CSS-gradient placeholders where G1/G2 will go.
- **Acceptance criteria:**
  - Inline SVG lighthouse at ≈ 85 % x; CSS beam at −6°, breathing 1 → .78 over 5 s, one sheen pass at 1.6 s, never sweeps (D11); lantern glow.
  - Logo: official `public/brand/verilane-logo-light.png` unmodified, two layers with clip-paths `inset(0 74.6% 0 0)` (V) and `inset(0 0 0 25.4%)` (wordmark).
  - Clouds: foreground 10 vw, background 5 vw, one way over 10 s; background hidden at ≤ 600 px (D10); measured drift/s fg > bg (S24).
  - F01–F07 timings and easings per Design §6; compositor-only properties (transform, opacity).
  - Responsive: viewport media queries at 900 and 600 px with `vw`/`vh` (Design §18 req. 4). No horizontal scroll at 375/768/1280; beam aligned to the lantern at each; skip button reachable and overlapping neither logo nor bar.
  - Skip button bottom-right, "Skip intro" → "Continue" at ready, 36 px tall / 44 px on touch, no autofocus; hints "or press any key" / "or tap anywhere" (D14). Always dark (D15); the exit reveals the active theme in both themes.
  - Fill contrast ≥ 3:1 against what is behind it (Design §18 req. 1), by a lighter gradient start or a 1 px `--sp-soft` track outline; measured. Text ≥ 4.5:1 (design measures ≥ 7.4:1).
  - Placeholder sky/cloud CSS backgrounds are gated on `html[data-splash]` so a no-splash load requests nothing.
  - Screenshots at 375/768/1280 for f02, f04, f06, f07-bar, hold-stall, ceiling-hold, ready-exited, error-exited, ceiling-exited compared against `.design/exploration/task-45/shots/`.
- **Notes:** Design §18 req. 2 (beam core over the wordmark at 1440) is deferred to 09 / Stage 7. Stays under the `splash-budget` gate from 07.
- **TC:** TC-45.26 (breakpoints / no h-scroll / alignment), TC-45.27 (cloud parallax ratio), TC-45.28 (themes, always-dark exit), TC-45.29 (fill contrast ≥ 3:1, text ≥ 4.5:1), TC-45.30 (skip button size, placement, label swap, no autofocus), TC-45.31 (frame screenshots vs freeze).

### TKT-45.06 · Reduced-motion path
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-45.2 · **Blocked by:** 05 · **sp:** 2
- **Objective:** honour `prefers-reduced-motion` (2.3.3) with a static composed frame.
- **Acceptance criteria:** static frame with the bar visible from t₀ and instant steps; `overlay.getAnimations({ subtree: true }).length === 0`; exit at `max(t₀ + 1 s, ready)` as an instant cut; ceiling at 5 s; skip still works.
- **TC:** TC-45.32 (zero animations), TC-45.33 (D_rm, ceiling 5 s, instant cut), TC-45.34 (skip under rm).

### TKT-45.07 · `splash-budget` gate in `test:all`
- **Type:** chore · **Priority:** High (P1) · **Milestone:** M-45.2 · **Blocked by:** 02 · **sp:** 2
- **Objective:** make §5.2 mechanical before the scene grows (S35).
- **Acceptance criteria:**
  - `scripts/splash-budget.ts` + unit test: fails above runtime 2 KB, CSS 7 KB, markup + SVG 4 KB, total 15 KB gzip; splash rasters ≤ 60 KB desktop / ≤ 30 KB mobile.
  - Wired into `test:all` next to `route-budget`; `route-budget` (300 KB/route) unchanged. A recorded per-route comparison against E1 shows shared-JS delta ≤ 0.5 KB gzip and no route flipping to OVER (watch `/settings` at 291.7/300).
  - e2e network assertion: a load without the splash requests zero splash rasters.
- **TC:** TC-45.35 (gate unit), TC-45.36 (per-route delta vs E1), TC-45.37 (0 bytes when off).

---

## M-45.3 · Art and release evidence

### TKT-45.08 · Generate G1/G2 art with kie.ai (per-round user-approved spend)
- **Type:** task · **Priority:** Medium (P2) · **Milestone:** M-45.3 · **Blocked by:** 05, 07, and user approval of each round · **sp:** 3
- **Objective:** atmosphere art to the Design §11.1 spec (S19, S36).
- **Acceptance criteria:**
  - Before each round: model, image count and estimated cost are stated to the user, and generation waits for explicit approval. Max 3 rounds per asset, then escalate (stop rule).
  - G1: sky plate 2400×1350. G2: two transparent cloud strips, 3200×600 and 3200×500. Prompts from §11.1. No logo, text, beam or lighthouse in any image.
  - Candidates judged in the real scene from 05 at 375/768/1280, and against the TASK-46 panorama exit if available. The user picks.
  - Masters saved under `/Volumes/E Drive/Dev/.scratch/task45/art/`; `KIE_API_KEY` never printed or committed.
- **Notes:** If no candidate passes in 3 rounds, record it and ship the placeholder (S36); 09 then becomes a no-op note.
- **TC:** TC-45.38 (asset spec check: dimensions, alpha, no text/logo).

### TKT-45.09 · Encode and swap in the final art within 60/30 KB
- **Type:** feature · **Priority:** Medium (P2) · **Milestone:** M-45.3 · **Blocked by:** 06, 08 · **sp:** 2
- **Objective:** replace the placeholders without breaking any budget or behaviour.
- **Acceptance criteria:** AVIF/WebP via `image-set()`; ≤ 60 KB desktop and ≤ 30 KB mobile over the wire; still 0 bytes when the splash is not shown; `splash-budget` green; the splash never waits on the art (exit timing unchanged with the art throttled/blocked); reduced-motion frame still static; beam core softened one step only if Stage 7 flags it (Design §18 req. 2).
- **TC:** TC-45.37 (re-run), TC-45.39 (raster budget on finals), TC-45.40 (splash does not wait on art).

### TKT-45.10 · Release evidence: a11y, perf/INP, breakpoints, handshake, full e2e
- **Type:** task · **Priority:** High (P1) · **Milestone:** M-45.3 · **Blocked by:** 03, 09 · **sp:** 3
- **Objective:** prove §5 success criteria 1–5 on the finals.
- **Acceptance criteria:**
  - A11y: axe clean on `on`, `hold` and ready; overlay not `aria-hidden`, decorative layers are; exactly one `role="status"` and one focusable element; no focus reachable under the overlay; skip button found and activated by a screen reader (VoiceOver pass, manual, recorded); focus ends on `body` if the skip button had it at exit; 2.2.2, 2.3.1, 2.5.8 checked.
  - Perf (S34 protocol): `splash:ready` ±50 ms; skip→interactive ≤ 350 ms; skip INP ≤ 100 ms; CLS 0; no long task > 50 ms attributable to the splash under 4× CPU; no-splash loads LCP/CLS/INP ≤ baseline; splash-load document LCP recorded for information.
  - Breakpoints 375/768/1280 and both themes re-checked on finals; mobile responsiveness checklist from `web-deliverables.md`.
  - TASK-46 handshake: if TASK-46 has landed, the lighthouse and the panorama's tallest monuments don't share a region during the exit fade (fix via panorama `background-position`, TASK-46-owned). Otherwise recorded as pending.
  - The full §6 matrix passes in e2e (slow specs that wait the real D are tagged slow); `test:all` no worse than E1.
  - Evidence pack in `/Volumes/E Drive/Dev/.scratch/task45/evidence/`, linked from HANDOFF, with verified / assumed / untested.
- **TC:** TC-45.41 (axe on/hold/ready), TC-45.42 (screen-reader pass), TC-45.43 (focus), TC-45.44 (perf/INP/CLS/long tasks), TC-45.45 (no-splash CWV), TC-45.46 (handshake), plus re-runs of TC-45.02–TC-45.40.

---

## Requirement coverage

| Req | Ticket(s) | | Req | Ticket(s) |
|---|---|---|---|---|
| R1 first paint | 02 | | R8 e2e off by default | 02 |
| R2 node identity | 02 | | R9 typed runtime | 02, 03, 04 |
| R3 exit timing | 02, 04 | | R10 marks | 02 |
| R4 ceiling | 02, 04 | | R11 skip | 02, 05 |
| R5 trigger | 02 (min), 03 | | R12 a11y | 02, 04, 05, 10 |
| R6 truthful status | 04 | | R13 bar | 04 (reveal per D8) |
| R7 observe-only | 02, 03 | | §5.2 budget | 07, 09 |
| §5.3 reduced motion | 06 | | §5.5 CWV | 02, 10 |
| Design §5 exception | 01 | | Design §18 reqs 1–4 | 05, 09, 05, 05 |
| S24 parallax | 05 | | S19 art | 08, 09 |

## Proposed Campfire tickets (to be created by the caller after the gate; NOT created)

Create from the project root as subtasks of TASK-45 (`--parent TASK-45`), with `--dep` mirroring "Blocked by" once the earlier IDs exist:

| # | Title (imperative) | --type | --priority | -l | Depends on |
|---|---|---|---|---|---|
| 1 | Cut the TASK-45 splash branch and append decisions and Design.md R4 | docs | High | P1 | — |
| 2 | Prove the pre-hydration splash overlay on real phase events with skip (tracer) | spike | High | P1 | 1 |
| 3 | Add once-per-tab splash trigger with client entry and observe-only pinning tests | feature | High | P1 | 2 |
| 4 | Drive the splash progress bar from real phases with stall, hold and ceiling states | feature | High | P1 | 2 |
| 5 | Build the lighthouse splash scene and choreography on placeholder atmosphere | feature | High | P1 | 4 |
| 6 | Add the reduced-motion splash path with a static frame and instant cut | feature | High | P1 | 5 |
| 7 | Add a splash-budget gate to test:all | chore | High | P1 | 2 |
| 8 | Generate splash sky and cloud art with kie.ai after per-round spend approval | task | Medium | P2 | 5, 7 |
| 9 | Encode and swap in the final splash art within the raster budget | feature | Medium | P2 | 6, 8 |
| 10 | Collect splash release evidence for a11y, performance, breakpoints and e2e | task | High | P1 | 3, 9 |
