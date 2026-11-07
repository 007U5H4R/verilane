# TASK-75 — Tickets (Verilane v2 · ExceptionOS scope change)

> Stage 4 · Problem Breakdown · Campfire TASK-75 · 2026-11-05 · **APPROVED 2026-11-05**
> Milestones, DAG, gates G0/A1 and Stage 4 decisions D75-1…D75-4: [`milestones-TASK-75.md`](milestones-TASK-75.md). Requirements: Solution-PRD-TASK-75 §4 (R1–R11), §6 (DoD 1–7), §7 (matrix), §8 (NFRs), §9 (risks); Discovery-PRD-TASK-75 F12–F18, FS14–FS22, §8.1–§8.3; Design-TASK-75 §2–§22.
> IDs are provisional (`TKT-75.xx`, `TC-75.xx`). Campfire mapping is in the last section; `TC-###` numbers are allocated in Stage 5.

## Summary

| Ticket | Title | Type | Priority | P | Milestone | Blocked by | sp |
|---|---|---|---|---|---|---|---|
| TKT-75.01 | Cut the branch; append S38–S46; rename ReviewItem→Exception; widen Payment.invoice_id; Dexie v2; draft A1 | chore | High | P1 | M-75.1 | G0 | 5 |
| **TKT-75.02** | **Tracer: unallocated payment end-to-end (seed → detect → /exceptions → detail → allocate)** | feature | High | P1 | M-75.1 | 01 | 8 |
| TKT-75.03 | Recommend + Policy agents with an append-only PolicyDecision on the detail page | feature | High | P1 | M-75.2 | 02 | 5 |
| TKT-75.04 | Execute agent: auto-execute `auto_permitted`, gate the action bar | feature | High | P1 | M-75.2 | 03, A1 | 3 |
| TKT-75.05 | Short-payment pattern exception and Manager-only credit-note write-off | feature | High | P1 | M-75.2 | 04 | 5 |
| TKT-75.06 | Manager-only reversal of an applied allocation (F16) | feature | High | P1 | M-75.2 | 02 | 3 |
| TKT-75.07 | NSM and guardrails computed live on Home, with the Exceptions task card | feature | High | P1 | M-75.3 | 05, 06 | 3 |
| TKT-75.08 | Edge-case fixtures (FS14–FS18) and the allocation-accuracy gate | feature | Medium | P2 | M-75.2 | 03 | 3 |
| TKT-75.09 | Release evidence: screen states, breakpoints, a11y, v1 regression, §8.2 walk, F17 docs | task | High | P1 | M-75.3 | 07, 08 | 3 |

Total: 9 tickets · 38 sp. Critical path 01 → 02 → 03 → 04 → 05 → 07 → 09 ≈ 32 sp.

08 is P2 because its edge cases also land partly in 03 (ambiguous → `needs_manager`). It is still required before release (it blocks 09). Everything else either enforces a requirement or a gate, or is on the §8.2 walk, so it is P1.

### Common DoD (every ticket)
- Work is on `task/75-exceptionos` in its own worktree, opened only after **G0** (TASK-45 and TASK-46 Done). The commit subject is imperative and carries the Campfire ID. No AI attribution.
- `pnpm typecheck && pnpm lint && pnpm test` pass, plus the ticket's own TCs. `test:all` is no worse than the TKT-75.01 baseline. All pre-existing v1 e2e specs pass unchanged (Solution-PRD §7 last row).
- `git diff <base>..HEAD --stat` shows only the files this ticket intends. No v1 route path, redirect or test ID changes (R10, DoD 5). Root `milestones.md` / `tickets.md` are not touched.
- Every financial write goes through `commands.ts` permission check → transition → audit in one Dexie `rw` transaction (R11, S14), with a unit test that asserts one transaction + one audit event and no partial state on an injected failure.
- No new runtime dependency (§8 NFR). Policy logic stays a pure function: two runs on the same input give byte-identical output.
- The ticket's doc section (Architecture / Data-Model / AI-Evaluation) is updated in the same ticket. Docs, evals and e2e are never deferred to a later ticket.
- No secrets in code, logs or fixtures. Scratch output, traces and screenshots go to `/Volumes/E Drive/Dev/.scratch/task75/`, with `TMPDIR` exported there.
- Frozen design values (Design §22) don't change, apart from the "implementation may adjust" list and the A1 amendment once approved.
- The closing note states what is verified, assumed and untested.

