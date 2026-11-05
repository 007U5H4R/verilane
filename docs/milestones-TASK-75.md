# TASK-75 — Milestones (Verilane v2 · ExceptionOS scope change)

> Stage 4 · Problem Breakdown · Campfire TASK-75 · 2026-11-05 · **APPROVED 2026-11-05** (9-ticket vertical-slice breakdown, user sign-off)
> Inputs (all approved): [`Discovery-PRD-TASK-75.md`](Discovery-PRD-TASK-75.md) (F12–F18, FS14–FS22, §8.1 NSM + guardrails, §8.2 walk, §8.3 targets), [`Solution-PRD-TASK-75.md`](Solution-PRD-TASK-75.md) (§2.1–2.9, R1–R11, §5 docs, §6 DoD 1–7, §7 matrix, §8 NFRs, §9 risks, Appendix A S38–S46), [`Design-TASK-75.md`](Design-TASK-75.md) (frozen 2026-11-05, §22; mockup `.design/exploration/task-75/mockup.html`). Tickets: [`tickets-TASK-75.md`](tickets-TASK-75.md).
> Scope: ticket-scoped. Root `milestones.md`, `tickets.md` are not touched. `decisions.md` S38–S46 are appended only on the TASK-75 branch (TKT-75.01).
> IDs: provisional `M-75.1`…`M-75.3`, `TKT-75.01`…`TKT-75.09`, `TC-75.xx`. Campfire IDs are canonical: parent TASK-79, TKT-75.0N = TASK-79.N (mapping in the tickets doc). Stage 5 allocates real `TC-###` numbers.

## Stage 4 decisions recorded at sign-off

| ID | Decision | Consequence |
|---|---|---|
| D75-1 | **True auto-execute** (user choice, 2026-11-05): when Policy returns `auto_permitted`, the Execute agent writes through `commands.ts` with the Execute agent as actor and no human click (Solution-PRD §2.3/§7 stands). | Frozen Design §4/§11 ("Awaiting analyst approval", "Submit for approval" on `auto_permitted`) and Discovery F15 / §8.1 / §8.3 ("a permitted human approves", "actions executed without approval = 0") conflict with it. A post-freeze amendment (**gate A1**) must be user-approved before TKT-75.04 starts. See "Gate A1" below. |
| D75-2 | Rename `ReviewItem` → `Exception` lands as **one compiler-driven prefactor ticket** (38 files / ~278 references), not expand–contract. | Strict TS catches every call site; the suite stays green within one ticket. Test IDs (`data-testid="review-item"`) and route-visible copy are **not** renamed (R10, DoD 5). |
| D75-3 | Nullable `Payment.invoice_id` widening + R2 null-handling audit (~48 payment `invoice_id` reads) goes into the same prefactor. | The tracer starts on a schema that already carries unapplied cash safely; the dangerous failure (silently dropping unapplied payments from totals) is pinned by a test before any feature reads it. |
| D75-4 | Docs (Architecture / Data-Model / AI-Evaluation), eval gates and e2e travel **with the slice that creates the behaviour**. No horizontal docs/eval/e2e tickets. | Each ticket's DoD names its doc section, gate and TCs. |

## Entry gates

