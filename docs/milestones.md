# Verilane Milestones

> **Date:** 2026-11-05  
> **Status:** Stage 5 Technical Planning complete  
> **Reference:** Orchestrator (`~/.claude/workflow/build-workflow.md`), Campfire PWA (`http://127.0.0.1:6480`)

---

## v1 Milestones (Completed)

### M-001: Tracer Bullet (v1)
- **Status:** Done
- **Date range:** 2026-10-30 to 2026-11-03
- **Description:** End-to-end tracer: one invoice through AI extraction, validation, dispute flow
- **Related tickets:** TASK-1 through TASK-19

### M-002: Email Intelligence (v1)
- **Status:** Done
- **Description:** Communication evidence extraction pipeline; evidence linking to invoices

### M-003: Approval Path (v1)
- **Status:** Done
- **Description:** Draft nine-checks approval gate; command.ts permission/transition/audit invariant

### M-004: Complete Workspace (v1)
- **Status:** Done
- **Description:** All routes, responsive, Settings data-ops, offline PWA

### M-005: Eval Gate & AI Modes (v1)
- **Status:** Done
- **Description:** pnpm eval harness; simulated mode as gate; live Claude (local-only opt-in)

### M-006: Ship Readiness (v1)
- **Status:** Done
- **Description:** Trust walk e2e, OG image, README, zero network check, responsive/a11y/states gates

---

## v2 Milestones (TASK-75)

### M-007: Exceptions Suite (v2 ExceptionOS scope change)

**Status:** In Planning (Stage 5 → Stage 6 transition)

**Gate to enter:** Stage 6 (Execution)
- [x] Solution-PRD approved (2026-11-05)
- [x] Design-TASK-75 approved (2026-11-05)
- [x] Technical plan written (2026-11-05)
- [x] Test cases specified (2026-11-05)
- [x] Campfire PWA synced (2026-11-05)

**Gate to exit (Stage 8 Code Review):** All critical tests pass (TC-001, 003, 012, 016, 017, 024, 025, 026)

**Tickets (TASK-79.1 through TASK-79.9):** See `tickets.md` below

**Related docs:**
- `docs/Solution-PRD-TASK-75.md` (approved 2026-11-05)
- `docs/Design-TASK-75.md` (approved 2026-11-05)
- `docs/technical-plan.md` (this stage)
- `docs/test-cases.md` (this stage)

**Sequencing rule (Solution-PRD §2.8):**
- **Gate:** TASK-45 and TASK-46 must both show **Done** in Campfire before any TASK-79 branch opens
- **Current status:** TASK-45 and TASK-46 are near-done (splash art, release evidence); expected Done by 2026-11-05 EOD

**Success criteria:**
1. `pnpm eval` passes all 9 gates (6 v1 + 3 new: policy-conflict, allocation-accuracy, pattern-detection)
2. Seed coverage test passes (all 4 required scenarios present)
3. Every new financial-writing path exercised in unit tests with one transaction + audit event verified (S14 invariant)
4. Policy agent gated rule table has exhaustive test coverage (every gate, every verdict, boundary conditions)
5. No v1 route, test ID, or redirect breaks (git diff on src/app/ routes is empty outside two new)
6. TASK-45/46 both Done before Stage 6 ticket starts work
7. NSM labelled "Simulated — one demo session = one analyst-week" everywhere shown

---

## Dependency DAG (M-007)

```
M-007: Exceptions Suite
  ├─ TASK-79.1: Schema (Exception, Payment.invoice_id, CreditNote, PolicyDecision)
  │   └─ TASK-79.2: Allocation E2E (one transaction, audit)
  │   └─ TASK-79.3: Recommend + Policy agents
  │       └─ TASK-79.4: Execute agent + action bar gating
  │           └─ TASK-79.5: Short-payment detection + credit-note command
  │               └─ TASK-79.6: Manager-only reversal
  │                   └─ TASK-79.7: NSM computation + Home
  │                       └─ TASK-79.8: Edge case fixtures + seed coverage test
  │                           └─ TASK-79.9: Release evidence + interview docs
  │
  └─ TASK-76: TASK-45/46 release gate check (verify Done before v2 starts)
```

**Critical path:** TASK-79.1 → 79.2 → 79.3 → 79.4 → 79.5 → 79.6 → 79.7 → 79.8 → 79.9 (sequential; each ticket depends on prior)

**Parallelizable work:** None (each ticket unlocks the next; all are critical path items for a ~2-week timeline)

**Estimated effort per ticket:** 2–3 days (ranging from 79.1 schema at ~1 day to 79.9 release evidence + interview docs at ~3 days)

---

## Milestone Timeline (Provisional)

| Milestone | Start | End | Status |
|-----------|-------|-----|--------|
| M-007 Exceptions Suite | 2026-11-06 (Stage 6 execution opens) | 2026-11-18 | In Planning |

**Assumptions:**
- TASK-45 and TASK-46 reach Done by 2026-11-05 EOD (per HANDOFF.md status)
- Stage 6 execution opens 2026-11-06
- One implementer per ticket; per-ticket code review before merge
- `pnpm eval` gate must pass before Stage 8 sign-off (~2026-11-18)

---

## Exit Criteria (Milestone Complete)

M-007 is **Done** when:

1. All 9 tickets (TASK-79.1 through TASK-79.9) are merged to main
2. `pnpm eval` passes with all gates (9/9: 6 v1 + 3 new)
3. `pnpm test` passes (unit + integration)
4. `pnpm build` succeeds with zero errors/warnings
5. Trust walk (§8.2 of Discovery PRD) succeeds end-to-end on production build (~10 min, uninterrupted)
6. Interview documents written and match running product (`docs/demo/interview-demo-script.md`, `docs/interview/product-case-study.md`)
7. All findings from Code Review (Stage 8) and Security Review (Stage 9) are either fixed or recorded in `docs/HANDOFF.md` as accepted tradeoffs

---

## Handoff to Stage 7 (Design Critique)

**Not applicable for TASK-75.** Design-TASK-75 was completed in Stage 3 (2026-11-05) and is already approved. Stage 7 is skipped for this backend-focused scope change (no UI-facing design decisions remain open).

---

## Handoff to Stage 8 (Code Review)

**Inputs:**
- All commits on `task/75-exceptions` branch (from Stage 6 execution)
- `technical-plan.md` + `test-cases.md` (above) as specification
- `decisions.md` entries S38–S46 (appended when branch lands)

**Scope:**
- All new/amended code paths (src/domain/policy.ts, src/ai/provider.ts, commands.ts amendments, Dexie schema, routes)
- Review against technical plan (§1–9 of technical-plan.md)
- CR- findings marked per code-review skill
- Fix loops bounded per orchestration-playbook

**Gate to Stage 9:** All critical findings resolved; major findings assessed for tradeoff vs. fix

---

**Milestone definition frozen:** 2026-11-05
**Ready for:** Stage 6 Execution (gate: TASK-45/46 Done, Campfire synced)