---

## M-75.1 · Foundation and tracer bullet

### TKT-75.01 · Cut the branch; append S38–S46; rename ReviewItem→Exception; widen Payment.invoice_id; Dexie v2; draft A1
- **Type:** chore · **Priority:** High (P1) · **Milestone:** M-75.1 · **Blocked by:** G0 · **sp:** 5
- **Objective:** make the change easy. Start the branch on a known baseline with the decisions recorded, the renamed entity, and a schema that already carries unapplied cash safely, all with no behaviour change (D75-2, D75-3).
- **Acceptance criteria:**
  - `task/75-exceptionos` is cut in its own worktree from green `main` after G0. Its `test:all` result (including any known-red gate) is recorded in HANDOFF as the baseline.
  - Commit 1: TASK-75 docs on the branch. Commit 2: S38–S46 appended to `decisions.md` verbatim from Solution-PRD Appendix A, renumbered if taken, with cross-references updated in the same commit.
  - Commit 3: the A1 amendment is drafted as `Design-TASK-75.md` §25 "Amendment A1 (pending approval)" plus a matching Discovery note. Its content is listed in `milestones-TASK-75.md` → Gate A1. Status: pending user approval.
  - `ReviewItem` → `Exception` (type, schema, store, table, helpers), done with the compiler's help. `ExceptionKind` gains `unallocated_payment` and `short_payment_pattern` (R1). `message_id` becomes optional for payment-originated kinds. Data-issue kinds still require it, enforced by a Zod refinement with a unit test.
  - `Payment.invoice_id` becomes nullable in Zod and Dexie (R2). Every payment aggregation (outstanding balance, payment history, matches, priority inputs, Overview KPIs) handles `null` explicitly. **Regression test:** a fixture containing an unapplied payment yields totals that count it in "unapplied cash", never silently drop it, and nothing crashes.
  - Dexie `version(2)` adds `exceptions` (copied from `reviewItems` in `upgrade()`, then `reviewItems: null`), plus empty `creditNotes` and `policyDecisions` tables. Tests: upgrade from a v1 DB preserves rows; Reset reseeds cleanly.
  - `data-testid` values and user-visible copy are unchanged. The v1 e2e suite passes unchanged.
  - Data-Model.md: rename (§4), nullable `invoice_id` (§2), new table names (§6).
- **DoD:** common DoD. Zero behaviour change apart from the null-safety fix the regression test pins.
- **Notes:** if the rename can't stay green in one ticket (unexpected dynamic table-name access), switch to expand–contract (alias, then migrate, then remove) and record an `EXE#` decision. The A1 draft only goes in here; approval is a separate user gate.
- **TC:** TC-75.01 (decisions diff doc-only), TC-75.02 (Exception schema + refinement unit), TC-75.03 (null `invoice_id` aggregation regression), TC-75.04 (Dexie v1→v2 upgrade + Reset), TC-75.05 (v1 e2e unchanged).

