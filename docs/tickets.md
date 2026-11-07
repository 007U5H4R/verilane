# TASK-75 Tickets Mapping (Stage 5 Technical Planning)

> **Date:** 2026-11-05  
> **Status:** Tickets created, awaiting Stage 6 execution  
> **Reference:** `backlog/tasks/`, Campfire PWA, M-007 (Exceptions Suite)

---

## v1 Tickets (Done)

| TKT | task-ID | Title | Status |
|-----|---------|-------|--------|
| TASK-1 | task-1 | Write Discovery-PRD for Verilane AR copilot | Done |
| TASK-2 | task-2 | Write Solution-PRD and architecture docs | Done |
| TASK-3 | task-3 | Stage 3 UI/UX Design | Done |
| TASK-4–TASK-19 | task-4–task-19 | Execution: [tracer, extractor, matcher, validator, commands, drafts, disputes, home, settings, responsive, eval, fault injection, live Claude, PWA, quality, e2e, OG, README] | Done |
| TASK-20–TASK-34 | task-20–task-34 | Quality sweep, trust walk, interview docs, regression fixes | Done |

---

## v2 Stage 1–4 Tickets (Completed)

| TKT | task-ID | Title | Status |
|-----|---------|-------|--------|
| TASK-75 | task-75 | Run product discovery for ExceptionOS scope change | Done |
| TASK-77 | task-77 | Run solution design for ExceptionOS scope change | Done |
| TASK-78 | task-78 | Run problem breakdown for ExceptionOS scope change | Done |

---

## v2 TASK-75 Gate (Stage 4 Breakdown, This Stage 5)

| TKT | task-ID | Title | Status | Gate |
|-----|---------|-------|--------|------|
| TASK-76 | task-76 | Release TASK-45.9 and 45.10 splash art and release evidence r3 | Done (expected 2026-11-05) | **[CRITICAL]** TASK-45 and TASK-46 must reach Done before any TASK-79 ticket's branch opens |

**Gate rule (Solution-PRD §2.8):** No TASK-79 branch may open until both TASK-45 (splash) and TASK-46 (heritage) are Done in Campfire.

---

## v2 Stage 5 Artifacts (This Document)

| Artifact | Status | Notes |
|----------|--------|-------|
| `technical-plan.md` | ✅ Created | Architecture, data model, agents, commands, UI flows, risks, deployment |
| `test-cases.md` | ✅ Created | 33 test cases (TC-001 through TC-033): unit, integration, e2e, eval gates |
| `milestones.md` | ✅ Created | M-007 Exceptions Suite; dependencies; timeline; exit criteria |
| `tickets.md` | ✅ Created | This file: TKT ↔ task-ID mapping |

---

## v2 Stage 6+ Tickets (TASK-79.x: Execution & Beyond)

### Stage 6 Execution Tickets (Branches to be created 2026-11-06+)

| TKT | task-ID | Title | Description | Est. Days | Critical Path? |
|-----|---------|-------|-------------|-----------|---|
| **TASK-79** | task-79 | Build the ExceptionOS v2 scope change | Umbrella ticket (epic) for all v2 implementation | — | Parent |
| **TASK-79.1** | task-79.1 | Cut the branch, rename ReviewItem to Exception, and widen Payment.invoice_id | Schema bump (v1 → v2); migration function; rename; nullable invoice_id; new tables (creditNotes, policyDecisions) | 1 | Y |
| **TASK-79.2** | task-79.2 | Trace an unallocated payment end-to-end from seed to allocation | E2E test: seed → Recommend → Policy → Execute → resolved; verify one transaction + audit; verify NSM updates | 2 | Y |
| **TASK-79.3** | task-79.3 | Add Recommend and Policy agents with an append-only PolicyDecision | Implement src/domain/policy.ts; gated rule table (G1–G7); unit tests for every gate; Recommend agent outputs; PolicyDecision append-only invariant | 2 | Y |
| **TASK-79.4** | task-79.4 | Auto-execute auto_permitted decisions and gate the action bar | Execute agent: reads PolicyDecision verdict, calls commands.ts for auto_permitted, queues others; UI action bar: "Submit for approval" enabled/disabled based on verdict; permission checks | 2 | Y |
| **TASK-79.5** | task-79.5 | Detect short-payment patterns and add Manager-only credit-note write-off | Pattern detection: ≥3 short payments in 90 days → one Exception; Manager approves → CreditNote command; Analyst blocked; one transaction invariant | 2 | Y |
| **TASK-79.6** | task-79.6 | Let a Manager reverse an applied allocation | F16: Reversal command; Manager-only permission; audit event; NSM guardrail (reversal rate) tracking; exception status reset to 'open' | 1 | Y |
| **TASK-79.7** | task-79.7 | Compute the NSM and guardrails live on Home | NSM = Σ(correctly resolved exception value this session) ÷ 1; Home page amended section; "Simulated" label on every display; guardrail counters (reversal, inappropriate-reminder, unapproved-execution rates) | 2 | Y |
| **TASK-79.8** | task-79.8 | Add edge-case payment fixtures and the allocation-accuracy gate | Seed data: unallocated, pattern, ambiguous, overpayment cases; coverage test (build fails if any missing); eval gate: allocation-recommendation accuracy ≥100%; pattern-detection recall ≥100% | 1 | Y |
| **TASK-79.9** | task-79.9 | Collect ExceptionOS release evidence and interview docs | Interview walkthrough (~10 min, uninterrupted); write `docs/demo/interview-demo-script.md` and `docs/interview/product-case-study.md`; all routes e2e test | 2 | Y |

**Total:** 9 tickets, ~15 estimated days (linear critical path; no parallelization possible at scope change this deep)

