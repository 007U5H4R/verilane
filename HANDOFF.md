# HANDOFF — Verilane

## ▶ ACTIVE — TASK-45 + TASK-46 Stage 6 Execution (resume point, updated 2026-11-05 after release r4)

**Resume with:** `bw-execution-orchestration` + `orchestration-playbook`. The ledgers are the source of truth: `/Volumes/E Drive/Dev/.scratch/task45/ledger.md` and `/Volumes/E Drive/Dev/.scratch/task46/ledger.md`.

**Standing user delegations (verbatim, still binding):** "I will be AFK, dont wait for my approval. Take decisions on my behalf. And complete everything." · "Approved go ahead and fan out agents. Complete everything. TIme matters" · "approved, go ahead. Commit, merge, push and deploy." · "for 45.8 and 46.7, dont worry about the budget, just give your best" · "yes give splash priority". Human checkpoints TC-156 and TC-163 stay flagged, never faked (TC-117 approved). Subagents never push. Dispatch with no `model:` override. Shared e2e lock: `task4x/e2e.lock`.

### Release r4 — SHIPPED (TASK-81 Done, TASK-46.8 Done)
PR #8 merged at `9928befcb42baa6589ba0415e7451134747c006b` (release/task-46-r4: final heritage art with tone calibration, §7 Design revision, TASK-82/83/84 filed). Release gates: install, typecheck, lint, test, perf, build, check:secrets, check:e2e-hooks, route-budget, image-budget, splash-budget, build:e2e all passed clean. Full e2e: 499 passed, 3 failed (TC-081, TC-018, TC-158), 24 skipped (36.0m). The 3 failures were investigated over two rounds of solo reruns under the shared lock, cross-referenced against source-code comments and prior-session logs, and against `uptime`/`ps aux` evidence of severe host contention (load avg spiked 8→25→41 during the run) — concluded **host-load flake, not a regression from the heritage-art diff**, and shipped anyway. **This conclusion is provisional and not yet confirmed by the actual user** — flagged here, in the ledger, the commit message and the PR body, not faked as approval. Follow-up: TASK-84 (re-run TC-081/TC-018/TC-158 on a quiet host or CI runner).

Prod deploy `dpl_9iMmyfbxz2g2FcKJa6mPfonPXDYz` verified 2026-11-05: READY, aliased to verilane.tusharpathak.com; `/`, `/queue`, `/settings` return 200; heritage v2 assets (`/heritage/heritage-{light,dark}-desk.v2.webp`) serve 200; 0 runtime errors (`get_runtime_errors`). Rollback candidate: `dpl_nSxpRihQyXDaoK1mxd7o4BJPbzbb` (r3, commit f4a457f, READY).

### Ticket status
| Ticket | Status |
|---|---|
| 45.1–45.9 | Done and in production |
| 45.10 + whole-branch review | **In Progress**, blocked on **TASK-80** (measure splash TC-130/TC-169 on a quiet host or CI runner — still unmeasured) |
| 46.1–46.8 | Done and in production (r4). TC-115 (SC2) re-enabled on final art. |
| 46.8 r4 tracking tickets | TASK-82 (sample SC2 prominence across 1024–1300px widths) and TASK-83 (generate Next route types before typecheck in test:all) filed, open. |