### TKT-75.02 · Tracer: unallocated payment end-to-end
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.1 · **Blocked by:** 01 · **sp:** 8
- **Objective:** kill the riskiest assumption: a payment-originated exception flows through the existing machinery with no second code path (R1, R3, R11). This is F12 and F13 for the simplest case, an unambiguous single-candidate payment.
- **Acceptance criteria (the go/no-go):**
  - `scripts/seed.ts` is extended in place (S43) with at least one unapplied bank line and remittance whose amount matches exactly one open invoice. The seed coverage test fails if that scenario is missing (R9, first scenario).
  - Loader recompute detects unapplied payments → one `Exception{kind: unallocated_payment}` per payment, deterministic and idempotent across recomputes.
  - `/exceptions` (new route, R10) uses the row-card list (Design §5: Kind / Subject / Amount / Status / Priority / Action, 64 px cards, Queue filters reused). It lists all seven kinds, including the five pre-existing ones.
  - Sidebar "Exceptions" item at position 7, between Drafts and Audit log, with an open-count badge (Design §7). The Overview count includes the new kind.
  - `/exceptions/[id]`: Payment evidence group (bank line, remittance), Invoice facts for each candidate, a reverse-chronological audit trail, and an action bar. **Tracer action:** Analyst picks the candidate and submits. An `allocate_payment` command in `commands.ts` checks `can()` (new action in `permissions.ts`), sets `invoice_id`, updates the invoice balance and status, transitions the exception to `actioned` and writes one audit event, all in one `rw` transaction (R3).
  - Failure injection between steps leaves no partial state (§7 row 3).
  - An invoice with related unapplied cash is excluded from reminders until allocation (F13; guardrail "inappropriate-reminder rate = 0").
  - The four screen states plus offline on both new routes (Design §13). Mobile ≥ 375 px with no horizontal scroll.
  - e2e: seed → `/exceptions` → open → allocate → gone from the open list → audit entry visible. The v1 e2e suite is unchanged.
  - Data-Model.md §7 seed coverage list extended.
- **DoD:** common DoD. A verdict note (go / no-go) is linked from HANDOFF.
- **Notes:** no-go means stop and reopen Solution-PRD §2.1/§2.2 with the user. Agent blocks, the Policy card and auto-execute are out of scope (03/04). The detail page renders only the evidence and manual-action parts of Design §4.
- **TC:** TC-75.06 (seed coverage: unallocated), TC-75.07 (detection deterministic/idempotent), TC-75.08 (allocate: one tx + audit + permission), TC-75.09 (failure injection, no partial state), TC-75.10 (reminder exclusion), TC-75.11 (`/exceptions` lists 7 kinds + badge + Overview count), TC-75.12 (screen states), TC-75.13 (tracer e2e).

---

## M-75.2 · Agent pipeline and money actions

### TKT-75.03 · Recommend + Policy agents with an append-only PolicyDecision on the detail page
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.2 · **Blocked by:** 02 · **sp:** 5
- **Objective:** the AI recommends from verified facts only, and a deterministic gated rule table decides what is allowed (F15, R5–R7, S40/S41).
- **Acceptance criteria:**
  - Recommend agent: output is a set of verified facts, each traced to a source record, following `draft.ts` `factsFor()` (R5). An unverifiable claim never reaches Policy (unit). For the tracer case it recommends the single candidate; with none, it says "cannot recommend" and gives the reason (F13).
  - Policy agent (`domain/policy.ts`): a pure gated rule table over `(Exception, recommendation, config_version, permission matrix)`. Verdicts are `auto_permitted | needs_analyst | needs_manager | blocked`. ≤ ₹5,00,000 and unambiguous → `auto_permitted`; > ₹5,00,000 or ambiguous → `needs_manager` (§7). An out-of-enum or malformed verdict is rejected via `Result<T,E>` and never persisted.
  - `PolicyDecision` rows are append-only and versioned (`config_version`), with no update or delete API (R7). Re-evaluation appends a new row. Rows can be queried by `exception_id` from the audit cross-references (§8 auditability).
  - Exhaustive unit tests for every gate and verdict boundary (₹5,00,000 exactly, 1 paisa either side; each role; each kind), to the `permissions.ts` test bar (DoD 4). Determinism: two runs on the same input give byte-identical output.
  - Model vs. policy conflict: policy wins, and the conflict is shown and logged (FS22).
  - Detail page: Stage 1 (Recommend) and Stage 2 (Policy) blocks, and a Policy Decision sidebar card `POL-{id}` that is always shown (Design §4, §9). Agent stages appear in the audit trail (Design §10).
  - Architecture.md: Recommend/Policy/Execute extension of the pipeline diagram, `domain/policy.ts` in the module layout, and the "never pass through a provider" rule shown as satisfied (§5).
- **DoD:** common DoD.
- **TC:** TC-75.14 (verified facts / unverified blocked), TC-75.15 (gate table exhaustive + boundaries), TC-75.16 (Result rejection, nothing persisted), TC-75.17 (append-only + versioned), TC-75.18 (determinism), TC-75.19 (FS22 conflict logged), TC-75.20 (detail agent blocks + POL card render).

