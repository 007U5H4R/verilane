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
| TASK-12 | done, merged b336325 | — | 393 unit, e2e 36/36 on merged branch |
| TASK-19 | done | merged c7d6e63 | R4, R5 fixed; EXE9 |
| TASK-27 | dispatched (wave 3), part 1 | worktree | stops at user gate D6 |
| M-001 review | done: pass-with-fixes (R1, R2 major) | read-only, main..4303a32 | max 2 fix rounds |
| TASK-20 | dispatched (wave 3b) | worktree, port 3105 | base b336325; + review R2, R3, R13 |
| TASK-13 | done | merged e544c89 | R1, R6, R12 fixed; EXE10 |
| TASK-15 | in progress | base 183157b, port 3106 | drafts + nine checks |
| TASK-17 | in progress | base 183157b, port 3107 | disputes state machine |
| M-002 | PASS-WITH-FIXES | review of TASK-11/12/13 | R14–R21 |
| TASK-29 | in progress | base 3c99593, port 3108 | M-002 fix round 1: R14–R17 |
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

## M-001 review routing (reports/M-001-review.md)
- R1, R6, R12 → TASK-13 (priority gates and recompute signals).
- R2, R3, R13 → TASK-20 (axe + 390px, loading shell, back link).
- R4, R5 → TASK-19 (sent mid-flight).
- R7 (duplicate formatters), R8 (Paise brand at schema), R9 (ingest throws instead of DataIssue), R10 (EXE4 wording), R11 (tx scope) → parked for the Stage 6 close-out fix wave.
## M-002 review routing (reports/M-002-review.md)
- R14, R15, R16, R17 → TASK-29 (fix round 1).
- R19 → TASK-17 (its brief already adds the non-nested dispute link on the muted Queue row); recheck the G5/G7 badges at merge.
- R18 (G4/G5 evidence id hidden in Communication) → after TASK-15 merges, since TASK-15 owns the investigation components.
- R20 (held-out coverage assertion), R21 (axe + 390px on /payments and Communication) → parked for the Stage 6 close-out fix wave.