- **G0 — TASK-45 and TASK-46 Done in Campfire** (Solution-PRD §2.8, §6 DoD 6, S46). No TASK-75 branch is opened before both show Done. At sign-off (2026-11-05) open: 45.5, 45.6, 45.8, 45.10, 46.4, 46.7, 46.8. Planning (Stage 5) may proceed; execution (Stage 6) may not.
- **A1 — Design/Discovery amendment for auto-execute (blocks TKT-75.04).** Drafted in TKT-75.01, approved by the user before TKT-75.04 starts. Content:
  1. Design §4 Stage 3 copy: `auto_permitted` → "Executed by Execute agent · {time} · policy v{n}" (not "Awaiting analyst approval").
  2. Design §11 action bar matrix: `auto_permitted` → resolved, button disabled "Already resolved"; `needs_analyst` → Analyst "Submit for approval" enabled; `needs_manager` → disabled for Analyst ("Manager approval required"), enabled for Manager; `blocked` → disabled with the policy reason.
  3. Design §11: Manager-only **"Reverse allocation"** control on a resolved allocation (F16). This is a new button, which the freeze sends back to design review, so A1 covers it explicitly.
  4. Design §6 copy fix: "Normalized Success Metric" → "North Star Metric" (Discovery §8.1 name).
  5. Discovery F15 / §8.1 / §8.3: "approval" is satisfied either by a permitted human or by a versioned `auto_permitted` `PolicyDecision` (standing policy approval). "Actions executed without approval = 0" then means: no write without either. The metric is kept, not dropped.

## Sequence at a glance

```
G0 (TASK-45/46 Done)
   │
   ▼
┌──────────── M-75.1 Foundation + tracer ─────────────┐
│ TKT-75.01 branch + S38–S46 + rename + nullable      │
│     invoice_id + Dexie v2 + A1 draft                │
│        │                                            │
│        ▼                                            │
│ TKT-75.02 TRACER: unallocated payment end-to-end    │
│  (seed → detect → /exceptions → detail → allocate)  │
└────────┬───────────────────────────┬────────────────┘
         │                           │
┌────────▼──── M-75.2 Agent pipeline + money actions ─┴──────────┐
│ TKT-75.03 Recommend + Policy ──► TKT-75.04 Execute (needs A1)  │
│        │                              │                        │
│        ▼                              ▼                        │
│ TKT-75.08 edge fixtures +      TKT-75.05 short-payment pattern │
│  allocation-accuracy gate       → Manager credit-note write-off│
│                                                                │
│ TKT-75.06 F16 reversal (Manager) ◄── 02                        │
└────────┬───────────────────────────┬───────────────────────────┘
         │                           │
┌────────▼────── M-75.3 NSM + release ▼─────────────┐
│ TKT-75.07 NSM + guardrails on Home  ◄── 05, 06    │
│ TKT-75.09 release evidence + F17 docs ◄── 07, 08  │
└───────────────────────────────────────────────────┘
```

Blocking edges (authoritative copy in `tickets-TASK-75.md`):

| Ticket | Blocked by | Unblocks |
|---|---|---|
| TKT-75.01 | G0 | 02 |
| TKT-75.02 | 01 | 03, 06 |
| TKT-75.03 | 02 | 04, 08 |
| TKT-75.04 | 03, A1 | 05 |
| TKT-75.05 | 04 | 07 |
| TKT-75.06 | 02 | 07 |
| TKT-75.07 | 05, 06 | 09 |
| TKT-75.08 | 03 | 09 |
| TKT-75.09 | 07, 08 | Stage 7 / 8 |