### TKT-75.04 · Execute agent: auto-execute `auto_permitted`, gate the action bar
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.2 · **Blocked by:** 03, **A1 approved** · **sp:** 3
- **Objective:** true auto-execute per D75-1. Execute reads only the persisted verdict and writes only through `commands.ts` (R6, R11).
- **Acceptance criteria:**
  - Execute reads `verdict` from the latest persisted `PolicyDecision` row and never computes it (R6; a unit test injects a contradicting in-memory value, which is ignored).
  - `auto_permitted` → calls `allocate_payment` via `commands.ts`. The audit actor is the **Execute agent** and the audit entry references the `PolicyDecision` id and `config_version` (§7).
  - `needs_analyst` / `needs_manager` / `blocked` → **no write command is called**. The item is handed to the matching queue with the reason (§7).
  - Action bar matrix per approved A1: `auto_permitted` resolved → disabled "Already resolved"; `needs_analyst` → Analyst "Submit for approval"; `needs_manager` → disabled for Analyst "Manager approval required", enabled for Manager; `blocked` → disabled with the reason. An Analyst attempting a Manager-only action has it refused, and the attempt is audited (FS21).
  - Eval gate **policy-conflict-executed = 0**: no `blocked` or `needs_*` decision is ever executed, and no write happens without a human approver or an `auto_permitted` decision. Added to `pnpm eval` and to AI-Evaluation.md §3.
  - Detail Stage 3 block copy per A1.
- **DoD:** common DoD. A1 approval date recorded in the ticket notes before work starts.
- **TC:** TC-75.21 (reads persisted verdict only), TC-75.22 (auto-execute actor = Execute agent + POL ref), TC-75.23 (non-permitted → no write), TC-75.24 (action-bar matrix + FS21 audited refusal), TC-75.25 (eval: policy-conflict-executed = 0).

### TKT-75.05 · Short-payment pattern exception and Manager-only credit-note write-off
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.2 · **Blocked by:** 04 · **sp:** 5
- **Objective:** F14 / FS18 / FS19 and the R4 Manager-only `CreditNote` path, through the same agent pipeline.
- **Acceptance criteria:**
  - Seed: one customer with ≥ 3 short payments within 90 days, one of them with no reason given. Seed coverage test enforces it (R9, second scenario).
  - Detection: every short payment is visible as an exception instance. A customer with ≥ 3 in 90 days produces **exactly one** `short_payment_pattern` exception, linked to all its instances (§7 row 2, FS19). Two in 90 days, or three spread over more than 90 days, produce none (boundary unit). A missing reason is shown as "needs review" with no assumed deduction type (FS18).
  - Detail: history, total deducted value and stated reasons. A CreditNote evidence group appears only once a note exists (Design §8).
  - `approve_write_off` action in `permissions.ts`: Analyst blocked by `can()`, and the attempt is audited; Manager succeeds → `CreditNote` row + audit + exception `actioned`, all in one transaction (R4, §7 row 4). Policy verdict for write-offs is never `auto_permitted` (Manager-only money action), so Execute never auto-writes a credit note (unit).
  - Eval gate **short-payment-pattern detection recall = 100%** on seeded patterns, reported with TP/FP/TN/FN (Discovery §8.3). Added to AI-Evaluation.md §2 dataset table and §3.
  - Data-Model.md §3/§4: `CreditNote`.
- **DoD:** common DoD.
- **TC:** TC-75.26 (seed coverage: pattern), TC-75.27 (exactly-one pattern + 90-day boundaries), TC-75.28 (FS18 no-reason), TC-75.29 (write-off: Analyst blocked + audited / Manager succeeds, one tx), TC-75.30 (write-off never auto-executed), TC-75.31 (eval: detection recall).

