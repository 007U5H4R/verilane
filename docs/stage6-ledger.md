# Stage 6 ledger (Execution)

Branch: `build/verilane-v1`. Briefs: `/Volumes/E Drive/Dev/.scratch/verilane/briefs/`. Reports: `/Volumes/E Drive/Dev/.scratch/verilane/reports/`.

## Status
| Ticket | Status | Where | Notes |
|---|---|---|---|
| TASK-6 | In Progress | main ctx | 6.5 visual check open |
| TASK-7.1–7.8 | done | a6bb22d | queue renders 8 seeded rows in rank order |
| TASK-7.9 | done, merged | e02ca22 → cb25855 | TC-010 e2e green; TASK-7 Done |
| TASK-8 | done, merged | cabb714..8e6baa2 → dfc22d5 | TC-011–014 green; Done |
| TASK-10 | done, merged | 53a976a → 79809ee | TC-018 e2e green; Done |
| TASK-9 | done, merged | 775a2ad + fix 0c91131 → 04da776 | TC-015/016/017 PASS; e2e 32/32; unit 269; EXE7 |
| TASK-11 | done, merged | 2dbe8e7 → 96e14ca | TC-019 11/11; TC-020 git-order check at Stage 8; EXE6 |
| TASK-12 | dispatched (wave 2b) | worktree, port 3102 | base 1bd97bf |
| TASK-19 | dispatched (wave 3) | worktree, port 3103 | base 4303a32 |
| TASK-27 | dispatched (wave 3), part 1 | worktree | stops at user gate D6 |
| M-001 review | dispatched | read-only, main..4303a32 | max 2 fix rounds |
| TASK-20 | held | — | waits for TASK-12 merge (Investigation/RowCard overlap) |
| TASK-14 | done, merged | ec6b61c → 8f440a6 | TC-039/040 e2e green; ActivityLog mounted 8a0a6aa; Done |

Merge order planned: 7.9 → 8 → 10 → 14 (re-run test:all subset after each).
Next wave after merge: TASK-9 (after 8), TASK-11 (after 8; commit before TASK-12), TASK-27 (after 9, user gate D6).

## Decisions → logged as EXE1–EXE5 in decisions.md
- EXE: `lint` script ignores `src/domain/__lint__/**`; fixture linted separately.
- EXE: FS-numbering discrepancy (see earlier session).
- EXE: SR2 fixture re-exports `useState` instead of calling it, so `rules-of-hooks` cannot mask a missing SR2 rule. **TC-002 is NOT enforced until the user applies the SR2 override in `eslint.config.mjs`** (`pnpm lint:domain-fixture` currently exits 0).
- EXE: added devDep `eslint-formatter-compact` (commit-quality hook needs it).
- EXE: `E2E_PORT` env for parallel worktree e2e (7d93d40).

## Open threads
- Missing deps for later tickets: @tanstack/react-table (TASK-9), recharts (TASK-18), prettier.
- Rewrite HANDOFF.md at stage end.

- NavItems.tsx sidebar counts are hard-coded; after the TASK-8 seed, Queue shows 48 instead of the real count. Wire them to live data (TASK-9 scope or a follow-up).

## Wave 1 close (2026-10-31)
Merged and verified on 8a0a6aa: typecheck, lint, vitest 244/244, Playwright 22/22 (light+dark). Worktrees removed.
Follow-ups from agents: 375px shell overflows sideways (sidebar doesn't collapse); breadcrumb shows "Home" on /invoices/<id>; a normal build serves /e2e-harness as 200 + not-found, not 404; TASK-15 drafts must store amount_paise + ambiguous_match; Reset disabled until TASK-19.

## TASK-9 follow-ups (2026-10-31)
- Row skeleton doesn't show while DataProvider is loading (only after the db is ready).
- Sidebar nav labels have very low contrast in light theme (predates TASK-9). Stage 7.
- Mobile Queue layout: TASK-20.
