# Verilane — Milestones

> Stage 4 · Problem Breakdown · Campfire TASK-4 · 2026-10-30
> Inputs: [`Solution-PRD.md`](Solution-PRD.md) (S8–S14, SR1–SR12, NFR1–NFR8), [`Design.md`](Design.md) (frozen; D1–D6), [`docs/`](docs/). Tickets: [`tickets.md`](tickets.md).
> IDs: `M-###` are stable. Campfire milestone IDs: M-001…M-006 → `m-0`…`m-5`. Tickets mapped to native IDs in Stage 5 (`TKT-01 → TASK-6` … `TKT-23 → TASK-28`, see `tickets.md`).

## Sequence at a glance

```
M-001 Tracer bullet ──► M-002 Email intelligence ──► M-003 Approval path ──► M-005 Eval gate
        │                                                   │                     │
        └──────────────► M-004 Complete workspace ◄─────────┘                     ▼
                                     │                               M-006 Ship readiness
                                     └───────────────────────────────────────────►┘
```

M-002 and the command core in M-003 (TKT-09) can run in parallel after M-001. M-004 overlaps M-003. M-006 closes the build and feeds Stages 7–10.

---

## M-001 · Tracer bullet: seed → IndexedDB → priority → Queue → evidence
- **Objective:** prove the riskiest end-to-end path first: committed seed data loads into per-visitor IndexedDB, the pure domain engine ranks it with `priority.v1`, the Queue lists it, and Investigation shows every invoice fact with its provenance line.
- **Scope:** repo scaffold and shell, domain `schema/money/clock/ingest/priority/evidence` (ledger-only gates G1, G2, G3, G6 plus scoring), Dexie store and seed loader, full synthetic seed and coverage test, Queue with filters and four states, storage fallback (SR9).
- **Deliverables:** running `pnpm dev` with zero env; Queue → Investigation walk on real seed data; unit tests for worked examples A, B and E.
- **Tickets:** TKT-01, TKT-02, TKT-03, TKT-04, TKT-05
- **Dependencies:** none (first milestone).
- **Entry:** Solution-PRD and Design.md approved (done).
- **Exit:** a fresh browser opens `/queue`, sees 50 ranked invoices, opens one and every Invoice-facts value shows `Source · Row · Field`; FS1, FS2, FS8, FS10 tests pass.
- **DoD:** milestone tickets meet the common DoD in `tickets.md`; the tracer e2e (TC-010) is green on a production build.
- **Priority:** P0 · **Status:** Not started
- **Risks:** Dexie/SSR friction in the App Router (mitigate: client-only data hooks, tested in TKT-02); token port from mockup drifts (mitigate: copy `:root` verbatim).

## M-002 · Email intelligence (simulated provider, strict matching)
- **Objective:** turn the 25 seeded threads into validated extractions, strict matches and classifications, and make them change priority and show as evidence.
- **Scope:** held-out eval set and independent labels authored **before** extractor rules are frozen (S13), provider interface with a `Result` type, simulated extractor and classifier, strict matcher, review items, gates G4/G5/G7 and the broken-promise factor, Communication evidence table, Payments page.
- **Tickets:** TKT-06, TKT-07, TKT-08
- **Dependencies:** M-001.
- **Entry:** seed (TKT-03) committed.
- **Exit:** worked examples C and D pass; FS3, FS4, FS5, FS6, FS7, FS9 tests pass; Payments page lists unmatched or ambiguous items.
- **DoD:** common DoD; no fuzzy matching anywhere (reviewed in code).
- **Priority:** P0 · **Status:** Not started
- **Risks:** the extractor overfits seed wording (mitigate: held-out set written first, by TKT-06, and locked); "not keyword-only" claim slips (mitigate: signal + supporting token unit tests).

## M-003 · Approval path (the trust walk)
- **Objective:** a single write path for every state change, with permissions, audit and the nine checks, so an analyst can take an invoice from evidence to an approved, simulated send, and disputed invoices are blocked.
- **Scope:** `commands/permissions/transitions` + audit, role switcher, Audit log page, drafting + nine checks + action bar, approve/confirm/simulated send, Drafts page, Disputes page and state machine.
- **Tickets:** TKT-09, TKT-10, TKT-11, TKT-12
- **Dependencies:** M-001 (TKT-09 can start right after it); TKT-10 and TKT-12 also need M-002.
- **Exit:** the S6 trust walk works by hand in the running app; FS12, FS13 tests pass; every command emits exactly one audit event.
- **DoD:** common DoD; permission matrix tested exhaustively (role × action).
- **Priority:** P0 · **Status:** Not started
- **Risks:** atomicity of state + audit in Dexie (mitigate: one `rw` transaction per command, a failure-injection unit test).

## M-004 · Complete workspace
- **Objective:** every destination in the frozen IA works with no dead controls: Home, Settings, import/export/reset, theme, and the responsive shell at all four widths.
- **Tickets:** TKT-13, TKT-14, TKT-15
- **Dependencies:** M-001; TKT-13 needs TKT-12 (dispute counts); TKT-14 needs TKT-09 (audited commands).
- **Exit:** all seven routes render all four states; CSV import rejects a bad file with row errors and audits it; no horizontal scroll at 1440/1280/768/390.
- **DoD:** common DoD.
- **Priority:** P1 · **Status:** Not started
- **Risks:** mobile shell regressions late in the build (mitigate: overflow test added in TKT-15 runs on every later PR).

## M-005 · Eval gate and AI modes
- **Objective:** measure the Discovery §8.2 targets honestly with `pnpm eval` and prove the guardrails under fault injection; add the optional local-only live provider.
- **Tickets:** TKT-16, TKT-17, TKT-18
- **Dependencies:** M-002, M-003.
- **Exit:** `pnpm eval` exits 0 with all gates met on seed **and** held-out sets; two runs are byte-identical apart from `generatedAt`; fault-injection rejection rate 100%; `/api/llm/*` returns 503 with no env.
- **DoD:** common DoD; `eval/report.md` committed.
- **Priority:** P0 (TKT-16, TKT-17) / P2 (TKT-18) · **Status:** Not started
- **Risks:** a gate miss tempts label edits (rule: labels change only via `eval/CHANGELOG.md` with reason).

## M-006 · Ship readiness
- **Objective:** make the build releasable: PWA, cross-cutting quality sweep (four states, axe, responsive, no dead controls, performance budgets, secret scan), trust-walk e2e on the production build, approved OG image and tags, README.
- **Tickets:** TKT-19, TKT-20, TKT-21, TKT-22, TKT-23
- **Dependencies:** M-004, M-005. TKT-22 needs only TKT-04 and can run early.
- **Entry:** all feature tickets done.
- **Exit:** NFR1–NFR8 measured and met; S6 trust walk e2e green on `pnpm build && pnpm start`; OG image approved by the user (D6) — **hard prerequisite for Stage 10**.
- **DoD:** common DoD; evidence (reports, screenshots) saved for the Stage 8/9 QA report.
- **Priority:** P0 (TKT-20, TKT-21, TKT-22) / P1 (TKT-19, TKT-23) · **Status:** Not started
- **Risks:** service worker caches a stale seed after Reset (mitigate: versioned cache key = seed version); OG approval is a user gate, so it is scheduled early to keep it off the critical path.
