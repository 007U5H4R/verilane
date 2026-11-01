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
| TASK-23 | done, merged | 2f52f80 (head 8bfd60a, base 041ff7a) | live Claude provider; EXE19 (deviation: `liveProvider` unused); vitest 623/623, e2e 123/1-skip, check:secrets clean; Done |
| TASK-24 | done, merged | be197ae (head fb23656) | 3aa052a (base 041ff7a), port 3111 | PWA; EXE17; vitest 585/585, e2e 113/1-skip (`--workers=1`); Done; SW off globally in playwright.config (on only in pwa.spec); seed manifest network-first; at TASK-23 merge: disable live-LLM trigger offline via `useOnline()` |
| TASK-21 | merged, In Progress | 4926f71 (head 30aa211, base d217d0c) | harness + /settings/eval; EXE21; TC-065/067/068/069 PASS, TC-066 FAIL (honest) → TASK-30/31; stays In Progress; TC-066 known limitation (EXE23) → list as known FAIL in Stage 8 QA report + README |
| TASK-22 | done, merged | 45dd9f8 (head 1d44703, base 4926f71) | FS11 fault injection; spec+quality pass; TC-070 25/25 per kind, TC-071 0/218 approvals; `recordRejection` only called from eval — no runtime provider ingest exists (extractions are seeded, `liveProvider` unused per EXE19) → wiring parked to close-out; EXE24; unit 723/723, e2e 129/1-skip; Done |
| TASK-30 | done, merged | merge + 58e1b34 report (impl e310c1e) | tsc/lint/unit 699/699 green; single heldout-v2 measurement: dispute 3/9→4/9, approval 38/56→42/58, matching 20/23 (unchanged), class 14/30→15/30; old heldout dispute 2/9→4/9, approval 38/54→54/62; TC-066 still FAIL; no tuning against v2; user: known limitation; EXE23; Done |
| TASK-31 | done, merged | 39a5d42 (head 5674130, base 4926f71) | `eval/heldout-v2` 30 threads; barrier verified from transcript (classifier never opened); labels committed before run; pre-fix baseline dispute 3/9, approval 38/56, matching 20/23, class 14/30; EXE22; Done; debatable labels H2-003/012/011 left unedited |
| TASK-25 | done, merged | d345663 (head 655b84f) + 597aa4b perf isolation | a11y/perf/states/controls sweep; EXE25; unit 729/729 + perf 1/1, route budget 12/12, e2e 169/1-skip (`--workers=1`); Done; T25-5 parked to close-out |
| TASK-26 | done, merged | f1bc396 (head 09b9625, base 437b834) | trust-walk e2e; TC-086/087 PASS both themes; Done |
| TASK-32 | done, merged | e83266c (head 4488446, base 3902427), port 3115 | close-out: test infra (portable PW paths, `test:all --workers=1`, vitest timeouts, deterministic eval report, R20, T18-N2, T25-5); review PASS-WITH-FIXES, 1 fix round; EXE27; tsc/lint clean, unit 738/738, perf 1/1, build + secrets + e2e-hooks clean, route budget 12/12, e2e 169/1-skip (`--workers=1`) after one-time `pnpm e2e:install`; Done |
| TASK-33 | In Progress, dispatched | base 3902427, port 3117 | close-out: R7–R11, T16-4/T16-R1 (product call: failed-check drafts excluded from count, shown "Blocked — checks failed"), live NavItems counts |
| TASK-34 | In Progress, dispatched | base 3902427, port 3119 | close-out: R18, R21, breadcrumb on /invoices/<id> |
| TASK-35 | In Progress, dispatched | base 3902427, port 3121 | close-out: T24-5/7/11/12, N1, N2 |
| TASK-36 | In Progress, dispatched | base 3902427, port 3123 | close-out: T23-6/7/10/11, T23-R1–R4, recordRejection wiring check, offline gate check |
| TASK-28 | done, merged | 29d2bea (base a2622a0, ff-only) | README + trust boundary + eval results; EXE26; TC-090 fresh-clone verbatim run passed except `test:all`/`eval` hit vitest default timeouts under load (not the expected 8-gate stop) — new defect beyond TC-084/EXE25; tsc/lint clean on merged branch; Done |

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
- TASK-23 re-review parked (close-out wave): T23-R1 (truncated/refused → generic invalid_output), T23-R2 (minified error class in logs), T23-R3 (cost assumes Opus 5.5 under override), T23-R4 (no literal ANTHROPIC test). First live UI trigger must be gated by `useOnline()`.
- TASK-28 (TC-090) found two more close-out items: `test:all`'s `e2e` step is missing `--workers=1` in `package.json`; the `unit` project's default 5 s test timeout and the `eval` project's default 10 s hook timeout both flake under agent load (beyond TC-084/EXE25, which only isolated `perf`) — give `unit`/`eval` more headroom or isolate `eval` into its own lane the way TC-084 was. Also noted, lower priority: dev-mode "Could not validate `instant`" overlay noise at `RootLayout`/`DataProviderLoader` (cosmetic only).
