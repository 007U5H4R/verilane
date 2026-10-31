# Stage 6 ledger (Execution)

Branch: `build/verilane-v1`. Briefs: `/Volumes/E Drive/Dev/.scratch/verilane/briefs/`. Reports: `/Volumes/E Drive/Dev/.scratch/verilane/reports/`.

IDs in this ledger are Campfire IDs: run `backlog task edit <N>` with the TASK number exactly as written here. Only TKT ids need the +5 conversion (TKT-11 is TASK-16). On 2026-10-31 TASK-21 was set to Done by mistake and then restored.

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
| TASK-27 | done, merged | a687573 | OG image wired; EXE14; vitest 565/565, e2e 73/1-skip (`--workers=1`) |
| M-001 review | done: pass-with-fixes (R1, R2 major) | read-only, main..4303a32 | max 2 fix rounds |
| TASK-20 | done, merged | b888ae3 | R2/R3/R13 fixed; EXE12; vitest 542/542, e2e 69/1-skip |
| TASK-13 | done | merged e544c89 | R1, R6, R12 fixed; EXE10 |
| TASK-15 | done, merged | 3388573 (base 183157b) | drafts + nine checks; EXE11; R18 now unblocked |
| TASK-17 | done, merged | 36f8269 (impl 5c59853, base 183157b) | disputes state machine; EXE15; PPR `:`-in-id fix; vitest 568/568, e2e 83/1-skip (`--workers=1`) |
| M-002 | PASS-WITH-FIXES | review of TASK-11/12/13 | R14–R21 |
| TASK-29 | done, merged | 6856260 | R14–R17 fixed; EXE13; vitest 561/561, e2e 71/1-skip (`--workers=1`) |
| TASK-14 | done, merged | ec6b61c → 8f440a6 | TC-039/040 e2e green; ActivityLog mounted 8a0a6aa; Done |
| TASK-16 | done, merged | fd6e4ad (head 7b17f0a, base 041ff7a) | approve/confirm/send + Drafts; EXE18; vitest 593/593, e2e 123/1-skip (`--workers=1`); Done; T16-4 + T16-R1 parked (failed-recheck draft still counts as ready) |
| TASK-18 | done, merged | cfe0f4c (head 4d396a5) | Home KPIs/feed/charts; EXE16; vitest 575/575, e2e 99/1-skip (`--workers=1`); Done |
| TASK-23 | fix round 1 (review PASS-WITH-FIXES: T23-1/2/3 major; fresh implementer, original not resumable) | c63fc69 (base 041ff7a), port 3110 | live Claude provider; `liveProvider` unused → log as EXE deviation at merge |
| TASK-24 | done, merged | be197ae (head fb23656) | 3aa052a (base 041ff7a), port 3111 | PWA; EXE17; vitest 585/585, e2e 113/1-skip (`--workers=1`); Done; SW off globally in playwright.config (on only in pwa.spec); seed manifest network-first; at TASK-23 merge: disable live-LLM trigger offline via `useOnline()` |

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
- This machine's default `pnpm e2e` worker count (4) produces intermittent false failures on `responsive.spec.ts` (axe R2, TC-062) and occasionally `drafts.spec.ts`/`investigation.spec.ts` under concurrent Chromium/axe-core load — not a code defect (confirmed by file- and worker-count-level bisection, disk space ruled out). Re-run the e2e gate with `--workers=1` on this machine for a trustworthy signal before merging.
- Next.js 16 Cache Components: an explicit `openGraph.url` in the *root* layout's metadata forces `/invoices/[id]` into `blocking-prerender-metadata-runtime` at build time, even though the field is a constant string. Give the canonical `openGraph.url` to the specific static route that needs it instead (see EXE14) — Next 16 merges metadata per-segment, not as a deep merge.

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
- R2, R3, R13 → TASK-20 (axe + 390px, loading shell, back link). Fixed, merged b888ae3.
- R4, R5 → TASK-19 (sent mid-flight).
- R7 (duplicate formatters), R8 (Paise brand at schema), R9 (ingest throws instead of DataIssue), R10 (EXE4 wording), R11 (tx scope) → parked for the Stage 6 close-out fix wave.
## M-002 review routing (reports/M-002-review.md)
- R14, R15, R16, R17 → TASK-29 (fix round 1). Fixed, merged 6856260.
- R19 → resolved at TASK-17 merge (36f8269): the dispute link was added as a sibling of the row's `<a>`, and the merge conflict resolution preserved TASK-13's G4/G5/G7 badge logic unchanged alongside it.
- R18 (G4/G5 evidence id hidden in Communication) → TASK-15 merged (3388573); still open, now actionable against the merged investigation components.
- R20 (held-out coverage assertion), R21 (axe + 390px on /payments and Communication) → parked for the Stage 6 close-out fix wave.
- T18-N2 follow-up: `tests/e2e/home.spec.ts` still has 7 seed-guard `test.skip` calls (lines 66–182) that would silently pass on an empty/changed seed → close-out wave (convert to hard asserts).
- TASK-24 review parked (close-out wave): T24-5 (offline nav to unvisited URL serves Home HTML; query-string URLs miss cache), T24-7 (dev doesn't unregister a prod SW on same origin), T24-11 (icon crop 1px narrow), T24-12 (chunk cache unbounded until seed bump). Follow-ups: one e2e journey with `serviceWorkers: "allow"` (TASK-26); manual Lighthouse installable check (HITL).
- TASK-24 × TASK-23 merge: TopBar.tsx conflict — keep `<LlmStatusBadge />`, drop `Sparkles` import, add `<InstallChip />` after the badge.
- TASK-23 review parked (close-out wave): T23-6 (no request/context size limit), T23-7 (no system prompt; untrusted email text not delimited), T23-10 (effort unset), T23-11 (thin tests). HITL: live path never exercised with a real key.
- TASK-24 re-review parked (close-out wave): N1 (`seedBypass` not reset when manifest falls back to cache → offline seed load fails after a bad deploy), N2 (writes to old cache between copy and delete are lost). Playwright browsers/temp not redirected to E Drive in playwright.config.ts — runs need PLAYWRIGHT_BROWSERS_PATH + TMPDIR (asked user).