Parallelism after the tracer: two lanes. {03 → 04 → 05} (agent pipeline; shares `domain/policy.ts` and the detail page's agent blocks, so it runs in sequence) and {06} (reversal; touches `commands.ts` and the allocation audit only). After 03, {08} joins. 06 and 04 both add commands to `commands.ts`; merge whichever finishes first, rebase the other.

Critical path: 01 → 02 → 03 → 04 → 05 → 07 → 09 (≈ 32 of 38 sp). A1 approval time is the most likely wall-clock slip; the draft goes out with TKT-75.01 so it is approved well before 04.

---

## The tracer bullet: which assumption it kills

**Riskiest assumption:** a payment-originated exception, one with no email, no `message_id` and `invoice_id = null`, can flow through the existing v1 machinery (seed → loader recompute → review/exception table → queue/Overview counts → one-write-path command → audit) **without a second code path** (R1, R3, R11), and nullable `invoice_id` does not silently drop cash from any total (R2).

If the tracer cannot do this without forking the queue, loader or command path, stop and reopen Stage 2 §2.1/§2.2 with the user. Do not patch around it in later tickets.

**Go/no-go (TKT-75.02 acceptance):** seeded unapplied payment appears as `kind = unallocated_payment` on `/exceptions` and in the Overview count; Analyst allocates it to the candidate invoice on `/exceptions/[id]`; invoice balance/status update; exactly one audit event; exception leaves the open list; injected failure mid-transaction leaves no partial state; all v1 e2e specs pass unchanged.

---

## M-75.1 · Foundation and tracer bullet
- **Objective:** a green branch with the renamed, widened schema, then one complete unallocated-payment path through every layer.
- **Scope:** TKT-75.01, TKT-75.02.
- **Deliverables:** `task/75-exceptionos` branch; S38–S46 in `decisions.md`; A1 amendment draft; Dexie v2; `/exceptions`, `/exceptions/[id]` (unallocated payment only); allocate command; sidebar item + badge; Data-Model.md §2/§4/§6/§7 updates.
- **Dependencies:** G0.
- **Entry:** G0 met; `test:all` baseline on the base commit recorded in HANDOFF.
- **Exit:** tracer go/no-go passes; `test:all` no worse than baseline; v1 e2e unchanged.
- **DoD:** common DoD (tickets doc) + tracer verdict note linked from HANDOFF.
- **Sequence / priority / status:** 1st · High · Not started (blocked by G0).
- **Risks:** rename touches 38 files (mitigated by strict TS + updating `reviewItems` tests in the same commit); Dexie table rename needs a copy-upgrade (Dexie cannot rename tables), so Reset and upgrade-from-v1 are both tested.

## M-75.2 · Agent pipeline and money actions
- **Objective:** Recommend → Policy → Execute on the tracer path; Manager-only write-off and reversal; edge cases escalate correctly.
- **Scope:** TKT-75.03, 04, 05, 06, 08.
- **Deliverables:** `domain/recommend` (verified facts), `domain/policy.ts` (gated rule table, append-only versioned `PolicyDecision`), Execute agent; `CreditNote` + `approve_write_off`; `reverse_allocation`; detail-page agent blocks + Policy card + evidence groups + audit trail; three new eval gates; Architecture.md agent section; AI-Evaluation.md gates + dataset rows.
- **Dependencies:** M-75.1; A1 (for 04).
- **Entry:** tracer go.
- **Exit:** `pnpm eval` green incl. policy-conflict-executed = 0, allocation accuracy 100% unambiguous / 100% ambiguous escalated, short-payment detection 100%; exhaustive policy-gate tests; every new write path has a one-transaction + audit unit test.
- **DoD:** common DoD.
- **Sequence / priority / status:** 2nd · High · Not started.
- **Risks:** three-agent surface (S40) — mitigated by Execute writing only via `commands.ts`; A1 approval latency.

## M-75.3 · NSM and release
- **Objective:** the NSM and guardrails computed live on Home, then release evidence for every new surface and the §8.2 walk.
- **Scope:** TKT-75.07, TKT-75.09.
- **Deliverables:** NSM section + Exceptions task card on Home; guardrail counters; four screen states + offline on new routes; 375/768/1024/1280 evidence; WCAG 2.2 AA; full v1 e2e; §8.2 walk e2e; F17 docs (`docs/demo/interview-demo-script.md`, `docs/interview/product-case-study.md`).
- **Dependencies:** M-75.2.
- **Entry:** 05, 06, 08 Done.
- **Exit:** `test:all` green (incl. new gates), §8.2 walk passes uninterrupted, F17 docs match the running product.
- **DoD:** common DoD; closing note states verified / assumed / untested.
- **Sequence / priority / status:** 3rd · High · Not started.
- **Risks:** NSM small-sample honesty (label everywhere, R8); link-preview gate is N/A for in-app routes (no new public page; Design Appendix A deferred).
