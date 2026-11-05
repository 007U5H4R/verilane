# TASK-75 — Verilane v2 (ExceptionOS scope change) — Solution PRD

> **Stage:** 2 · Solution Design (Full tier) · **Ticket:** TASK-75 · **Date:** 2026-11-05
> **Status:** APPROVED (2026-11-05) — document-level gate signed off by user, in addition to the 9 individual decisions below.
> **Input:** `docs/Discovery-PRD-TASK-75.md` (approved; Q1–Q16 settled). Nine Socratic design questions asked one at a time per `bw-solution-design`/`superpowers:brainstorming`; all nine are locked by explicit user approval (§2, Appendix A).
> **Location:** this file is ticket-scoped, like TASK-45's. The root `Solution-PRD.md` is the whole-product TASK-1 artifact for v1 and is not touched. v1's `Architecture.md`, `Data-Model.md` and `AI-Evaluation.md` *are* touched (§5), because TASK-75 extends the live system rather than forking it.
> **This file covers:** the *how* — entity model, agent architecture, policy engine, NSM computation, seed data, routing, and sequencing against TASK-45/46. It does not cover UI composition, exact screen layouts or copy (Stage 3, `t-design`).

---

## 0. Three findings that shaped the brief and the locked decisions (read first)

1. **v2 is a scope change to the live system, not a new build.** `ReviewItem`, `permissions.ts`, `transitions.ts` and the one-write-path invariant (`src/domain/commands.ts`, S14) already exist and pass their tests today. Discovery §12 deliberately left entity model, agent count, policy design, NSM method and allocation algorithm undecided — this PRD is where those seven decisions plus two confirmations get made, against the concrete code in `src/domain/schema.ts`, `src/store/db.ts`, `src/ai/provider.ts` and `src/domain/draft.ts`, not against a blank slate.
2. **Decision-log numbering must continue past TASK-45's reserved-but-unappended slots.** `decisions.md` currently ends at S14 (`grep -n "^## S[0-9]" decisions.md`). TASK-45's own Solution-PRD drafted S15–S24 in its Appendix A but defers appending them until `task/45-splash` lands (its Appendix A note, `docs/Solution-PRD-TASK-45.md:390`). To avoid a numbering collision whenever that lands, this PRD's new decisions are numbered **S25 onward** (Appendix A below), appended to `decisions.md` only once TASK-75's own work lands on its branch — same deferred-append pattern.
3. **TASK-45/46 must finish before any v2 code, and the user chose "finish" over "park."** Discovery §7 flagged this as a sequencing risk requiring a Stage 2 decision. The remaining TASK-45/46 work (45.9 art encode → 45.10 release evidence → whole-branch review → release; 46.8 final heritage art) is small, isolated from v2's domain/schema surface, and already close to done per `HANDOFF.md`. The user confirmed: finish first (§2.8). **No v2 ticket from Stage 4 onward may start work until TASK-45 and TASK-46 are both Done.**

---

## 1. Chosen approach (one paragraph)