### TKT-75.06 · Manager-only reversal of an applied allocation (F16)
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.2 · **Blocked by:** 02 · **sp:** 3
- **Objective:** a permitted human can undo an allocation, and the undo is visible to the NSM (F16, FS20, S45).
- **Acceptance criteria:**
  - `reverse_allocation` action: Manager only (`can()`). An Analyst attempt is refused and audited (FS21).
  - The command, in one transaction: `invoice_id` → null, invoice balance and status restored, exception reopened (new transition `actioned → open` with reason `reversed` added to the exception machine; illegal transitions still throw), audit event with the original allocation's reference.
  - The reopened exception carries a `reversed` marker that the NSM (07) reads as "not correctly resolved".
  - Detail page: Manager-only "Reverse allocation" control on resolved allocations, per A1 item 3. Hidden for Analyst, with no dead control.
  - Data-Model.md: the reversal transition and marker.
- **DoD:** common DoD.
- **Notes:** if A1 is still pending when 06 is ready, ship the command and its tests, and put the control behind A1 approval. Don't change the frozen design without approval.
- **TC:** TC-75.32 (reverse: one tx, balance restored, audit), TC-75.33 (Analyst refused + audited), TC-75.34 (transition table incl. reopen), TC-75.35 (Manager-only control e2e).

