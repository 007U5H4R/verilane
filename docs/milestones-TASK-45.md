# TASK-45 — Milestones (cinematic lighthouse splash)

> Stage 4 · Problem Breakdown · Campfire TASK-45 · 2026-11-02 · **APPROVED 2026-11-02**
> Inputs (all approved 2026-11-02): [`Discovery-PRD-TASK-45.md`](Discovery-PRD-TASK-45.md), [`Solution-PRD-TASK-45.md`](Solution-PRD-TASK-45.md) (R1–R13, §5 success criteria, §6 test matrix, §7 NFRs, §8 risks, Appendix A S15–S24), [`Design-TASK-45.md`](Design-TASK-45.md) (§17 items 1–8 approved, §18 Freeze), [`TASK-45-storyboard.md`](TASK-45-storyboard.md). Sibling: [`milestones-TASK-46.md`](milestones-TASK-46.md) (claims S25–S32; panorama is the splash's exit target, no shared code). Tickets: [`tickets-TASK-45.md`](tickets-TASK-45.md).
> **Status:** **APPROVED (2026-11-02).** All 10 sign-off items as recommended. E1 amended: `task/45-splash` is cut from the green merged `task/38-emerald-redesign` head (eb85789 or later), not f493a7b. Art tickets 08/09 are P1 (user choice). Campfire: TASK-45.1–45.10.
> Scope: ticket-scoped. The root `milestones.md`, `tickets.md` and `decisions.md` are not touched here.
> IDs: provisional `M-45.1`…`M-45.3` and `TKT-45.01`…`TKT-45.10` (root `M-001…`/`TKT-01…` are taken; TASK-46 uses `M-46.x`/`TKT-46.xx`). Test cases cite provisional `TC-45.xx`; Stage 5 allocates real `TC-###` numbers.

## Sequence at a glance

```
          ┌──────────────────────── M-45.1 Foundation + tracer ─────────────────────────┐
          │  TKT-45.01 branch + decisions + Design.md R4 ──► TKT-45.02 TRACER (bare overlay)│
          └──────────────────────────────────────────────┬──────────────────────────────┘
                                                         │  go/no-go: ±50 ms ready, skip→input ≤350 ms,
                                                         │  no hydration mismatch, node identity kept
        ┌───────────────────────┬────────────────────────┼─────────────────────────┐
        ▼                       ▼                        ▼                         │
 M-45.2 Behaviour on placeholder scene                                             │
 TKT-45.03 once-per-tab   TKT-45.04 event-driven bar   TKT-45.07 splash-budget gate│
 trigger + client entry   stall / hold / ceiling       (lands early; 05/06/09 grow │
        │                       │                       under it)                  │
        │                       ▼                        │                         │
        │                TKT-45.05 scene + choreography  │                         │
        │                (SVG, beam, logo, clouds, 900/600)                        │
        │                       │                        │                         │
        │                       ▼                        ▼                         │
        │                TKT-45.06 reduced motion   M-45.3  TKT-45.08 G1/G2 art (kie.ai,
        │                       │                          per-round user approval)
        │                       └──────────► TKT-45.09 art swap-in + encode ◄──────┘
        │                                            │
        └──────────────────────────────► TKT-45.10 a11y / perf / INP / e2e evidence pack
```

Blocking edges (authoritative copy in `tickets-TASK-45.md`):

| Ticket | Blocked by | Unblocks |
|---|---|---|
| TKT-45.01 | entry criterion E1 (green base commit) | 02 |
| TKT-45.02 | 01 | 03, 04, 07 |
| TKT-45.03 | 02 | 10 |
| TKT-45.04 | 02 | 05 |
| TKT-45.05 | 04 | 06, 08 |
| TKT-45.06 | 05 | 09 |
| TKT-45.07 | 02 | 08 |
| TKT-45.08 | 05, 07, plus user approval of each kie.ai round | 09 |
| TKT-45.09 | 06, 08 | 10 |
| TKT-45.10 | 03, 09 | Stage 7 / 8 |

Parallelism after the tracer: three lanes. {03} (trigger logic, React entry points), {04 → 05 → 06} (bar, scene, motion: they share the splash CSS and the runtime's progress module, so they run in sequence), and {07} (gate script). 03 and 04 both edit the runtime source, in different modules (`decide()` vs `progress()`); merge 03 first if they finish together. The art lane (08) is gated by money and a human reviewer, not code. Because 05 must exist before art can be judged in context, **05 is on the critical path**, and 08's wall-clock time (approval rounds) is the most likely slip.

Critical path: 01 → 02 → 04 → 05 → 08 → 09 → 10 (≈ 22 of 29 sp).

---

## The tracer bullet: which assumption it kills, and why

**Riskiest assumption (confirmed from the caller's guess, with two refinements):** a server-rendered overlay in `RootLayout`, plus an inline head runtime that mutates `<html>` before hydration, can
1. paint in the first frame and stay the **same DOM node** across every `ShellGate` Suspense fallback swap and hydration (R1, R2), with **no hydration-mismatch warning** from the runtime having already set `html[data-splash]` and the app wrapper's `inert` before React hydrates;
2. receive the real `painted → session → provider → (seeding) → ready` events from observe-only hooks in `GatedApp` and `DataProvider` (R7) and exit at `max(t₀ + D, ready)` within 50 ms (R3);
3. leave `splash:ready` **within ±50 ms** of the no-splash baseline (§5.1), and
4. hand input back in **≤ 350 ms** after a skip, with the skipping click swallowed and `inert` lifted (R11, §5.1).

**Why this before the bar, the scene, or the art:** everything else is CSS and copy layered on a working overlay, and is cheap to change. This slice is the only one that touches the shared render tree (`src/app/layout.tsx`, `ShellGate`/`GatedApp`, `DataProvider`), hydration and the app's own time-to-ready. If any of the four fails, the S16 architecture is wrong and Stage 2 reopens, so we learn that before paying for art or building choreography.

**Refinement 1, hydration:** the caller's framing omitted it, but it is the most likely *silent* failure. `THEME_SCRIPT` already sets `<html class>` pre-hydration under `suppressHydrationWarning`. The splash also sets `inert` on a `display:contents` wrapper, which is a child, so `suppressHydrationWarning` on `<html>` does not cover it. The tracer must prove zero hydration warnings in dev and prod builds, or move `inert` onto an element React never reconciles.

**Refinement 2, measurement before verdict:** ±50 ms on a 5-run median under 4× CPU can be inside the noise. The tracer first measures the **no-splash baseline spread** (S34). If the spread itself exceeds ±50 ms, the gate is unfalsifiable as written, and the tracer switches to interleaved A/B runs (n ≥ 9) before declaring a verdict, rather than "passing" on noise.

**Not in the tracer:** the bar visuals, the stall states, the scene, the art, reduced motion and the full trigger matrix. The tracer overlay is a flat dark panel with the logo `<img>` and the skip button. The runtime's state machine (`on/hold/exit/done`, D, ceiling mark, skip guard) is real and unit-tested from the start (R9).

---

## M-45.1 · Foundation and tracer bullet
- **Objective:** start from a known-good base with the decisions and the design exception on record, then kill the architecture risk with a bare overlay before any visual work.
- **Scope:** cut `task/45-splash` in its own worktree from a green `task/38-emerald-redesign` commit (S20). First commit: the TASK-45 docs, S15–S24 + D8–D15 + S33–S37 appended to `decisions.md`, and the scoped exception appended to the root `Design.md` as **Revision R4**. Then the tracer: the typed runtime source and its stringified inline script, the bare overlay in `RootLayout` before `<Suspense><ShellGate/>`, the `display:contents` + `inert` wrapper, observe-only events, skip (pointerdown/keydown, 250 ms guard, click swallow), the R10 marks, the `?__splash=1` e2e hook (R8), and the baseline/perf measurement.
- **Deliverables:** the branch with its doc commit; a bare splash on a production build of `/` that exits at `max(t₀+D, ready)`; a written go/no-go verdict with numbers (baseline spread, `splash:ready` delta, skip→interactive, hydration-warning count, node-identity check).
- **Tickets:** TKT-45.01, TKT-45.02
- **Dependencies:** none inside TASK-45. **E1 (external):** a commit on `task/38-emerald-redesign` where `pnpm test:all` is green. HANDOFF records `route-budget` red on 6 routes at `3145680`; TASK-46's HANDOFF notes `route-budget` green at `f493a7b` (all 18 routes). `f493a7b` is the current tip of `task/38-emerald-redesign`; whether the **whole** `test:all` (incl. e2e) is green there is **unverified**. If none is green, the user chooses: wait, or branch and freeze the red gates as a baseline (sign-off item 5).
- **Entry:** Stage 4 approved, Stage 5 technical plan approved, E1 resolved.
- **Exit:** verdict recorded as an execution decision (`EXE#`, EXE31 is the last). All four tracer criteria met, or Stage 2 reopened. The e2e baseline (185/1 at the last count, or whatever E1 records) is unchanged with the splash off. `test:all` no worse than E1.
- **DoD:** common DoD in `tickets-TASK-45.md`; verdict and evidence linked from HANDOFF.
- **Priority:** P1 · **Status:** Not started
- **Risks:** RK1 (hydration mismatch), RK2 (measurement noise), RK3 (shared-tree conflicts with TASK-46/44/41), E1 (no green base).

## M-45.2 · Behaviour on a placeholder scene
- **Objective:** make every behaviour and every gate real while the sky and clouds are still CSS placeholders, so the paid art drops into a finished, measured, budget-gated system.
- **Scope:** the once-per-tab trigger and its full matrix (incl. client entry `show()` from onboarding, bfcache, blocked storage, auth routes, no session) and the R7 pinning tests; the event-driven bar (10/35/65/(80)/100, ≤90 before ready, reveal at 3.2 s, 350 ms fill, completion beat ≤ 250 ms), the status copy and single live region, the stall glint and sub-line, hold, the ceiling at 9.7 s, the error path; the full scene (inline SVG lighthouse, CSS beam, clipped logo layers, placeholder sky/clouds, F01–F07 choreography, 900/600 breakpoints with `vw`/`vh`, always-dark, skip button and hints, fill contrast ≥ 3:1); reduced motion (D_rm 1 s, ceiling 5 s, instant cut, zero running animations); the `splash-budget` gate in `test:all`.
- **Deliverables:** the complete splash on placeholder atmosphere at 375/768/1280; `pnpm splash-budget` in `test:all`; unit tests for `decide()` and `progress()`; e2e specs for the §6 matrix rows owned by 03–07.
- **Tickets:** TKT-45.03, TKT-45.04, TKT-45.05, TKT-45.06, TKT-45.07
- **Dependencies:** M-45.1 exit (go verdict).
- **Entry:** tracer verdict = go.
- **Exit:** every §6 row except the art-dependent ones passes; `splash-budget` green with headroom; fill contrast measured ≥ 3:1 (Design §18 req. 1); `getAnimations()` on the overlay returns 0 under reduced motion.
- **DoD:** common DoD; the screenshot set at 375/768/1280 matches the frozen mockup frames (f02, f04, f06, f07-bar, hold-stall, ceiling-hold, rm) within the "allowed after freeze" rule.
- **Priority:** P1 · **Status:** Not started
- **Risks:** RK4 (choreography drift from the freeze), RK5 (CSS budget 7 KB tight once the scene is complete), RK6 (client-entry skeleton flash), PRD §8 "uneven bar" (accepted).

## M-45.3 · Art and release evidence
- **Objective:** replace the placeholder sky and clouds with the G1/G2 art inside the byte budget, then prove the whole thing against the success criteria on the finals.
- **Scope:** kie.ai generation of G1 (sky plate, 2400×1350) and G2 (two transparent cloud strips, 3200×600 and 3200×500) to the Design §11.1 prompts, with the cost stated and user approval before **each** round, max 3 rounds per asset, then escalate; encoding to AVIF/WebP via `image-set()`, ≤ 60 KB desktop / ≤ 30 KB mobile, 0 bytes when the splash is not shown; the swap-in; Design §18 req. 2 (beam softening, only if Stage 7 flags it); and the evidence pack: axe on `on`/`hold`/ready, a screen-reader pass, focus checks, `splash:ready` ±50 ms, skip→interactive ≤ 350 ms, skip INP ≤ 100 ms, CLS 0, no long task > 50 ms, no-splash LCP/CLS/INP ≤ baseline, breakpoints, both themes, the TASK-46 panorama exit handshake (if TASK-46 has landed), the full e2e matrix and `test:all`.
- **Deliverables:** committed final art; an evidence pack under `/Volumes/E Drive/Dev/.scratch/task45/evidence/` linked from HANDOFF; a verified/assumed/untested statement.
- **Tickets:** TKT-45.08, TKT-45.09, TKT-45.10
- **Dependencies:** M-45.2 (05/06/07 for art; 03 for the evidence pack).
- **Entry:** `splash-budget` gate live; scene complete; user approval of the round-1 spend.
- **Exit:** all §5 success criteria measured on the finals; `test:all` no worse than E1; Stage 7 (Design Critique) can start.
- **DoD:** common DoD; no secret (`KIE_API_KEY`) in code, logs, fixtures or the evidence pack.
- **Priority:** P1 · **Status:** Not started
- **Risks:** RK7 (art fails the rubric or the budget in 3 rounds), RK8 (panorama overlap in the handshake), PRD §8 "SVG lighthouse vs generated style".

---

## Risk → ticket map

| ID | Risk | L / I | Mitigation | Ticket |
|---|---|---|---|---|
| RK1 | Pre-hydration `inert`/`data-splash` mutation causes a hydration mismatch, or the overlay remounts across fallback swaps (R2) | Med / High | Tracer asserts zero hydration warnings and node identity (`isSameNode`) from first paint to exit; fallback: put `inert` on a node React never reconciles | 02 |
| RK2 | ±50 ms gate sits inside measurement noise | Med / Med | Measure baseline spread first; interleaved A/B, n ≥ 9 if spread > 50 ms (S34) | 02, 10 |
| RK3 | Merge conflicts in `layout.tsx` / `ShellGate` / `DataProvider` with TASK-46 (AppShell), TASK-44 (tour), TASK-41 | Med / Med | Event hooks are one-liners; rebase on task/38 before each ticket; TASK-46 touches AppShell, not RootLayout | 02, 03 |
| RK4 | Production CSS drifts from the frozen mockup | Med / Med | Screenshot comparison per frame against `.design/exploration/task-45/shots/`; only "allowed after freeze" changes | 05, 06 |
| RK5 | CSS > 7 KB once scene + bar + rm are in | Med / Low | Gate lands in 07 before 05 grows; trim keyframes before raising the budget (any raise is a user decision) | 07, 05 |
| RK6 | Client entry from onboarding paints the skeleton before `show()` | Low / Med | `show()` in a GatedApp layout effect; e2e asserts no skeleton frame via a MutationObserver/paint mark | 03 |
| RK7 | Art fails the rubric or the 60/30 KB budget within 3 rounds | Med / Low | Stop rule: escalate after 3 rounds; the placeholder gradient sky is a shippable fallback (S19: the splash never waits on art) | 08, 09 |
| RK8 | Lighthouse and panorama monuments occupy the same region during the exit fade | Low / Low | Fix by shifting the panorama's `background-position` (TASK-46-owned), never by redesigning either asset | 10 |
| E1 | No green `test:all` base commit on task/38 | Med / Med | Check `f493a7b`; else freeze known-red gates as the baseline with the user's say-so | 01 |

---

## Draft decisions (to append to `decisions.md` on `task/45-splash` in TKT-45.01; NOT appended)

Numbering: S15–S24 are kept as in Solution-PRD Appendix A (appended verbatim). The Stage 3 decisions become **D8–D15** (Design series; D1–D7 taken), as Design §18 says. The Stage 4 decisions below are **S33–S37**, after TASK-46's S25–S32. All numbers are provisional until the append; if a sibling branch claims them first, renumber at append time and fix cross-references in both TASK-45 docs in the same commit, never reorder.

```markdown
## D8 · TASK-45 splash: loading bar revealed at t₀ + 3.2 s (amends R13's 4.0 s) — approved 2026-11-02
Context: at 4.0 s a 0.8 s dead beat follows the tagline. Decision: reveal as a 300 ms rise at 3.2 s (F06 end); t₀ under reduced motion. Rejected: 4.0 s.

## D9 · TASK-45 splash: D = 5.7 s, 300 ms exit, ceiling 9.7 s; D_rm = 1 s, ceiling 5 s — approved 2026-11-02
Context: choreography ends at 3.2 s; 2.5 s of hold lets a warm bar fill and read "Workspace ready". Rejected: 6.0 s / 10 s ceiling.

## D10 · TASK-45 splash: width-relative cloud drift (fg 10 vw, bg 5 vw, one way over 10 s; bg hidden ≤ 600 px) — approved 2026-11-02
Context: fixed px reads frantic at 375 and static at 1440. Rejected: px distances; looping drift.

## D11 · TASK-45 splash: static beam at −6°, breathing 1 → .78 over 5 s, one sheen at 1.6 s, never sweeps — approved 2026-11-02
Context: a sweep pulls the eye off logo and bar and adds a 2.2.2 concern. Rejected: ±4° sweep ≥ 6 s period in hold.

## D12 · TASK-45 splash: error copy "Workspace opened"; the app banner owns the error — approved 2026-11-02

## D13 · TASK-45 splash: stall glint inside the fill only + sub-line "Still working — first visits can take a few seconds." after a 4 s stall or 1.5 s past D — approved 2026-11-02
Context: an honest bar stalls; the stall must read as working, not frozen. The glint never changes the value.

## D14 · TASK-45 splash: skip button bottom-right, "Skip intro" → "Continue" at ready, 36 px (44 px touch), no autofocus — approved 2026-11-02

## D15 · TASK-45 splash: always dark, independent of app theme; exit fade reveals the active theme — approved 2026-11-02

## S33 · TASK-45 build order: tracer first on a bare overlay — proposed
Context: only the overlay/runtime/event path touches the shared render tree, hydration and time-to-ready.
Decision: TKT-45.02 ships the real runtime state machine, events, skip and inert on a flat overlay, and must pass ±50 ms ready, skip→input ≤ 350 ms, zero hydration warnings and node identity before any bar, scene or art work starts. A fail reopens Stage 2 (S16).
Rejected: scene-first (polishes the cheap part while the expensive risk is unknown).

## S34 · TASK-45 perf measurement protocol — proposed
Context: §5.1's ±50 ms gate on a 5-run median may sit inside lab noise under Fast-4G + 4× CPU.
Decision: production build on its own port; measure the no-splash baseline spread first; if the 5-run spread exceeds ±50 ms, run interleaved A/B (splash on/off alternating) with n ≥ 9 and compare medians. Record both raw series in the evidence pack.
Rejected: a single 5-run comparison regardless of noise (could pass or fail on noise).

## S35 · TASK-45 budget gate is a separate `scripts/splash-budget.ts` in `test:all`, landed before the scene — proposed
Context: §7 requires a mechanical gate; `route-budget` measures route JS chunks, while the splash's weight is inline HTML/CSS plus rasters.
Decision: new script, own unit test, beside `route-budget` in `test:all`; it measures the inline runtime (≤ 2 KB), splash CSS (≤ 7 KB), markup + SVG (≤ 4 KB), total ≤ 15 KB gzip, and splash rasters (≤ 60 / 30 KB); `route-budget` is unchanged and its per-route 300 KB limit still applies (no passing route may flip, shared-JS delta ≤ 0.5 KB). Landed in TKT-45.07 right after the tracer so 04/05/06/09 grow under it.
Rejected: extending `route-budget` (mixes two different measurements in one owner's script).

## S36 · TASK-45 art spend: per-round user approval, max 3 rounds per asset, placeholder is the fallback — proposed
Context: kie.ai generation costs money (KIE_API_KEY); the splash never waits on art (S19).
Decision: before each round, state the model, the count and the estimated cost and wait for approval; max 3 rounds per asset (G1, G2), then escalate; if nothing passes, ship the CSS-gradient placeholder sky and clouds and record it. Key read from .env.local only, never printed.
Rejected: open-ended regeneration.

## S37 · Root Design.md scoped exception appended as Revision R4 (TASK-45 splash) — proposed
Context: Design-TASK-45 §5; TASK-46 appends R2/R3 on its own branch.
Decision: append Design-TASK-45 §5 as "Revision R4 — TASK-45 splash scoped exception" after the last revision present on the base, in TKT-45.01, verbatim; renumber if the base already holds an R4. Scope: gradients, glow and a decorative loop only inside #splash while html[data-splash] ≠ done; official logo unmodified; no residue after exit.
Rejected: editing the root Design.md rules in place.
```

**Execution decisions expected, numbered at the time in the `EXE#` series:** the tracer go/no-go verdict and, if needed, where `inert` lives (TKT-45.02); the baseline-spread result and the n chosen (TKT-45.02); the fill-contrast fix chosen (lighter gradient start vs 1 px track outline) in TKT-45.05.

---

## Sign-off items for this gate

| # | Item | Recommendation |
|---|---|---|
| 1 | Granularity: 3 milestones, 10 tickets, ≈ 29 sp; each ticket fits one fresh context window (02 and 05 are the largest at 5 sp) | **Approve.** Art generation (08) and swap-in (09) are separate because 08 is gated by money and a human, not code. |
| 2 | Tracer = the caller's guess **plus** hydration-mismatch and node-identity checks, with a noise-first measurement (S33, S34) | **Approve.** Hydration is the likeliest silent failure; a gate inside noise proves nothing. |
| 3 | ID scheme: provisional `M-45.x` / `TKT-45.xx`; Stage 5 creates the 10 tickets as subtasks of TASK-45 (`--parent TASK-45`, `--dep` per the DAG); the three milestones are sequencing aids, not board objects | **Approve**, mirroring TASK-46. |
| 4 | Decision numbering: D8–D15 for the Stage 3 decisions (per Design §18), S33–S37 for Stage 4; S15–S24 unchanged | **Approve.** Alternative: put the Stage 3 ones in the S series too (S33–S40, Stage 4 S41–S45), if you prefer one series per ticket. |
| 5 | E1 base commit: check `f493a7b` (tip of task/38-emerald-redesign; route-budget reported green there) for a full `test:all` | **Decide at Stage 5 entry.** If red, branch anyway and freeze the red gates as the baseline, rather than block on TASK-38. |
| 6 | kie.ai spend: per-round approval, ≤ 3 rounds per asset, placeholder fallback (S36) | **Approve.** The cost figure is stated per round in TKT-45.08; nothing is generated before that. |
| 7 | Root `Design.md` exception text appended on the branch as Revision R4 (S37), after TASK-46's R2/R3 | **Approve.** Renumber at append if the base differs. |
| 8 | Budget interpretation: splash own ≤ 15 KB gzip and rasters ≤ 60/30 KB in a new `splash-budget` gate; route-budget 300 KB/route unchanged, shared-JS delta ≤ 0.5 KB, no route flips to OVER (S35). Watch `/settings` at 291.7/300 | **Approve.** 0.5 KB of events cannot push /settings over, but 07 asserts it per route. |
| 9 | Coordination: TASK-45 owns `layout.tsx`, the `GatedApp`/`DataProvider` event one-liners and onboarding's `show()`; TASK-46 owns AppShell; no shared code; TASK-44/41 conflicts resolved by rebasing | **Approve.** TKT-45.10 checks the panorama handshake only if TASK-46 has landed; otherwise it is recorded as pending. |
| 10 | TC IDs: provisional `TC-45.xx`; Stage 5 allocates real `TC-###` (TC-090 last today) | **Approve.** Same as TASK-46. |