TASK-75 extends the live Verilane domain, not a parallel implementation. `ReviewItem` is widened in place into **`Exception`** by adding two new `kind` values (`unallocated_payment`, `short_payment_pattern`) to its existing enum — one queue, one state machine, one Overview count, consistent with S14. `Payment.invoice_id` becomes nullable so an unapplied payment is representable as a first-class row rather than a synthetic one, and a new **`CreditNote`** entity gives short-payment write-offs their own audited record, separate from cash movement. On top of that data model, v2 adds **three separate agents — Recommend, Policy and Execute — each with its own state and explicit hand-off record**, instead of extending the existing single-provider pipeline. The Policy agent runs a gated rule table (same shape as `priority.v1`'s G1–G7) against the Discovery §2 permission matrix and writes a versioned, auditable `PolicyDecision`; the Execute agent only acts on a `verdict` it reads from that record, never on the Recommend agent's output directly. This is the most expensive of the three architectures weighed (§2.3) and was the user's explicit, twice-confirmed choice over the recommended single-pipeline extension — accepted here with its cost named, not silently absorbed. The NSM is computed over one frozen `AS_OF_DATE` demo session, labelled "Simulated," mirroring the existing frozen-clock precedent (S11). Routing is additive only: all v1 routes stay exactly as they are; `/exceptions` and `/exceptions/[id]` are new top-level routes. Seed data is extended in place inside the existing `scripts/seed.ts` generator, not a second dataset.

## 2. Key design decisions (options weighed, one recommended each; user's choice marked)

### 2.1 Exception entity model → evolve `ReviewItem` into `Exception` (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **Evolve `ReviewItem`'s `kind` enum to add `unallocated_payment`, `short_payment_pattern`** | small schema diff; existing queue/state-machine/Overview-count code is reused unchanged | **Chosen** |
| A new parallel `Exception` entity/queue alongside `ReviewItem` | two queues, two counts, two state machines to keep in sync; violates S14's "one write path" | Rejected |
| Fork `ReviewItem` into subtypes with a discriminated union of distinct shapes | more type ceremony for no behavioural gain at this scope | Rejected |

- `Exception` is `ReviewItem` with its `kind` enum extended to `draft · uncertain_match · dispute · missing_info · reconciliation · unallocated_payment · short_payment_pattern`. All existing fields (`item_id`, subject ref, `recommendation`, `evidence_ids[]`, `validation_status`, `escalation_reason`, `requires_role`, `status`) carry over unchanged.
- `docs/Data-Model.md` §4's `ReviewItem` section is renamed to `Exception` (its two new `kind` values documented); `src/store/db.ts`'s `reviewItems` Dexie table and TS type are renamed to `exceptions` at the same time, so the code and the doc do not drift.

### 2.2 Payment / credit-note model → nullable `Payment.invoice_id` + new `CreditNote` entity (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **`Payment.invoice_id` nullable; new `CreditNote` entity for write-offs** | one schema widen, one new small table; keeps cash movement and write-off decisions as separate audited facts | **Chosen** |
| Keep `invoice_id` required; model an unapplied payment as a payment against a synthetic/placeholder invoice | fabricates a fact (a payment "against" an invoice that was never billed); pollutes invoice-level reporting | Rejected |
| Model write-offs as a `Dispute` subtype instead of a new entity | conflates "customer disputes a charge" with "we accepted a short payment", different actors and different audit shape | Rejected |

- `Payment.invoice_id: FK | null`. An unapplied payment is a `Payment` row with `invoice_id = null`; allocation to an invoice happens later via a new command (§4, R3) that sets it inside the one-write-path transaction (S14).
- `CreditNote`: `credit_note_id, invoice_id (FK), amount_paise, reason, approved_by, created_at`. It records the acceptance of a short payment as its own fact, distinct from the `Payment` row that caused it.
- `docs/Data-Model.md` §2 (Payment table) and §3/§4 (new CreditNote entity) are updated; §5's invariants table gets a new row (no `CreditNote` without a Manager `approved_by`, per the permission matrix).

### 2.3 Agent architecture → true multi-agent orchestration: separate Recommend / Policy / Execute agents (user's explicit choice, overriding the recommendation)
| Option | Cost | Verdict |
|---|---|---|
| One pipeline, provider-seam extension (extend `ai/provider.ts`'s existing `extract()` shape with a new recommend/policy step) | smallest diff; one state machine; consistent with v1's existing architecture | **My recommendation** — not chosen |
| Two agents: Recommend+Policy combined, Execute separate | a middle cost; still one fewer hand-off/state surface than three | Not chosen |
| **Three separate agents — Recommend, Policy, Execute — each with its own state and hand-off record** | most new surface: three state shapes, two hand-off record types (`recommendation_ref`, `PolicyDecision`), the most new code and the most new eval surface | **Chosen (user's explicit, twice-confirmed decision)** |

- **Cost named, per "Honesty over agreement":** this is the biggest of the three options. It triples the number of distinct agent states to test and reason about versus the single-pipeline option, and the Policy agent's gated rule table is new surface with its own exhaustive-unit-test obligation (mirroring `permissions.ts`'s existing bar). The user was shown this tradeoff explicitly in a follow-up question during Stage 2 and reaffirmed the choice (Appendix A, S27).
- **Shape:** `Recommend` agent reads an `Exception` and produces a `recommendation_ref` (the existing verified-facts pattern from `src/domain/draft.ts`, reused rather than reinvented — each recommended action traces to a ledger cell). `Policy` agent reads the recommendation and the exception, runs the gated rule table (§2.4) against the permission matrix, and writes a `PolicyDecision`. `Execute` agent reads only the `PolicyDecision`'s `verdict` — never the Recommend agent's raw output directly — and, if `auto_permitted`, calls the existing `commands.ts` write path; otherwise it hands the `Exception` to the Analyst/Manager queue per `requires_role`.
- This keeps the trust boundary where S14 already draws it: financial writes still happen only through `commands.ts`'s one transaction (permission check → allowed transition → audit event), regardless of how many agents produced the recommendation that led there.

### 2.4 Policy engine → gated rule table + explicit hand-off record (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **Gated rule table (G1–G7 shape) writing a versioned `PolicyDecision`** | mirrors `priority.v1`; unit-testable exhaustively like `permissions.ts` | **Chosen** |
| A scoring/weighted model (like `priority.v1`'s score, not its gates) | harder to audit "why was this auto-permitted" to a Senior PM interviewer; less legible | Rejected |
| Inline policy checks inside the Execute agent, no separate record | no audit trail of the decision independent of the action; breaks "one fact in one place" | Rejected |

- `PolicyDecision`: `{decision_id, exception_id, recommendation_ref, verdict: auto_permitted | needs_analyst | needs_manager | blocked, reason, config_version}`.
- Gates run in order against Discovery §2's thresholds (≤₹5,00,000 exact/unambiguous → Analyst; everything else → Manager), the same ordered-gate style as `src/domain/priority.ts`'s G1–G7. `src/ai/provider.ts`'s existing `Result<T,E>`/`Rejected` pattern is reused for the Policy agent's own output type, so a malformed or out-of-enum verdict is rejected the same way a malformed `Extraction` is today.
- Unit-tested exhaustively (every gate, every verdict, every boundary amount), the same bar `permissions.ts` is held to today (S14's table).

### 2.5 NSM computation → frozen demo week = one `AS_OF_DATE` session (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **One simulated analyst-week = one `AS_OF_DATE` demo session; NSM = Σ(correctly resolved exception value this session) ÷ 1** | reuses the existing frozen-clock pattern exactly (S11); no new clock/session concept | **Chosen** |
| A rolling or multi-session average | needs session persistence/aggregation this zero-cost, per-visitor IndexedDB demo doesn't have | Rejected |
| No normalization — report a raw total only | loses the "per analyst-week" framing Discovery §8.1 asks for | Rejected |
| Hard-wire a fixed historical denominator | fabricates a number with no traceable source | Rejected |

- NSM is labelled **"Simulated — one demo session = one analyst-week"** everywhere it's shown, so it reads honestly rather than as a real-world throughput claim. This is the same honesty move S18/S21 made for the splash cinematic's status text.

### 2.6 Seed data extension → extend `scripts/seed.ts` in place (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **Extend the existing fixed-PRNG generator; bump the committed CSV/JSON and its coverage test in the same script** | one generator, one coverage test, no new infra | **Chosen** |
| A second generator/dataset dedicated to v2 fixtures | two scripts to keep in sync; two coverage tests; drifts from "shipped data never depends on re-running the script" (`docs/Data-Model.md:109`) | Rejected |

- New fixtures added: unallocated payments (`invoice_id = null`), ≥1 customer with ≥3 short payments within 90 days, 1–2 ambiguous/overpayment cases for FS14–FS22. `docs/Data-Model.md` §7's coverage requirement is extended with these scenarios, same "coverage test asserts every required scenario is present" mechanism.

### 2.7 Route / nav continuity → keep v1 routes as-is; add new top-level routes (chosen)
| Option | Cost | Verdict |
|---|---|---|
| **All v1 routes unchanged (including `/` as the amended Overview per F1); new `/exceptions`, `/exceptions/[id]`** | zero redirect logic; zero risk to TASK-45's splash/nav work landing on the same routes | **Chosen** |
| Rename/merge `/queue` into `/exceptions` | breaks existing bookmarks/tests/TASK-45's splash trigger logic for no stated benefit | Rejected |

### 2.8 TASK-45/46 sequencing → finish, not park (chosen)
Per §0.3. **Gate:** no Stage 4+ ticket for TASK-75 starts work until both TASK-45 and TASK-46 show Done in Campfire.

### 2.9 F16 reversal permission → confirmed Manager-only
Matches the existing >₹5,00,000/ambiguous/write-off permission tier (Discovery §2); keeps the reversal/reopen-rate guardrail meaningful. No design change from Discovery — recorded here as a locked confirmation (Appendix A, S32).

## 3. Scope (smallest useful increment)

**In:**
- `Exception` (evolved `ReviewItem`), nullable `Payment.invoice_id`, `CreditNote`, `PolicyDecision` — schema + Dexie migration.
- Recommend / Policy / Execute agents, each with their own state, and the `recommendation_ref` / `PolicyDecision` hand-off records.
- The gated-rule-table policy engine, unit-tested exhaustively against the permission matrix.
- The allocation command for unapplied payments, run inside the existing one-write-path transaction.
- Seed data extension (§2.6) and its coverage-test update.
- `/exceptions`, `/exceptions/[id]` routes.
- NSM computation and its "Simulated" labelling.
- Updates to `docs/Architecture.md`, `docs/Data-Model.md`, `docs/AI-Evaluation.md` (§5).
- New eval gates for: policy-conflict-executed = 0, allocation-recommendation accuracy, short-payment-pattern detection (targets per Discovery §8.3).

**Out (explicit, per Discovery §6):**
- Duplicate-payment detection, PO mismatch, missing remittance as a standalone exception type.
- Anything from `VerilaneV2.md`'s broader document set beyond this scope change.
- An "Agent Operations Center" view — not required by Discovery.
- Any v1 route rename, redirect, or removal.
- A second seed-data generator or dataset.
- Any v2 code landing before TASK-45/46 are Done.

## 4. Requirements added by the solution
- **R1:** `Exception.kind` accepts `unallocated_payment` and `short_payment_pattern` alongside the existing five values; all existing `ReviewItem`/`Exception` consumers (queue, Overview count, state machine) handle the two new kinds without a second code path.
- **R2:** `Payment.invoice_id` is nullable in the Zod schema and the Dexie schema; every existing query/report that assumes it is non-null is updated to handle `null` explicitly (no silent `undefined`/crash).
- **R3:** a new command allocates an unapplied `Payment` to an `Invoice` (sets `invoice_id`), running inside one Dexie `rw` transaction with a permission check and an audit event, per S14's pattern — no new write path is invented.
- **R4:** `CreditNote` creation requires `can(role, "approve_write_off", subject)` to return true for `role = Manager`; it is rejected for Analyst.
- **R5:** the Recommend agent's output is a set of verified facts/claims, each traced to a source record (invoice/payment/customer/email), following `src/domain/draft.ts`'s `factsFor()` pattern — no unverified claim reaches the Policy or Execute agent.
- **R6:** the Policy agent's `PolicyDecision.verdict` is produced only by the gated rule table; the Execute agent must read `verdict` from a persisted `PolicyDecision` row, never compute or infer it itself.
- **R7:** `PolicyDecision` is append-only and versioned (`config_version`), consistent with `AuditEvent`'s append-only pattern (no update/delete API).
- **R8:** the NSM figure displayed anywhere in the UI or `AI-Evaluation.md`'s report carries the literal label "Simulated — one demo session = one analyst-week."
- **R9:** `scripts/seed.ts`'s coverage test fails the build if any of the new required scenarios (unallocated payment, ≥3 short payments/90 days for one customer, ambiguous/overpayment case) is missing from the generated output.
- **R10:** `/exceptions` and `/exceptions/[id]` are added without modifying any existing route's path, redirect behaviour, or test IDs.
- **R11:** every new financial-writing command (allocation, credit-note approval, policy-gated auto-execution) passes through `commands.ts`'s existing permission-check → transition → audit-event sequence; none bypasses it.

## 5. Docs requiring updates, and what changes

- **`docs/Architecture.md`:** add the Recommend/Policy/Execute agent architecture as an extension of the existing pipeline diagram (§4 note "financial maths, matching, priority, transitions, permissions and send restrictions never pass through a provider" — the Policy agent's verdict and the Execute agent's writes must be shown satisfying that same rule, not creating an exception to it). Add the `PolicyDecision` hand-off to the module layout (§6.2-equivalent) and name the new `domain/policy.ts` (or similar) file alongside `priority.ts`.
- **`docs/Data-Model.md`:** rename `ReviewItem` → `Exception` with its two new `kind` values (§4); widen `Payment.invoice_id` to nullable (§2); add `CreditNote` and `PolicyDecision` entities (§3/§4); add the new Dexie table names to §6; extend the §7 seed coverage list.
- **`docs/AI-Evaluation.md`:** add gates for policy-conflict-executed = 0 (a `PolicyDecision` of `blocked`/`needs_*` must never be auto-executed — mirrors the existing "approval enforcement 100%" gate shape), allocation-recommendation accuracy, and short-payment-pattern detection recall, per Discovery §8.3's AI acceptance targets. Extend §2's dataset table with the new seed fixtures' labels.

## 6. Success criteria / Definition of Done
1. `pnpm eval` passes with the three new gates (policy-conflict-executed = 0; allocation-recommendation accuracy and short-payment-pattern-detection recall meet Discovery §8.3's targets), in addition to all six existing gates (`docs/AI-Evaluation.md` §3) unchanged.
2. The seed coverage test asserts and passes on all new required scenarios (§4 R9).
3. Every new financial-writing path (allocation, credit-note, policy-gated auto-execution) is exercised by a unit test asserting it runs inside one transaction with an audit event (S14's invariant, mirrored for v2).
4. The Policy agent's gated rule table has exhaustive unit-test coverage of every gate and verdict boundary, matching `permissions.ts`'s existing test bar.
5. No v1 route, test ID, or redirect behaviour changes (`git diff` on `src/app/` routes outside the two new ones is empty).
6. TASK-45 and TASK-46 both show Done in Campfire before any TASK-75 Stage 4+ ticket's branch is opened.
7. The NSM figure is labelled "Simulated — one demo session = one analyst-week" everywhere it is shown.

## 7. Acceptance criteria / test matrix (feeds Stage 5 `test-cases.md`)
- An unallocated payment seeded with `invoice_id = null` appears in the `Exception` queue as `kind = unallocated_payment`, with the Overview count including it.
- A customer seeded with ≥3 short payments in 90 days produces exactly one `kind = short_payment_pattern` exception, not one per payment.
- Allocating an unapplied payment to an invoice: sets `invoice_id`, writes one audit event, and removes the exception from the open queue — all in one transaction; a crash mid-write leaves no partial state (verified by injecting a failure between steps).
- A credit-note write-off attempted by an Analyst role is blocked by `can()`; by a Manager role, it succeeds and creates an audited `CreditNote` row, and the originating exception is actioned.
- Policy agent: for an exception ≤₹5,00,000 and unambiguous, the `PolicyDecision.verdict` is `auto_permitted`; for the same exception >₹5,00,000 or ambiguous, it is `needs_manager`; a malformed/out-of-enum verdict from the engine is rejected (`Result<T,E>` pattern), never written as a `PolicyDecision`.
- Execute agent: given a `PolicyDecision` with `verdict = needs_analyst`, it hands off to the Analyst queue and does **not** call any write command; given `auto_permitted`, it calls the write command and the resulting audit event's actor is recorded as the Execute agent, not a human.
- `/exceptions` lists all `Exception` rows (including the pre-existing five `kind`s and the two new ones); `/exceptions/[id]` shows one exception's recommendation, policy verdict and audit trail.
- All pre-existing e2e specs for `/queue`, `/invoices/[id]`, `/disputes`, `/payments`, `/drafts`, `/audit`, `/settings`, `/` pass unchanged.

## 8. Non-functional requirements (measurable)
- **Determinism:** the Policy agent's gated rule table is a pure function of `(Exception, recommendation, config_version, permission matrix)` — two runs on the same inputs produce byte-identical `PolicyDecision`s, matching `pnpm eval`'s existing determinism requirement.
- **Auditability:** every `PolicyDecision` and every `CreditNote` is queryable by `exception_id`/`invoice_id` from the existing `audit` table's cross-references, with no new reporting surface required to answer "why was this auto-permitted."
- **No new dependencies:** the Recommend/Policy/Execute split is implemented as new pure-TS modules under `src/domain/` and/or `src/ai/`, following the existing stack decision (S8) — no new runtime library.
- **Storage:** new Dexie tables (`creditNotes`, `policyDecisions`) and the renamed `exceptions` table are added as a Dexie schema version bump, not a breaking change to existing tables; existing demo data survives a Reset.

## 9. Known tradeoffs and risks (honest)
- **Three-agent cost (S27/§2.3).** This is more code, more state, and more eval surface than the recommended single-pipeline option, for a demo-scale system. The user accepted this explicitly, twice, for the architectural story it tells a Senior PM interviewer (Discovery §1's success audience). Mitigation: the Execute agent still only ever writes through the existing, already-hardened `commands.ts` path — the multi-agent split adds reasoning/audit surface, not a new trust boundary.
- **Renaming `ReviewItem` → `Exception` touches every existing consumer of that table/type.** This is a rename, not a new concept, but it is a mechanical risk: every call site must be caught by the TS compiler and by the existing `reviewItems`-table tests, which must be updated in the same change rather than left half-migrated.
- **Nullable `Payment.invoice_id` is a widening change to a field every payment-aggregation query assumes is present.** Each such query (outstanding-balance calc, payment history views) must be audited for a `null`-handling gap; a missed one would silently drop unapplied payments from totals rather than crash, which is the dangerous failure mode to test for explicitly (R2).
- **Sequencing dependency on TASK-45/46.** If either slips past its current near-done state, TASK-75's own Stage 4 start slips with it; this PRD does not relitigate that call, only records it (§2.8).
- **NSM's "one session" framing is a small-sample figure**, same honesty caveat `docs/AI-Evaluation.md` §6 already carries for dispute recall — it is reported, not oversold.

## 9b. User sign-off checklist
- [x] **1. Entity model:** `ReviewItem` → `Exception` (two new kinds); `Payment.invoice_id` nullable; new `CreditNote` entity (§2.1, §2.2).
- [x] **2. Agent architecture:** true multi-agent orchestration — separate Recommend, Policy, Execute agents with their own state and hand-off records, accepted with its cost named (§2.3).
- [x] **3. Policy engine:** gated rule table writing a versioned `PolicyDecision` (§2.4).
- [x] **4. NSM:** frozen demo week = one `AS_OF_DATE` session, labelled "Simulated" (§2.5).
- [x] **5. Seed data:** extended in place in `scripts/seed.ts` (§2.6).
- [x] **6. Routes:** all v1 routes unchanged; `/exceptions`, `/exceptions/[id]` added (§2.7).
- [x] **7. Sequencing:** TASK-45/46 finish before any v2 code starts (§2.8).
- [x] **8. F16 reversal:** confirmed Manager-only (§2.9).
- [x] **9. Docs to update:** `Architecture.md`, `Data-Model.md`, `AI-Evaluation.md` as named in §5.
- [x] **decisions.md:** S25–S33 (Appendix A) appended once TASK-75's work lands on its branch.

---

## Appendix A — decision-log entries to append to root `decisions.md` (status: pending user sign-off above; not yet appended)
IDs continue the existing sequence. `decisions.md` currently ends at S14; TASK-45's Appendix A reserves S15–S24 but has not appended them yet (`docs/Solution-PRD-TASK-45.md:390`). TASK-75's entries are therefore numbered **S25 onward** to avoid a collision whenever TASK-45's land first. Append on TASK-75's own branch, not before.

## S25 · TASK-75: evolve ReviewItem into Exception — approved 2026-11-05
**Context.** Discovery introduces two new upstream problems (unapplied cash, short-payment pattern) needing a queue/state-machine home. `ReviewItem` already provides one queue, one state machine, one Overview count (S14's "one write path").
**Decision.** Extend `ReviewItem.kind` with `unallocated_payment` and `short_payment_pattern`; rename the entity/table to `Exception`/`exceptions`. No new queue, no new state machine.
**Rejected.** A parallel `Exception` entity/queue (two queues to keep in sync, violates S14); a discriminated-union fork of `ReviewItem` (unneeded ceremony at this scope).

## S26 · TASK-75: nullable Payment.invoice_id + new CreditNote entity — approved 2026-11-05
**Context.** An unapplied payment has no invoice to attach to at receipt time; a short-payment write-off is a Manager decision distinct from the cash movement itself.
**Decision.** `Payment.invoice_id` becomes nullable; an unapplied payment is a `Payment` row with `invoice_id = null`, allocated later via a transactional command. A new `CreditNote` entity (`credit_note_id, invoice_id, amount_paise, reason, approved_by`) records write-off acceptance as its own audited fact.
**Rejected.** A synthetic placeholder invoice for unapplied payments (fabricates a fact); modelling write-offs as a `Dispute` subtype (conflates customer disputes with internal write-off decisions).

## S27 · TASK-75: true multi-agent orchestration — USER-APPROVED, overriding recommendation, 2026-11-05
**Context.** Three agent-architecture options were weighed: a single-pipeline provider-seam extension (recommended, smallest diff, consistent with v1's existing shape), a two-agent split, and three fully separate agents (Recommend/Policy/Execute) with their own state and hand-off records. The user was shown the cost/complexity tradeoff explicitly — tripled state/test surface versus the single-pipeline option — and reaffirmed the choice on being asked a second time.
**Decision.** Three separate agents: Recommend produces a verified-facts recommendation (reusing `draft.ts`'s `factsFor()` pattern); Policy runs a gated rule table against the permission matrix and writes a versioned `PolicyDecision`; Execute reads only the `PolicyDecision.verdict`, never the raw recommendation, and writes exclusively through the existing `commands.ts` one-transaction path.
**Rejected.** Single-pipeline provider-seam extension (my recommendation); a two-agent (Recommend+Policy combined, Execute separate) compromise.
**Reason recorded.** The user's explicit, twice-confirmed Stage 2 decision, choosing the architectural story for the success audience (Discovery §1) over the smaller-diff option.

## S28 · TASK-75: gated rule table policy engine + PolicyDecision record — approved 2026-11-05
**Context.** The Policy agent's decision must be auditable to a Senior PM interviewer ("why was this auto-permitted") and must not bypass the existing permission matrix (Discovery §2).
**Decision.** An ordered gated rule table, same shape as `priority.v1`'s G1–G7, run against the ≤₹5,00,000-exact/unambiguous-vs-everything-else threshold; writes `{decision_id, exception_id, recommendation_ref, verdict, reason, config_version}`, append-only. Unit-tested exhaustively, matching `permissions.ts`'s existing bar.
**Rejected.** A weighted/scoring model (less legible to audit); inline policy checks inside the Execute agent with no separate record (no independent audit trail).

## S29 · TASK-75: NSM = one frozen AS_OF_DATE demo session, labelled Simulated — approved 2026-11-05
**Context.** Discovery §8.1 asks for an NSM normalized "per analyst-week," but the demo has no real session history to average over (S9's zero-cost per-visitor storage).
**Decision.** NSM = Σ(correctly resolved exception value this session) ÷ 1 simulated analyst-week, where one simulated analyst-week = one frozen `AS_OF_DATE` demo session (mirrors S11's frozen clock). Always shown with the label "Simulated — one demo session = one analyst-week."
**Rejected.** A rolling/multi-session average (no session persistence exists to support it); a hard-wired historical denominator (fabricates a number).

## S30 · TASK-75: extend scripts/seed.ts in place, no second generator — approved 2026-11-05
**Context.** The existing fixed-PRNG seed generator and its coverage test are the single source of the shipped demo data (`docs/Data-Model.md` §7); a second generator would fork that source of truth.
**Decision.** Add unallocated-payment, short-payment-pattern (≥3/90 days for one customer) and ambiguous/overpayment fixtures to `scripts/seed.ts`; bump the committed CSV/JSON output and extend the existing coverage test in the same script.
**Rejected.** A separate v2-only generator/dataset (two scripts and two coverage tests to keep in sync).

## S31 · TASK-75: v1 routes unchanged; add /exceptions, /exceptions/[id] — approved 2026-11-05
**Context.** v1's routes (`/`, `/queue`, `/invoices/[id]`, `/disputes`, `/payments`, `/drafts`, `/audit`, `/settings`) are stable and some are already load-bearing for TASK-45's splash trigger logic.
**Decision.** No v1 route is renamed, merged or redirected. Two new top-level routes are added: `/exceptions` (list) and `/exceptions/[id]` (detail).
**Rejected.** Renaming/merging `/queue` into `/exceptions` (breaks existing bookmarks/tests/splash logic for no stated benefit).

## S32 · TASK-75: F16 reversal permission confirmed Manager-only — approved 2026-11-05
**Context.** Discovery flagged F16 (exception reversal) as an open confirmation item, not a new design question — it should match the existing permission tier.
**Decision.** Confirmed: reversal/reopen of an exception is Manager-only, matching the existing >₹5,00,000/ambiguous/write-off permission tier. No new permission tier is introduced.
**Rejected.** A separate, lower-privilege reversal permission (would weaken the reopen-rate guardrail's meaning).

## S33 · TASK-75/TASK-45/TASK-46 sequencing: finish, not park — approved 2026-11-05
**Context.** Discovery §7 left "finish or park TASK-45/46 before v2 code" as an open Stage 2 decision. Both tickets' remaining work (45.9/45.10 art+release evidence, 46.8 final heritage art) is small, close to Done per `HANDOFF.md`, and isolated from v2's domain/schema surface.
**Decision.** Finish TASK-45 and TASK-46 completely (both Done in Campfire) before opening any TASK-75 Stage 4+ ticket's branch.
**Rejected.** Parking them mid-flight to start v2 sooner (reopens in-flight branches later, risking context loss on nearly-finished work for no scheduling gain, since v2's own Stage 4 breakdown has not started).