**Stage 6 gate to proceed:** TASK-45 and TASK-46 both Done; Campfire synced; technical-plan.md + test-cases.md approved by user

---

## Ticket → Task Mapping Summary

### Via Campfire Backlog CLI

Each ticket is created as a backlog task using the Backlog.md CLI (not hand-edited). Example:

```bash
# From /Volumes/E Drive/Dev/Code/Claude/Verilane/:
/Volumes/E Drive/Dev/Code/Claude/PM Tools/backlog-md-fork/dist/backlog task create \
  "Cut the branch, rename ReviewItem to Exception, and widen Payment.invoice_id" \
  --type feature \
  --priority High \
  -l P1 \
  -d "Schema bump v1→v2; migration; new tables"
```

This generates `backlog/tasks/task-79.1 - Cut-the-branch-…md` with auto-generated ID (never hand-picked).

### Mapping Table

| TASK | task-ID | Backlog File | Status | Type | Related TC | Notes |
|------|---------|--------------|--------|------|-----------|-------|
| TASK-79.1 | task-79.1 | `task-79.1 - Cut-the-branch-…md` | To Do | feature | TC-001, 002, 003, 005 | Schema migration; no UI |
| TASK-79.2 | task-79.2 | `task-79.2 - Trace-an-unallocated-payment-…md` | To Do | feature | TC-016 | E2E flow verification; critical path |
| TASK-79.3 | task-79.3 | `task-79.3 - Add-Recommend-and-Policy-agents-…md` | To Do | feature | TC-006–011, 024–027 | Agent architecture; policy gates |
| TASK-79.4 | task-79.4 | `task-79.4 - Auto-execute-auto_permitted-…md` | To Do | feature | TC-012–015, 020–023 | Execute agent; action bar; permission gates |
| TASK-79.5 | task-79.5 | `task-79.5 - Detect-short-payment-patterns-…md` | To Do | feature | TC-017, 025, 026 | Pattern detection; credit-note command |
| TASK-79.6 | task-79.6 | `task-79.6 - Let-a-Manager-reverse-…md` | To Do | feature | TC-019 | Reversal command; NSM guardrail impact |
| TASK-79.7 | task-79.7 | `task-79.7 - Compute-the-NSM-…md` | To Do | feature | TC-022, 024–027 | NSM computation; Home UI; honest labeling |
| TASK-79.8 | task-79.8 | `task-79.8 - Add-edge-case-payment-fixtures-…md` | To Do | feature | TC-018, 025, 026, 027 | Seed data; eval gates |
| TASK-79.9 | task-79.9 | `task-79.9 - Collect-ExceptionOS-release-…md` | To Do | docs | TC-033, 028–030 | Release evidence; interview docs |

---

## Stage 5 Sign-Off Checklist

Before moving to Stage 6 (Execution), verify:

### Entry Gates
- [x] Solution-PRD-TASK-75 approved (2026-11-05)
- [x] Design-TASK-75 approved (2026-11-05)
- [x] Campfire PWA running and synced (2026-11-05)
- [x] TASK-45 and TASK-46 near Done (expected 2026-11-05 EOD)
- [x] Existing project structure inspected (milestones M-001 to M-006, tickets TASK-1 to TASK-34)

### Artifacts Delivered
- [x] `technical-plan.md` (§1–11: architecture, data, agents, flows, tests, risks, deployment, milestones, decisions)
- [x] `test-cases.md` (33 test cases: TC-001 through TC-033; unit/integration/e2e/eval/manual)
- [x] `milestones.md` (M-007 Exceptions Suite; dependencies; timeline; exit criteria)
- [x] `tickets.md` (this file: TASK-79.1 through TASK-79.9 mapping)
- [x] `decisions.md` entries (TP26–TP28, drafted as TP1–TP3, appended once TASK-75 branch lands; EXE118)

### Technical Completeness
- [x] Data model specified (Exception, nullable Payment.invoice_id, CreditNote, PolicyDecision, Dexie v2)
- [x] Agent state machine documented (Recommend → Policy → Execute → audit)
- [x] Data flows traced (unallocated payment, short-payment pattern, reversal)
- [x] UI routes planned (/exceptions, /exceptions/[id], / amended)
- [x] Test architecture wired (unit, integration, e2e, eval gates, seed fixtures)
- [x] Risks identified and mitigated
- [x] Deployment & rollback strategy stated
- [x] Campfire PWA synced with milestones/tickets

### User Sign-Off
- [ ] User reviews and approves `technical-plan.md`
- [ ] User reviews and approves `test-cases.md`
- [ ] User reviews and approves `milestones.md` timeline (expect ~15 days for 9 tickets)
- [ ] User authorizes Stage 6 execution start (gate: TASK-45/46 Done by 2026-11-05 EOD)
- [ ] User confirms "ready to hand off to Stage 6 orchestration"

---

## Stage 6 Handoff

**Rewrite `HANDOFF.md`** → Record:
1. Stage 5 complete; entry gate to Stage 6 closed
2. TASK-45/46 status: Done / In Progress / Not Done (gates entry)
3. M-007 active; TASK-79.1 ready to start
4. `task/75-exceptions` branch to be created from `main` (after TASK-45/46 merge)
5. Per-ticket estimates: 9 tickets, ~15 days linear critical path
6. Test gates: all critical TCs (TC-001, 003, 012, 016, 017, 024, 025, 026) must pass before Stage 8 sign-off
7. Interview walkthrough (TC-033) must succeed before Stage 10 Production Monitoring

**Next session:** Launch Stage 6 (Execution) skill with this technical plan as input

---

**Technical Planning Complete:** 2026-11-05
**Status:** Ready for user approval and Stage 6 execution start
**Contingencies:** TASK-45/46 gate failure → defer Stage 6 start (to be decided at gate moment)
