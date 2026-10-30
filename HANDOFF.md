# HANDOFF — Verilane

**Stage just completed:** 5 · Technical Planning COMPLETE → next: **Stage 6 · Execution** (Full tier) — done 2026-10-30; no user gate (S1)
**Date:** 2026-10-30 · **Campfire project:** `verilane` · **Done:** TASK-1…TASK-5 · **Build tickets:** TASK-6…TASK-28 (To Do), milestones m-0…m-5
**Branch/worktree:** `main` (git initialised, **no commits yet**; planning docs untracked) · no code yet

## Key decisions (`decisions.md`: S1–S14, D1–D6, TP1–TP8)
- S1 gates only at Stages 1, 2, 3, 9 → **Stages 6–8 run straight through, no user gate.**
- S8 stack · S9 ₹0 per-visitor IndexedDB · S10 live Claude local-only · S11 `priority.v1` (AS_OF 2026-10-30) · S12 strict matching · S13 `pnpm eval` gates · S14 single write path.
- D1–D5 design (frozen `Design.md`) · **D6 OG image must be mocked + approved before Stage 10** (TASK-27; approval to be recorded as D7).
- TP1 `pnpm test:all` (typecheck → lint → test → eval → build → check:secrets → build:e2e → e2e) · TP2 client-only data hooks · TP3 eval as a Vitest project · TP4 Campfire mapping + `--dep` workaround · TP5 plan-local `TASK-N.k` steps · TP6 no CI in v1 · TP7 E2E hooks only in `build:e2e` · TP8 hand-written service worker.

## Stable IDs (never renumber)
- Milestones `M-001…M-006` → Campfire `m-0…m-5`.
- Tickets `TKT-01…23` → **native `TASK-6…TASK-28`** (mapping in `tickets.md`); use native IDs from now on.
- Plan steps `TASK-N.k` (`technical-plan.md` Part B). Test cases `TC-001…TC-090` (`test-cases.md`, 63 P0).

## Outputs (canonical)
- `technical-plan.md` — Part A architecture/data/flows/observability/failure modes/risks/deploy/test architecture/rollback/tokens; Part B atomic tasks; **Part C Stage 6 playbook**; Part D traceability. Critical path 6→7→8→11→12→13→15→16→21→22→28 (+7→14).
- `test-cases.md` — 90 cases with Rel/Type/Pri/Auto/Status; all `Not run`.
- Earlier: `milestones.md`, `tickets.md`, `Discovery-PRD.md`, `Solution-PRD.md`, `Design.md`, `.design/exploration/final/mockup.html`, `docs/*`.

## Inputs to carry forward
- Logo `public/brand/verilane-logo.png` — unaltered, sha256-checked (TC-003); white card in both themes.
- Web deliverables: no h-scroll at 1440/1280/768/390; OG/Twitter 1200×630 (D6); four states per data view; PWA (D5).
- Load the `claude-api` skill before writing `src/server/llm.ts` (TASK-23). Live mode needs `ANTHROPIC_API_KEY` + `VERILANE_LIVE_LLM=1`; otherwise 503.
- All tooling on the E Drive: `PLAYWRIGHT_BROWSERS_PATH` / `TMPDIR` under `/Volumes/E Drive/Dev/.scratch`; pnpm store already redirected.

## Known limitations / issues
- Stage 5.0: the Chrome extension was not connected; the Campfire PWA was verified over HTTP (`http://127.0.0.1:6480`) instead of in-browser.
- Campfire fork bug: `task create --dep "A,B"` keeps only one parent; multi-parent deps were set with repeated `task edit --dep`. Report against the fork.

## Open questions (non-blocking)
1. Keep TASK-23 (live Claude, P2)? Recommended: keep.

## Next stage — Stage 6 · Execution (no gate)
Invoke `bw-execution-orchestration`. Read: global `CLAUDE.md`, `~/.claude/workflow/build-workflow.md`, this file, `technical-plan.md` (**Part C first**), `tickets.md`, `test-cases.md`, `decisions.md`, `Design.md`.
First: ask the user to commit the planning docs on `main` (commit only when asked), then branch `build/verilane-v1`. TASK-6/7 run in the main context; each later ticket gets its own subagent; per-milestone reviewer with ≤2 fix rounds; stop if a ticket passes 2× its sp or the same failure repeats twice. Move each Campfire ticket In Progress → Done only when its TCs pass.