**Known reds (don't chase):** TC-081/TC-018/TC-158 host-load flake (TASK-84, provisional, awaiting user confirmation), TC-085 perf, the lint `_done` warning, `pnpm eval` 8 failing (TASK-72).

**Still open / carried forward:** the 62 KB mobile splash (target 30 KB); TC-167 VoiceOver; TC-156 look-check needing real user confirmation; TC-121 baseline (EXE107); TC-146 flake watch; EXE103–107 missing from `decisions.md` (or flag); re-run TC-171 after the merge; whole-branch reviews of task/45 and task/46 with a fix wave each; amend PRD L248 and Design §11.1; Stage 7 design critique; delete the E1 scratch copy; remove the `release-r4` worktree once this HANDOFF update is committed.

### Next actions, in order
1. TASK-80: measure splash TC-130/TC-169 on a quiet host, then close out 45.10 and the TASK-45 whole-branch review.
2. TASK-82/83: resolve, then the TASK-46 whole-branch review.
3. Stage 7 design critique once both whole-branch reviews are clean.
4. Re-check TASK-45.10 and TASK-46.8 status before cutting `task/75-exceptions` — see the TASK-75 section above for that gate.

---

## Main chain — Verilane v1 release (Stage 10 DONE 2026-11-03; Stage 11 · Feedback & Regression: TASK-64 DONE and deployed — `bw-feedback-regression`)

**Auto-advance (this session's user instruction):** when a stage's exit criteria are met, rewrite this section and start the next stage without waiting. Stop for anything destructive.

Stages 1–9: DONE. Release gate is `QA-report.md` (READY WITH ACCEPTED RISKS, approved 2026-11-03; rulings R1–R5 in §8.1).

### Stage 10 · Deployment + Production Monitoring — DONE (TASK-65)
- **Live:** https://verilane.tusharpathak.com. It is deployed by the Vercel git integration from `main`.
- **Vercel:** project `prj_Id5zfSGk5rr2psR93e6wGrv3fahr`, team `team_pLaStAJybzggE3tGD5ioih5M`. The production deploy is `dpl_5vsyWFY6jy1p5iJ9tCo4mPS7TwUP` (main at f0b9f65, PR #5, TASK-45/46 progress), verified READY + aliased 2026-11-04. The rollback candidate is `dpl_B9pvyfxAVuLumpMicXGEmFbhmp9N` (d7144cb, PR #4). *Record new IDs here after every deploy, because they were lost once on compaction.*
- **Pre-deploy items:** R1 (og.png) and R5 (TASK-58 CSP/headers, TASK-59 `check:deploy-env` build guard) landed before the deploy.
- **TASK-63 (fixed live):** the invoice detail grid widened to 448px at 375px on INV-A. Fixed in 69b5888 with `grid-cols-[minmax(0,1fr)]`. Live re-check passed 10/10 at 375 and 768. The regression test is the DES-001 loop in `tests/e2e/responsive.spec.ts`, which now includes `/invoices/INV-A`.
- **TASK-64 (logged, P3):** the /queue stat badge text is truncated at 375px. Cosmetic. Fixed in Stage 11 (see below).
- **QA-004 perf (live lab results; no RUM):** mobile /queue LCP 3.21 s ("Needs improvement") and TBT 398 ms; desktop LCP 0.70 s. It is still a P2 follow-up. See QA-report §8.
- **Link preview:**
  - Verified server-side with curl: og:title, og:description, og:image (https://verilane.tusharpathak.com/og.png, 1200×630, HTTP 200, with alt text) and twitter:card `summary_large_image`.
  - LinkedIn Post Inspector and opengraph.xyz are **not run**. The Chrome extension was not connected, and opengraph.xyz returned HTTP 429 to a plain fetch. The user needs to run both manually.
- **Monitoring:** Vercel runtime errors are checked through the MCP `get_runtime_errors` tool. Web Analytics and Speed Insights (RUM) are **not enabled**, which is a follow-up.
- **Lessons:** `lesson-learnt.md` (repo root).

### Stage 11 · Feedback & Regression — TASK-64 DONE (loop stays open for new production signals)
- **Shipped:** PR #4 merged at d7144cb (branch `fix/task-64-queue-stat-badge`, commit 45f3b0e), deployed as `dpl_B9pvyfxAVuLumpMicXGEmFbhmp9N`, Ready and aliased to verilane.tusharpathak.com. Live check on /queue as a guest at 375/768/1440: 0 clipped elements and no horizontal scroll. Runtime errors in the hour after the deploy: 0.
- **Runtime errors:** Vercel `get_runtime_errors` shows 0 in 7 days (verified 2026-11-03). Runtime *logs* are kept only 1 h on Hobby — query ≤30m windows.
- **TASK-63:** already guarded by the DES-001 loop (includes `/invoices/INV-A`). No new work.
- **TASK-64 (bug, Low, P3) — Done:**
  - Root cause: `truncate` on the KPI sub-line `<span>` in `src/components/queue/QueueKpis.tsx` (~80px text column at 375).
  - Fix: sub-line `truncate` → `break-words`; `max-w-full` on `Chip`.
  - TC-173 (element-level `scrollWidth > clientWidth + 1` inside `[data-testid="queue-kpis"]`, stored guest, 375): RED before the fix (4 cards clipped), GREEN after in both themes.
  - Gate: tsc clean; eslint 0 errors (1 pre-existing warning `steps.ts:141`); vitest 1226/1226; full e2e `--workers=1` 353 passed / 2 failed / 1 skipped. The 2 failures are pre-existing and unrelated (TC-081 light: `[data-sweep-target]` click timeout; TC-085 dark: sort median 268 ms > 200 ms). Visual 375/768/1440 light + dark PASS (screenshots in `/Volumes/E Drive/Dev/.scratch/task64/`).
  - Docs: `decisions.md` RCA1; `test-cases.md` TC-173 (next free TC-174); `lesson-learnt.md` lesson 8 + Candidate Global CLAUDE.md Improvements.
- **Remaining follow-ups (untriaged):** at 375 the Total card's amount wraps mid-number (`₹61,17,500.0` / `0 outstanding`) — not clipped, but awkward; TC-081 flake (trim reloads); TC-085 perf 268 ms / QA-004 trace; Zod jitless; CSP `worker-src`; `steps.ts:141` lint warning; enable Analytics + Speed Insights (RUM); TASK-60/61/62 (SEC hardening); stale In Progress tickets; manual OG validators (LinkedIn Post Inspector, opengraph.xyz) — user; delete `docs/stage10-closeout` branch — user.

---

## TASK-45 — Cinematic Lighthouse Splash Screen (independent Full-tier build, Stage 5 APPROVED 2026-11-03; next: Stage 6 at TASK-45.1)

**This is a separate build chain from everything below.** The section below (TASK-38/39) is unrelated, mid-execution work on `task/38-emerald-redesign` and its worktrees — **do not touch that branch or its worktrees for TASK-45.**

### Stage 5 · Technical Planning — APPROVED 2026-11-03 (all 12 Part E items as recommended)
- **Artifacts:** `docs/technical-plan-TASK-45.md` (Part A approach: architecture, interfaces, CSS, assets, flows, failure modes, DAG, E1, rollback, TP-45.a–j, test architecture, security · Part B atomic steps 45.1.1–45.10.6 with gates · C execution notes · D traceability · E 12 sign-off items) and `docs/test-cases-TASK-45.md` (TC-126–TC-171, full schema, mapping table). Root `technical-plan.md` / `test-cases.md`: append-only pointers (**next free TC-172**). `decisions.md` / `Design.md` untouched (appended on the branch in TASK-45.1).
- **Key design:** typed runtime `src/lib/splash/runtime.ts` stringified into an inline head script; server-rendered `#verilane-splash` overlay + `display:contents` `#verilane-app` wrapper (`inert` while covered); state only via `html[data-splash]` on/hold/exit/done; public API `window.verilaneSplash` (renamed from `__verilaneSplash` because `check:e2e-hooks` flags `__verilane`); `"__splash"` added to HOOKS; source-based `pnpm splash-budget` in `test:all`; perf A/B in a separate `pnpm e2e:splash-perf`.
- **Isolation for Stage 6:** worktree `.claude/worktrees/task-45-splash`, branch `task/45-splash` from E1 (green task/38 head eb85789+, tip cf2c541), `E2E_PORT=3145`, scratch `/Volumes/E Drive/Dev/.scratch/task45`.
- **Open at the gate:** 12 sign-off items in plan Part E (all recommended Approve): E1, TC block, TP numbering, the `verilaneSplash` rename, `__splash` in HOOKS, overlay/wrapper approach, source-based budget, separate perf spec, e2e runtime budget, isolation, 08/09 priority note, contrast as an EXE decision.
- **Next (after approval):** Stage 6 · Execution (`bw-execution-orchestration`) in a fresh session, starting with TASK-45.1 then the TASK-45.2 tracer (no-go on TC-128/129/130 reopens Stage 2). kie.ai spend stays per-round approval in TASK-45.8.

### Stage 4 · Problem Breakdown — APPROVED 2026-11-02 (all 10 sign-off items as recommended; E1 amended to cut from the green merged task/38 head eb85789+; art tickets 08/09 set to High/P1 by the user)
- **Artifacts:** `docs/milestones-TASK-45.md` (milestones, DAG, tracer, risks RK1–RK8 + E1, draft decisions D8–D15 / S33–S37, 10 sign-off items) and `docs/tickets-TASK-45.md` (10 tickets, 29 sp, Common DoD, requirement coverage, provisional TC-45.01–.46, proposed Campfire tickets). Root `milestones.md` / `tickets.md` / `decisions.md` untouched.
- **Milestones:** M-45.1 Foundation + tracer (01, 02) → M-45.2 Behaviour on a placeholder scene (03–07) → M-45.3 Art + release evidence (08–10). Critical path 01→02→04→05→08→09→10.
- **Tracer (TKT-45.02):** a bare overlay with the real inline runtime, real phase events, skip and `inert` on the real tree. It kills RK1 (pre-hydration `inert`/`data-splash` without hydration warnings, with the same overlay node across ShellGate swaps) and RK2 (`splash:ready` within ±50 ms, measured against the baseline spread first, per S34). No-go reopens Stage 2.
- **Campfire:** created TASK-45.1–45.10 (subtasks of TASK-45, deps per the DAG). TC IDs: TASK-46 took TC-091–125, so TASK-45 starts at TC-126.
- **Open at the gate:** the 10 sign-off items in the milestones doc. They include E1 (which commit is green enough to cut `task/45-splash` from; candidate `f493a7b`, full `test:all` unverified), the kie.ai spend per round, and Design.md Revision R4.
- **Next (after approval):** Stage 5 · Technical Planning (`bw-technical-planning`) in a fresh session; allocate real TC numbers there.

### Stage 3 · UI/UX Design — APPROVED (2026-11-02)
- **Status:** the user approved all 8 sign-off items in §17 as recommended: the beam holds still, the bar reveals at 3.2 s (amending R13), and D = 5.7 s. The Design Freeze block is §18 of `docs/Design-TASK-45.md`.
- **Artifacts:**
  - `docs/Design-TASK-45.md` (ticket-scoped; the root `Design.md` is untouched)
  - Mockup: `.design/exploration/task-45/index.html`. It is CSS-only, opens from disk, and has replay, skip, load scenarios, viewport, reduced-motion, theme, touch, exit-into-panorama controls and a scrubber.
  - Screenshots: `.design/exploration/task-45/shots/` (34 PNGs at 1440, 768 and 375)
  - Capture script: `/Volumes/E Drive/Dev/.scratch/task45/shots.mjs`
- **Approved resolutions (PRD §9 item 7):**
  - The bar is revealed at **3.2 s**. This amends R13, which said 4.0 s.
  - **D = 5.7 s**, with the ceiling at 9.7 s.
  - The clouds move by width: the foreground 10 vw and the background 5 vw, over 10 s.
  - The beam is **static**: it breathes and gives one sheen pass, with no sweep.
  - A stalled bar shows a glint inside its filled part, then the line "Still working…". The bar's value never changes because of a stall.
- **Known items for later stages:**
  - **Stage 6 requirement:** the bar-fill start colour is 2.53:1 on the hill behind it and must reach ≥3:1 (Freeze §18, item 1).
  - At 1440 the beam core crosses the wordmark (cosmetic).
  - The TASK-46 panorama crop does not rhyme with the lighthouse position. That is TASK-46's call.
- **Not generated:** the G1/G2 art. The spec is in §11.1 of the design doc and it is for Stage 6 (it costs money).
- **Next:** Stage 4 · Problem Breakdown (`bw-problem-breakdown`) in a **fresh session**.
  - Read `docs/Solution-PRD-TASK-45.md`, `docs/Design-TASK-45.md` (with the §18 Freeze) and the mockup.
  - **`task/45-splash` has not been cut yet, and nothing is in `decisions.md`.** Cut the branch and append S15–S24 plus the new Stage 3 `D#` decisions (numbered then) when Stage 4/6 cuts the branch. Never do either on task/38.

### Stage 2 · Solution Design — APPROVED (2026-11-02)
- **Artifact:** `docs/Solution-PRD-TASK-45.md`. It is ticket-scoped; the root `Solution-PRD.md` is TASK-1's and was not touched.
- **Ticket:** TASK-45 is In Progress.
- **Chosen approach:** a pre-hydration, server-rendered static overlay in `RootLayout`, a sibling of `<Suspense><ShellGate/>`.
  - It is shown through `html[data-splash]`, set by a tiny typed and stringified inline head runtime (the `THEME_SCRIPT` pattern).
  - Motion is CSS-only, on transform and opacity, with no library.
  - React only emits observe-only readiness events (session, provider, seeding, ready, error).
  - The existing skeleton chain is unchanged.
- **User sign-off decisions (2026-11-02):**
  - **Guaranteed full cinematic (S21).** About 6 s (*D*) plays once per tab, even when the app is ready. This reverses the 400 ms floor and Discovery DoD #1.
    - Exit is at `max(t₀ + D, ready + ≤250 ms bar beat)`, as a ≤300 ms fade.
    - If loading runs longer, the splash holds on a calm loop.
    - The ceiling is *D* + 4 s (≈10 s), which replaces 8 s.
    - Reduced motion gets a static frame for about 1 s, then an instant cut.
    - Same-tab refresh does not replay; a new tab does.
  - **Skip (S22).** Any click, tap or key, including Esc, exits within 50 ms. There is a 250 ms start guard, and the skipping click or key is never forwarded to the app.
    - There is a small real "Skip intro" button plus a key hint.
    - The overlay is no longer `aria-hidden`: decorative layers are hidden, and one `role="status"` is visible while the app is `inert`.
  - **Real-progress loading bar (S23).** The bottom-centre pill is filled only by phase events: 10 → 35 → 65 → (80 if seeding) → 100.
    - It stays ≤90% before ready, and no timer drives it.
    - It is revealed at 4.0 s.
    - A skip or the ceiling exits with the bar incomplete.
    - It is a non-live `role="progressbar"`.
  - **Cloud parallax (S24).** The foreground cloud moves faster than the background cloud.
  - **Unchanged from the draft:** client-nav entry from onboarding (never on `/welcome`); SVG lighthouse with generated sky/sea and clouds only; ≈15 KB splash, +0.5 KB shared JS, rasters ≤60/30 KB; e2e off unless `?__splash=1`.
- **Branch:** new `task/45-splash` in its own worktree, cut from a commit on `task/38-emerald-redesign` where all checks pass. Never commit to task/38. **Risk:** route-budget has been red on 6 routes. If no fully green commit exists, ask the user before cutting.
- **decisions.md:** entries S15–S24 are approved in the PRD's Appendix A. Append them as the first commit on `task/45-splash`, not on task/38.
- **Nothing committed.** The TASK-45 docs are untracked in the main checkout, which is currently on `task/38-emerald-redesign`. Do not commit them there.
- **Storyboard:** transcribed in `docs/TASK-45-storyboard.md`. The image file is not in the repo.
- **Open for Stage 3** (PRD §9 item 7):
  - the progress timing (4.0–5.5 s versus 3.2–4.3 s);
  - the cloud distances (px versus % of width);
  - whether the beam holds still or sweeps;
  - the exact *D*.
- **Next:** Stage 3 · UI/UX Design (`bw-ui-ux-design` → `t-design`) in a fresh session.
  - Read `docs/Discovery-PRD-TASK-45.md`, `docs/Solution-PRD-TASK-45.md`, the creative brief and `docs/TASK-45-storyboard.md`.
  - Map the storyboard onto the phase model B0–B5 in PRD §9.
  - Generate the G1/G2 artwork there, never with logo, text, beam or lighthouse.
  - Model allocation for later stages goes via jev-router, with no `model:` overrides.

### Stage 1 · Product Discovery — APPROVED (all 9 §6 recommendations accepted verbatim)

- **Date:** 2026-11-02 · **Stage:** 1 · Product Discovery · **Status:** APPROVED.
- **Artifact:** `docs/Discovery-PRD-TASK-45.md` (not the root `Discovery-PRD.md` — that is the whole-product, already-approved artifact from TASK-1 and must not be overwritten; see §0 of the TASK-45 doc for why this one is ticket-scoped under `docs/`).
- **What's in it:** problem statement grounded in the real codebase (ShellGate → GateSkeleton/ShellSkeleton → DataProviderLoader → ShellLoading → DataProvider chain; no real auth, guest-only; existing route-budget gate is already failing on 6 routes per the TASK-38 section below; no animation library in `package.json`; all brief hex colours and the "AR Collections Copilot" descriptor already exist verbatim in the codebase; logo asset is `/brand/verilane-logo-light.png` / `verilane-logo.png`, 460×170, already has a V-only clip-path pattern in `LogoCard.tsx`), target users, in/out of scope, 5 success-criteria categories, and 9 open questions (Q1–Q9) with recommended answers.
- **Next step (done):** Q1–Q9 approved; Stage 2 produced `docs/Solution-PRD-TASK-45.md`.
- **(Superseded)** The design work is in Stage 3 above. No code has been written and no assets have been generated.

---

## TASK-46 — Indian Heritage Background System (independent Full-tier build, Stage 5 APPROVED 2026-11-02; next: Stage 6)

- **Stage 1 · Product Discovery: APPROVED 2026-11-02.** All Q1–Q13 recommendations accepted.
- **Stage 2 · Solution Design: APPROVED 2026-11-02.** All 14 items in §9 of `docs/Solution-PRD-TASK-46.md` are signed off (per that doc's own "Approval record"), including §9.4: the light art must stay at L* ≥92.1 in the header text zone (the brief's `#C9D6CC` put `--text-muted` at 3.66:1; resolved via the text-zone rule, user chose "Mist behind text"). The decision entries (Appendix A, provisional S46-a…S46-h) are still not appended to `decisions.md` — that happens at Stage 4 (`D#` entries), once numbered after TASK-45's S15–S24.
- **Stage 3 · UI/UX Design: DRAFT, at the gate.** Awaiting the user's explicit approval of the mockup/direction.
  - **Artifact:** `docs/Design-TASK-46.md` (ticket-scoped; root `Design.md` untouched). Carries the finished-image prompt spec for Stage 6 generation, the calibration table, the TASK-45 coordination section, and 7 Stage 3 sign-off items with recommendations.
  - **Mockup:** `.design/exploration/task-46/index.html` (open directly in a browser; interactive — theme/level/route/state/viewport toggles). Supporting evidence (sweep screenshots, calibration scripts) lives outside the repo at `/Volumes/E Drive/Dev/.scratch/task46/`.
  - **Mockup verified via Playwright sweep:** art composites correctly behind content at all theme/level/viewport combinations; menu-over-art and text-zone contrast-annotation overlays work; all four screen states (loading/empty/error/working) render with art visible but not standing in for missing data. Dark-normal/dark-reduced tints measured at the conservative low edge of their target prominence bands — accepted, not a blocker.
  - **Known caveat, out of scope, not fixed:** the real app has a pre-existing mobile horizontal-overflow bug (top-bar pill + role-switcher not collapsing at ≤768px) — unrelated to TASK-46, flagged for a separate ticket.
  - **Link-preview/OG gate:** N/A — private authenticated app, no public URL.
- **Ticket:** TASK-46 is In Progress.
- **Artifacts:** `docs/Discovery-PRD-TASK-46.md`, `docs/Solution-PRD-TASK-46.md`, `docs/Design-TASK-46.md`. Scratch evidence is outside the repo, at `/Volumes/E Drive/Dev/.scratch/task46/`.
- **Load-bearing findings (carried from Stage 1/2, still true):**
  - **The design conflict:** Design.md §1 forbids decorative illustration; this is a user-approved, scoped exception (R3), carried as proposed-but-unapplied text in `docs/Design-TASK-46.md §11` until applied on `task/46-heritage-bg` at Stage 6 start.
  - **The dark canvas is `#0d1511`, not the brief's `#062F24`**, which is the sidebar colour.
  - **The reference PNG used for mockup placeholder art is 16:9 at 1672px**; its landmarks are inaccurate for the final asset (gopuram drawn as a shikhara, chariot animal wrong) — the Stage 6 generation brief in `Design-TASK-46.md §6.2` has explicit accuracy rules to prevent repeating this.
  - **It can't be built on `main`**, which has no `src/`. It must branch from `task/38-emerald-redesign`.
  - **`AppShell.tsx` is also edited by TASK-44 and TASK-41.**
- **No asset generation has happened for TASK-46.** No kie.ai or Higgsfield calls were made — all mockup art is placeholder, tinted from the user-supplied reference PNG, not the shipped asset.
- **Stage 3 · UI/UX Design: APPROVED 2026-11-02** (all 7 §14 items as recommended).
- **Stage 4 · Problem Breakdown: DRAFT, at the gate (2026-11-02).** Awaiting the user's explicit sign-off on granularity and blocking edges.
  - **Artifacts:** `docs/milestones-TASK-46.md` (3 milestones M-46.1–M-46.3, DAG, risk map, draft decisions S25–S32, 8 sign-off items) and `docs/tickets-TASK-46.md` (8 tickets TKT-46.01–08, 20 sp, AC/DoD/TC-46.xx links, proposed Campfire tickets). Root `milestones.md`/`tickets.md` untouched.
  - **Tracer bullet:** TKT-46.02. Placeholder art through `image-set()` in AppShell proves R5 (Turbopack `url()` rewrite inside `image-set()`), the new R5b (SW `STATIC_REF` won't match a relative `url(../media/…)`, so the asset could be pruned), R7 (stacking) and no-flash. Path A (`src/assets`) or B (`public/heritage/` + immutable `headers()`) is decided there.
  - **Not done in this stage:** no Campfire tickets created (proposed list in `tickets-TASK-46.md`, bottom), nothing appended to `decisions.md` (S25–S32 drafted in the milestones doc, appended on the branch in TKT-46.01), no branch, no code, no kie.ai calls.
  - **Open blocker E1:** PRD §9.13 needs a green `test:all` commit on `task/38-emerald-redesign`; route-budget was red at `3145680`, and `f493a7b` is unverified.
- **Stage 4 · Problem Breakdown: APPROVED 2026-11-02** (all 8 items as recommended; S25–S32). Campfire subtasks created: TASK-46.1–46.8 (= TKT-46.01–.08, deps per DAG). Note: route-budget is green at f493a7b (all 18 routes); E1 still to confirm at Stage 5 entry.
- **Stage 5 · Technical Planning: APPROVED 2026-11-02.** All 9 Part E items as recommended; item 4 → tablet art height fixed 300px (Design wins over the PRD clamp). Cut the branch from the green merged task/38 head (eb85789+, TASK-47/48 included).
  - **Artifacts:** `docs/technical-plan-TASK-46.md` (architecture, interfaces, CSS block, asset paths A/B, failure modes, rollback, draft TP-46.a–g, test architecture, per-ticket steps 46.N.k) and `docs/test-cases-TASK-46.md` (**TC-091–TC-125**, TC-46.nn → TC-(090+nn)). Root `test-cases.md` and `technical-plan.md` got one appended pointer section each (next free TC: **TC-126**); nothing else in them changed.
  - **E1 resolved by record:** base `f493a7b` green on typecheck, eslint, vitest 1105/1105, build, check:secrets, check:e2e-hooks, route-budget. Known-reds: e2e TC-062/TC-079 (fixes TASK-47/48 on `task/38-e2e-fixes`, pending merge) and `eval/gates.eval.ts` (pre-existing). Branch point: `task/38-emerald-redesign` tip after TASK-47/48 merge, else `f493a7b`.
  - **Campfire:** TASK-46.1–46.8 gained refs to both docs and a plan pointer. `tickets-TASK-46.md` now records TKT→TASK-46.N and TC-46.nn→TC-### mappings.
  - **Open user calls in Part E:** tablet height (Design 300px vs PRD clamp; rec. 300px), R5b `sw.js` regex widening needs separate approval if TC-094 fails, SC9 e2e via `/e2e-harness` (no new hook).
  - **Not done:** no branch, no code, no commits, no `decisions.md` append (TP-46.a–g go in as TP9+ on the branch in TASK-46.1), no image generation.
- **Next step:** after Stage 5 sign-off, Stage 6 Execution in a fresh session (`/clear`), starting at TASK-46.1 step 46.1.1.

---

# HANDOFF — Verilane (TASK-38 / TASK-39 — unrelated, do not conflate with TASK-45 above)

**Date:** 2026-11-02 · **Stage:** 6 · Execution, post-v1 redesign work (Full tier, no user gate per S1)
**Active branch:** `task/38-emerald-redesign` (main checkout) at `3145680`. It is cut from `build/verilane-v1`. Never push.
**Tickets:** TASK-38 Emerald redesign (In Progress) · TASK-39 Onboarding / guest entry (In Progress, agent running)

## Status (updated 2026-11-02 14:15 IST)

`task/38-emerald-redesign` is at `3145680`.

| Work | Branch / worktree | State |
|---|---|---|
| Settings | `task/38-settings` | ✅ merged: `a7d518c` and the follow-up `4ade5de` |
| Audit Log | `task/38-audit` | ✅ merged `4abd907` |
| Disputes | `worktree-agent-a5211d58451656f22` | ✅ committed `9c7db97`, merged `4656a4e`. The integration fix `3145680` adds `assign_dispute` to the audit ACTION_META. |
| Queue | `worktree-agent-a4d209df135249615` | finished, **uncommitted**. Hold it: e2e had 11 failures, and TC-085 (filter/sort ≤200ms) may be a real regression. `@tanstack/react-table` is now unused. |
| Payments | `worktree-agent-af154a2c710924c9d` (`508d460`) | agent still running, with 7 uncommitted files |
| Sidebar V2 | `task/38-sidebar` (`27133ce`) | ✅ finished (`sidebar-agent-report.md`). Waiting for the top bar. |
| Top bar | `task/38-topbar` | agent running, no commits. Merge it together with the sidebar. The AppShell grid must go from 216 to 272px. |
| Onboarding (TASK-39) | `task/39-onboarding` (`ed66c1b`) | ✅ finished and committed. Merge it after the sidebar and top bar, then wire GuestBadge. Onboarding e2e passes 22/22. The illustrations are inline SVG (`art.tsx`), **not** the decided Higgsfield WebP files. The OG/Twitter link-preview check has not been done. For worktree e2e, use `PLAYWRIGHT_BROWSERS_PATH="/Volumes/E Drive/Dev/Code/Claude/Verilane/node_modules/.cache/playwright/browsers"`. |
| `/emails` + `/invoices` lists, Home redesign, MoreSheet/BottomTabs, Design.md R2 | lead | not started |

**Gates at `3145680`:**
- PASS: tsc, eslint, unit tests (68 files / 988), build, check:secrets, check:e2e-hooks.
- **route-budget FAIL**: /queue 308.2, /audit 305.1, /disputes 302.8, /settings 301.6, /invoices/[id] 301.2 and /disputes/[id] 300.9 KB.
  - The shared first load is about 292 KB (/_not-found is 291.8), and it grew with each merge.
  - `commands.ts` now imports `disputes/model`, so the outcome catalogue is in a shared chunk.
  - A 33 KB zod chunk is in every first load.
  - Fix options: lazy-load the command layer from the store, or slim zod. Needs a decision.
- e2e not rerun yet.

**Other open items:**
- The sidebar reports that the `*.css` rule in `next.config.ts` turns `.module.css` files into global CSS, so don't use CSS modules.
- /emails and /invoices 404 from the nav: console-error tests fail until the list pages exist.
- The e2e tests expecting the "Queue" nav label need updating.

⚠ **Background agents belong to the old session.** After `/clear`, their completion notifications won't arrive. Their work survives in the branches and worktrees above. Each agent writes `<name>-agent-report.md` to `/Volumes/E Drive/Dev/.scratch/task38/` (onboarding writes to `.scratch/onboarding/`).

## How to merge each branch
1. Read the agent's report. If none exists, check `git log` and the diff.
2. Run `git diff --name-only $(git merge-base <br> task/38-emerald-redesign)..<br>`.
   - The page branches are based on `583ebab`, not `0eca157`. A plain diff will show the shell files as "deleted"; that is base drift, not a real deletion.
   - Only the agent's own files should appear.
3. Run `git merge --no-ff <br>`, then rerun the gates.

## Gates
- `pnpm exec next typegen && pnpm -s exec tsc --noEmit`
- `pnpm -s exec eslint --ignore-pattern 'src/domain/__lint__/**' --ignore-pattern '.claude/**' .`
- `pnpm -s exec vitest run --project unit --exclude '.claude/**' --exclude 'node_modules/**' --exclude 'tests/e2e/**'`
- `pnpm -s perf`
- `pnpm -s build && pnpm -s check:secrets && pnpm -s check:e2e-hooks && pnpm -s route-budget` (route budget is 300 KB or less)
- `export TMPDIR="/Volumes/E Drive/Dev/.scratch/tmp" && E2E_PORT=3100 pnpm -s build:e2e && E2E_PORT=3100 pnpm -s e2e --workers=1`. Baseline: 185 passed, 1 skipped.

## TASK-38 decisions (user-approved)
- Emerald FinTech look, Inter font, white cards, no glass or photos.
- Real data only: no invented trends, notifications or identity.
- Every data view designs all four states. The test hook is `?__state=loading|empty|error` when `NEXT_PUBLIC_E2E=1`.
- Build both list pages: `/emails?thread=` and `/invoices?customer=`.
- Collapse contract: AppShell gets `group/shell` and `data-sidebar`; the lg grid is `272px` / `72px` collapsed.
- The final report is terse, six sections.

## TASK-39 decisions
Full brief: `/Volumes/E Drive/Dev/.scratch/onboarding/onboarding-agent-brief.md`. User spec: `onboarding-user-brief.md`.
- **No auth backend.** Sign-in and sign-up are honest forms that say accounts aren't available and point to Continue as guest. No fake success.
- **Guest session:** localStorage `verilane-session=guest`. A `ShellGate` redirects to `/welcome`.
- **e2e:** the default is guest under `NEXT_PUBLIC_E2E`; `?__session=none` opts out.
- **GuestBadge** is built standalone. The agent supplies wiring snippets; the lead wires it into the top bar after that merge.
- **Illustrations:** Higgsfield, assets A–E, WebP under `public/onboarding/`.

## Environment
- Dev server :3000 runs in a background shell of the old session, so it may be gone after `/clear`. Restart with `export TMPDIR="/Volumes/E Drive/Dev/.scratch/tmp" && pnpm -s dev`.
- Agent ports: sidebar 3700/3701, top bar 3800/3801, onboarding 3900/3901.
- Campfire CLI: `"/Volumes/E Drive/Dev/Code/Claude/PM Tools/backlog-md-fork/dist/backlog"`.
- Untracked: `backlog/tasks/task-39 …md` (commit it with the TASK-39 merge).

## Known issues to keep flagging
- TC-002 relaxed.
- The live LLM path has never been exercised.
- TC-066 is a known FAIL.
- Stage 6 memory/Obsidian sync is still pending.

## Next steps
1. Gather the reports from finished agents and merge them: Settings is done; then the pages; then the sidebar and top bar together.
2. Rerun the gates after each merge.
3. Build `/emails`, `/invoices` and the Home redesign.
4. Merge TASK-39 and wire GuestBadge.
5. Run QA at 5 widths in both themes, then the full gates and e2e.
6. Close out: `--no-ff` into `build/verilane-v1`, mark tickets Done, write the terse report.