### TKT-75.08 · Edge-case fixtures (FS14–FS18) and the allocation-accuracy gate
- **Type:** feature · **Priority:** Medium (P2) · **Milestone:** M-75.2 · **Blocked by:** 03 · **sp:** 3
- **Objective:** the recommender never guesses: ambiguous, overpaid, unknown-reference and untraceable cash escalate correctly, and that is measured.
- **Acceptance criteria:**
  - Seed: FS14 (fits two invoices equally), FS15 (exceeds the customer's open balance), FS16 (unknown or mistyped invoice reference), FS17 (untraceable to any customer). The seed coverage test enforces the ambiguous/overpayment scenario (R9, third scenario).
  - FS14 → no pick, `needs_manager`, all candidates shown. FS15 → matched portion proposed, excess held as unapplied, needs review. FS16 → no fuzzy match, escalated, cited reference shown verbatim. FS17 → stays unallocated with the reason, no invoice touched.
  - Eval gate **allocation-recommendation accuracy**: correct on unambiguous = 100%, ambiguous escalated (never auto-picked) = 100%, with TP/FP/TN/FN (Discovery §8.3). Added to AI-Evaluation.md §2/§3.
- **DoD:** common DoD.
- **TC:** TC-75.36 (FS14), TC-75.37 (FS15), TC-75.38 (FS16), TC-75.39 (FS17), TC-75.40 (eval: allocation accuracy).

---

## M-75.3 · NSM and release

### TKT-75.07 · NSM and guardrails computed live on Home, with the Exceptions task card
- **Type:** feature · **Priority:** High (P1) · **Milestone:** M-75.3 · **Blocked by:** 05, 06 · **sp:** 3
- **Objective:** the North Star Metric is computed live from the actions taken in the session and labelled honestly (Discovery §8.1, S42, R8).
- **Acceptance criteria:**
  - NSM = Σ value of exceptions closed by an approved action (human or `auto_permitted` per A1) and **not** later reopened or reversed, within the current `AS_OF_DATE` session. It is a pure function with units: an allocation counts; a reversal removes it; a reopen removes it; no seeded outcome numbers.
  - Guardrails are computed from the same session: reversal/reopen rate, inappropriate-reminder rate (target 0), actions executed without approval (target 0), median raised→resolved time, escalation rate.
  - Home: NSM section above the task feed per Design §6 (brand-tint container, serif value) with the literal label **"Simulated — one demo session = one analyst-week"** wherever the figure appears (Home, `/exceptions`, eval report; R8 unit + e2e). Heading reads "North Star Metric" (A1 item 4).
  - Home task cards: Exceptions card added (Design §6). Four screen states for the NSM section.
  - e2e: allocate → NSM rises by that value; reverse → it falls back.
- **DoD:** common DoD.
- **TC:** TC-75.41 (NSM pure fn incl. reversal/reopen exclusion), TC-75.42 (guardrails), TC-75.43 (label present everywhere), TC-75.44 (Home section + task card + states), TC-75.45 (allocate/reverse NSM e2e).

### TKT-75.09 · Release evidence: screen states, breakpoints, a11y, v1 regression, §8.2 walk, F17 docs
- **Type:** task · **Priority:** High (P1) · **Milestone:** M-75.3 · **Blocked by:** 07, 08 · **sp:** 3
- **Objective:** prove the whole change at the level the user experiences it (Discovery §8.2, §8.4).
- **Acceptance criteria:**
  - §8.2 walk as one uninterrupted e2e: Overview → unallocated payment → evidence → recommendation → policy → execute/approve → simulated apply → NSM updates → short-payment pattern flagged → existing dispute shows reminders blocked → every step in Audit Log. No dead controls.
  - New and changed surfaces (Home NSM, `/exceptions`, `/exceptions/[id]`, sidebar): four states + offline verified on the real build; 1280/1024/768/375 screenshots with no horizontal scroll; WCAG 2.2 AA (axe clean, keyboard path, focus order, contrast) per Design §14–§15.
  - The full v1 e2e suite passes unchanged; `git diff` on `src/app/` outside the two new routes and Home is empty of route, redirect or test-ID changes (DoD 5).
  - `pnpm eval`: three new gates plus the six existing ones green (DoD 1). `test:all` green.
  - F17: `docs/demo/interview-demo-script.md` (the §8.2 walk with talking points) and `docs/interview/product-case-study.md`. Neither invents interviews, adoption, customers or deployments, and both are checked against the running product.
- **DoD:** common DoD. Evidence pack in `/Volumes/E Drive/Dev/.scratch/task75/release/`, linked from HANDOFF.
- **Notes:** no new public page, so the link-preview gate is N/A (Design Appendix A, OG deferred).
- **TC:** TC-75.46 (§8.2 walk e2e), TC-75.47 (states + offline), TC-75.48 (breakpoints), TC-75.49 (a11y), TC-75.50 (v1 regression + route diff), TC-75.51 (eval all gates), TC-75.52 (F17 docs match product).

---

## Requirement → ticket trace

| Requirement | Ticket(s) |
|---|---|
| R1 two new kinds, no second path | 01, 02 |
| R2 nullable `invoice_id`, explicit null handling | 01 |
| R3 allocate command, one tx | 02 |
| R4 CreditNote Manager-only | 05 |
| R5 verified facts | 03 |
| R6 Execute reads persisted verdict | 04 |
| R7 PolicyDecision append-only, versioned | 03 |
| R8 NSM label | 07, 09 |
| R9 seed coverage scenarios | 02 (unallocated), 05 (pattern), 08 (ambiguous/overpayment) |
| R10 new routes only | 02, 09 |
| R11 every write via `commands.ts` | 02, 04, 05, 06 |
| F12 / F13 | 02, 03, 08 |
| F14 | 05 |
| F15 | 03, 04 |
| F16 / FS20 | 06, 07 |
| F17 | 09 |
| F18 / DoD 5 | every ticket (common DoD), 09 |
| FS14–FS17 | 08 |
| FS18 / FS19 | 05 |
| FS21 | 04, 05, 06 |
| FS22 | 03 |
| §8.1 NSM + guardrails | 07 |
| §8.2 walk | 09 |
| §8.3 targets | 04, 05, 08, 09 |

## Campfire mapping

Created 2026-11-05. Stage 4 ticket **TASK-78** (Done). Parent **TASK-79** "Build the ExceptionOS v2 scope change" (feature, High, P1). Subtasks carry the same blocking edges as native Campfire dependencies, plus a milestone label (`M-75.x`).

| Provisional | Campfire | Depends on (Campfire) |
|---|---|---|
| TKT-75.01 | TASK-79.1 | (G0: TASK-45, TASK-46 Done) |
| TKT-75.02 | TASK-79.2 | 79.1 |
| TKT-75.03 | TASK-79.3 | 79.2 |
| TKT-75.04 | TASK-79.4 | 79.3 (+ A1 approval) |
| TKT-75.05 | TASK-79.5 | 79.4 |
| TKT-75.06 | TASK-79.6 | 79.2 |
| TKT-75.07 | TASK-79.7 | 79.5, 79.6 |
| TKT-75.08 | TASK-79.8 | 79.3 |
| TKT-75.09 | TASK-79.9 | 79.7, 79.8 |

G0 and A1 are gates rather than tickets, so they appear in each ticket's description and here, not as Campfire edges.
