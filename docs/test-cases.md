# TASK-75 — Verilane v2 (ExceptionOS) — Test Cases

> **Stage:** 5 · Technical Planning (Full tier) · **Ticket:** TASK-75 · **Date:** 2026-11-05
> **Status:** TEST ARCHITECTURE WIRED
> **Schema:** TC-### (Test Case ID); linked to M-## (Milestone) and task-## (Backlog task) · Related tickets and gating findings marked X-### (Code Review, Security, Regression)
> **This document:** unit tests, integration tests, eval gates, and per-ticket acceptance criteria. One row = one test; each test is sized 2–5 minutes of execution.

---

## Glossary

- **TC-###:** Test Case ID (sequential, persistent once created)
- **M-##:** Milestone ID (M-7 is TASK-75 / Exceptions Suite)
- **task-##:** Backlog task ID (e.g., task-79.1 for schema migration)
- **Automation candidate:** Y/N — whether this test can be run by CI (vs. manual walkthrough)
- **Type:** unit / integration / e2e / manual / eval
- **Priority:** critical / high / medium
- **Status:** (to be filled during execution) not-started / in-progress / passed / failed
- **Finding ref:** link to code review or eval issue (e.g., "CR-001 nullable query")

---

## Section 1: Data Model & Schema Tests

### TC-001 · Schema migration: reviewItems → exceptions rename succeeds

| Field | Value |
|---|---|
| **Objective** | Verify existing `reviewItems` table is renamed to `exceptions` and v1 data survives |
| **Related** | M-7, task-79.1 (Cut branch, rename schema) |
| **Preconditions** | v1 database is populated with ≥5 ReviewItem rows (pre-existing kinds: draft, dispute, etc.) |
| **Steps** | 1. Open app with v1 DB · 2. Verify ReviewItem query returns 5+ rows · 3. Trigger Dexie version bump (close app, clear IndexedDB, reopen) · 4. Query new `exceptions` table · 5. Assert count matches v1 |
| **Data** | 5 pre-seeded ReviewItems: 2 drafts, 1 dispute, 2 missing_info |
| **Expected result** | Query `exceptions` returns all 5 rows with kinds unchanged; no data loss |
| **Type** | integration |
| **Priority** | critical |
| **Automation candidate** | Y (Playwright: seeded DB → upgrade → query → assert) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-002 · Exception schema: two new kind values accepted

| Field | Value |
|---|---|
| **Objective** | Verify `Exception.kind` enum includes `unallocated_payment` and `short_payment_pattern` |
| **Related** | M-7, task-79.1 (Schema migration) |
| **Preconditions** | Dexie v2 schema loaded; app running |
| **Steps** | 1. Create Exception row with `kind: 'unallocated_payment'` · 2. Query exceptions table · 3. Assert kind is stored and retrieved correctly · 4. Create row with `kind: 'short_payment_pattern'` · 5. Repeat query |
| **Data** | New Exception row: `{item_id: "EX-001", kind: 'unallocated_payment', status: 'open', …}` |
| **Expected result** | Both kinds stored and retrieved without TS error or validation failure |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y (unit test: schema validation) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-003 · Payment.invoice_id nullable: query with null handling

| Field | Value |
|---|---|
| **Objective** | Verify `Payment.invoice_id` can be null and queries handle null explicitly |
| **Related** | M-7, task-79.1 (Schema migration) |
| **Preconditions** | Dexie v2; seeded with 1 payment `invoice_id = null`, 2 payments with invoice_ids |
| **Steps** | 1. Query outstanding balance for INV-001 (only two non-null payments assigned to it) · 2. Assert result excludes the null-invoice_id payment · 3. Query unapplied payments separately (WHERE invoice_id IS NULL) · 4. Assert count = 1 |
| **Data** | Payments: {payment_id: P1, invoice_id: null, amount: 45000}, {payment_id: P2, invoice_id: "INV-001", amount: 50000}, {payment_id: P3, invoice_id: "INV-001", amount: 30000} |
| **Expected result** | Outstanding on INV-001 = 80000; unapplied total = 45000. No silent drop, no null coercion. |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-004 · CreditNote entity: creation and permission gate

| Field | Value |
|---|---|
| **Objective** | Verify `CreditNote` row is created only if `approver_role === 'manager'` |
| **Related** | M-7, task-79.5 (Credit-note write-off) |
| **Preconditions** | v2 schema loaded; Analyst and Manager roles seeded in session |
| **Steps** | 1. As Analyst, call `approveCreditNoteCommand({invoice_id: "INV-001", amount: 12300, …})` · 2. Assert rejected with "Not permitted" · 3. Switch to Manager role · 4. Call same command · 5. Assert CreditNote row created with `approved_by: 'manager'` |
| **Data** | CreditNote: `{invoice_id: "INV-001", amount_paise: 1230000, reason: "Short payment pattern", approved_by: "manager", …}` |
| **Expected result** | Analyst attempt fails; Manager attempt succeeds; one CreditNote row persisted |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y (unit test: permission check) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-005 · PolicyDecision: append-only, no delete API

| Field | Value |
|---|---|
| **Objective** | Verify `PolicyDecision` rows are append-only (no update/delete allowed) |
| **Related** | M-7, task-79.3 (Recommend & Policy agents) |
| **Preconditions** | v2 schema; one PolicyDecision row created |
| **Steps** | 1. Create PolicyDecision row (decision_id: POL-001, verdict: auto_permitted) · 2. Try to update it (e.g., verdict → needs_manager) · 3. Assert update fails or is silently ignored (implementation dependent) · 4. Try to delete it · 5. Assert delete is not supported |
| **Data** | PolicyDecision: `{decision_id: "POL-001", exception_id: "EX-001", verdict: "auto_permitted", …}` |
| **Expected result** | No update/delete methods available; only reads and inserts allowed |
| **Type** | unit |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

## Section 2: Agent Tests

### TC-006 · Recommend Agent: unallocated payment with high-confidence match

| Field | Value |
|---|---|
| **Objective** | Recommend agent produces `VerifiedFact[]` matching an unallocated payment to an invoice |
| **Related** | M-7, task-79.2 (Trace unallocated payment E2E) |
| **Preconditions** | v2 schema; seeded data: Payment (₹45,000, no invoice_id), Invoice (ACME, ₹45,000 outstanding) |
| **Steps** | 1. Call `recommendForException(unallocated_payment_exception, […payments], […invoices], customer)` · 2. Assert returns `{ok: true, value: RecommendedFacts}` · 3. Assert facts include verified claim: "₹45,000 matches INV-0142 exactly" · 4. Assert each fact traces to a source (e.g., `source_id: "INV-0142"`) · 5. Assert confidence = 'high' |
| **Data** | Exception: `{kind: 'unallocated_payment', …}`, Payment: `{amount: 45000, invoice_id: null, …}`, Invoice: `{invoice_id: "INV-0142", outstanding: 45000, …}` |
| **Expected result** | Recommendation includes high-confidence match; no unverified claims; every fact has a source ref |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y (unit test; mock Claude call) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-007 · Recommend Agent: ambiguous match marked low-confidence

| Field | Value |
|---|---|
| **Objective** | Recommend agent returns `confidence: 'low'` when payment matches two invoices equally |
| **Related** | M-7, task-79.2 |
| **Preconditions** | v2 schema; seeded: Payment (₹50,000), Invoices (INV-A: ₹50,000 outstanding, INV-B: ₹50,000 outstanding, same customer) |
| **Steps** | 1. Call `recommendForException(exception, […], […], customer)` · 2. Assert `confidence: 'low'` · 3. Assert facts list both invoices as candidates · 4. Assert recommendation text is explicit: "Cannot determine which invoice; requires review" |
| **Data** | Payment: `{amount: 50000, invoice_id: null, …}`, Invoices: two with 50000 outstanding each |
| **Expected result** | Confidence = 'low'; no auto-pick; both candidates listed |
| **Type** | unit |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-008 · Policy Agent: gate G1 (≤₹5,00,000 + high-confidence = auto_permitted)

| Field | Value |
|---|---|
| **Objective** | Policy agent applies gate G1: exact-and-unambiguous match ≤₹5,00,000 → auto_permitted verdict |
| **Related** | M-7, task-79.3 (Recommend & Policy agents) |
| **Preconditions** | v2 schema; gate table loaded; Recommend output cached |
| **Steps** | 1. Create context: {exception.kind: 'unallocated_payment', recommendation.confidence: 'high', recommendation.amount: 500000 (paise)} · 2. Call `evaluatePolicyForException(exception, recommendation, config, 'analyst')` · 3. Assert verdict = 'auto_permitted' · 4. Assert reason includes "Amount ≤ ₹5,00,000 and exact match" · 5. Assert PolicyDecision row created |
| **Data** | Recommendation: `{confidence: 'high', amount_paise: 50000000}` |
| **Expected result** | verdict = auto_permitted; decision persisted; reason text clear |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y (gate unit test) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-009 · Policy Agent: gate G3 (low-confidence = needs_manager)

| Field | Value |
|---|---|
| **Objective** | Policy agent applies gate G3: ambiguous/low-confidence → needs_manager verdict |
| **Related** | M-7, task-79.3 |
| **Preconditions** | v2 schema; gate table loaded |
| **Steps** | 1. Create context: {exception.kind: 'unallocated_payment', recommendation.confidence: 'low'} · 2. Call policy evaluation · 3. Assert verdict = 'needs_manager' · 4. Assert reason includes "Ambiguous match" |
| **Data** | Recommendation: `{confidence: 'low', amount_paise: 50000000}` |
| **Expected result** | verdict = needs_manager; not auto_permitted |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-010 · Policy Agent: gate G4 (amount > ₹5,00,000 = needs_manager)

| Field | Value |
|---|---|
| **Objective** | Policy agent applies gate G4: high-confidence match but amount > threshold → needs_manager |
| **Related** | M-7, task-79.3 |
| **Preconditions** | v2 schema; gate table |
| **Steps** | 1. Create context: {amount_paise: 600000000 (₹60 lakh)} · 2. Call policy evaluation · 3. Assert verdict = 'needs_manager' |
| **Data** | Recommendation: `{confidence: 'high', amount_paise: 600000000}` |
| **Expected result** | verdict = needs_manager regardless of confidence |
| **Type** | unit |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-011 · Policy Agent: gate exhaustion on zero-amount edge case

| Field | Value |
|---|---|
| **Objective** | Policy agent handles edge case: zero-amount payment; gates don't match → verdict = blocked |
| **Related** | M-7, task-79.3 |
| **Preconditions** | v2 schema |
| **Steps** | 1. Create exception with amount = 0 paise · 2. Call policy evaluation · 3. Assert result is Rejected (or verdict = blocked, depending on gate logic) · 4. Assert error message is clear |
| **Data** | Recommendation: `{amount_paise: 0}` |
| **Expected result** | No auto_permitted verdict; error or blocked state |
| **Type** | unit |
| **Priority** | medium |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

## Section 3: Command Tests

### TC-012 · Allocation command: one transaction, one audit event

| Field | Value |
|---|---|
| **Objective** | `allocatePaymentCommand` updates Payment.invoice_id, updates Exception.status, writes audit event — all in one Dexie transaction (S14 invariant) |
| **Related** | M-7, task-79.2 |
| **Preconditions** | v2 schema; seeded: Payment (invoice_id: null), Exception (kind: unallocated_payment, status: open), Invoice, Manager role |
| **Steps** | 1. Start transaction mock (or real, if testing actual Dexie) · 2. Call `allocatePaymentCommand(exception, policy_reason)` · 3. Assert exactly one DB write per step (payment update, exception update, audit event insert) · 4. Assert all three writes in same transaction scope · 5. Inject failure mid-write; assert no partial state (payment.invoice_id not set, exception.status still 'open') |
| **Data** | Payment: `{payment_id: "P1", invoice_id: null, amount: 45000}`, Exception: `{item_id: "EX-1", kind: 'unallocated_payment', status: 'open'}` |
| **Expected result** | Transaction succeeds or fully rolls back; no partial state; audit event written only if all updates succeed |
| **Type** | integration |
| **Priority** | critical |
| **Automation candidate** | Y (integration test; Dexie transaction test) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-013 · Allocation command: permission check blocks Analyst

| Field | Value |
|---|---|
| **Objective** | `allocatePaymentCommand` rejects allocation attempt by Analyst role |
| **Related** | M-7, task-79.4 (Auto-execute, gate action bar) |
| **Preconditions** | v2 schema; Analyst role active; seeded payment and exception |
| **Steps** | 1. As Analyst, call `allocatePaymentCommand(exception, reason)` · 2. Assert rejected with "Not permitted" · 3. Assert no DB writes (payment.invoice_id unchanged, no audit event) |
| **Data** | Analyst session; payment waiting |
| **Expected result** | Permission error; DB unchanged |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-014 · Allocation command: permission check allows Manager

| Field | Value |
|---|---|
| **Objective** | `allocatePaymentCommand` succeeds when called by Manager role |
| **Related** | M-7, task-79.4 |
| **Preconditions** | v2 schema; Manager role active |
| **Steps** | 1. As Manager, call `allocatePaymentCommand(exception, reason)` · 2. Assert success · 3. Assert Payment.invoice_id updated · 4. Assert Exception.status = 'resolved' · 5. Assert audit event written with actor = 'manager_user' |
| **Data** | Manager session |
| **Expected result** | Allocation succeeds; all state updated; audit trail shows manager as actor |
| **Type** | unit |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-015 · Credit-note command: one transaction, approval writes audit event

| Field | Value |
|---|---|
| **Objective** | `approveCreditNoteCommand` creates CreditNote row, updates Exception.status, writes audit event — one transaction |
| **Related** | M-7, task-79.5 (Credit-note write-off) |
| **Preconditions** | v2 schema; seeded: Exception (kind: short_payment_pattern), Invoice, Manager role |
| **Steps** | 1. Call `approveCreditNoteCommand(exception, amount, reason)` as Manager · 2. Assert CreditNote row created with amount and reason · 3. Assert Exception.status = 'resolved' · 4. Assert audit event: "Manager approved write-off of ₹{amount}" · 5. Inject failure; verify rollback |
| **Data** | Exception: `{kind: 'short_payment_pattern'}`, CreditNote: `{amount: 123000, reason: "Pattern"}` |
| **Expected result** | CreditNote created, exception resolved, audit event written (all one transaction) |
| **Type** | integration |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

## Section 4: End-to-End Integration Tests

### TC-016 · Unallocated payment E2E: Seed → Recommend → Policy → Execute → Resolved

| Field | Value |
|---|---|
| **Objective** | Complete flow: unallocated payment appears in /exceptions, Recommend+Policy+Execute run, Exception resolved, invoice updated |
| **Related** | M-7, task-79.2 (Trace unallocated payment) |
| **Preconditions** | v2 seeded DB with: Payment (invoice_id: null, ₹45,000), Invoice (ACME, ₹45,000 outstanding), Customer |
| **Steps** | 1. Open /exceptions route · 2. Assert payment appears as `kind: unallocated_payment` · 3. Click to open detail · 4. Verify Recommend agent ran: shows verified facts matching to INV-0142 · 5. Verify Policy agent ran: verdict = auto_permitted · 6. As Manager, click "Submit for approval" · 7. Assert allocation executed (one transaction) · 8. Assert exception status → resolved · 9. Navigate to /invoices/[ACME-INV-0142]; verify balance now includes the ₹45,000 allocation · 10. Verify audit log shows: Recommend → Policy → Execute chain |
| **Data** | Seeded: unallocated payment, matching invoice, customer |
| **Expected result** | Full flow succeeds; no intermediate failures; audit trail shows all three agent stages; invoice reflects allocation |
| **Type** | e2e |
| **Priority** | critical |
| **Automation candidate** | Y (e2e test: Playwright navigation, assertions on UI and DB) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-017 · Short-payment pattern E2E: Detection → Manager approval → Write-off

| Field | Value |
|---|---|
| **Objective** | Customer with 3 short payments in 90 days → one pattern exception created → Manager approves write-off → CreditNote persisted |
| **Related** | M-7, task-79.5 |
| **Preconditions** | v2 seeded: Customer with exactly 3 short payments within 90 days (e.g., -₹1,000 each payment, same invoice) |
| **Steps** | 1. App loads; system detects pattern · 2. Open /exceptions · 3. Assert one exception with `kind: short_payment_pattern` (NOT three separate ones) · 4. Click detail · 5. Verify Recommend agent lists all 3 payments, total value ₹3,000 · 6. Verify Policy agent: verdict = needs_manager · 7. As Manager, click "Approve write-off" · 8. Assert CreditNote row created with amount = ₹3,000 · 9. Assert exception status → resolved · 10. Verify audit: "Manager approved write-off of ₹3,000" |
| **Data** | Customer with 3 short payments: {-₹1,000 on 2026-10-05}, {-₹1,000 on 2026-10-18}, {-₹1,000 on 2026-10-29} (all within 90 days) |
| **Expected result** | One pattern exception created; correctly identified as short-payment pattern; CreditNote approved and written; audit trail clear |
| **Type** | e2e |
| **Priority** | critical |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-018 · Ambiguous payment escalates to Manager, not auto-picked

| Field | Value |
|---|---|
| **Objective** | Payment matching two invoices equally well → Policy verdict = needs_manager; Analyst cannot approve; Manager approves choice |
| **Related** | M-7, task-79.2 |
| **Preconditions** | v2 seeded: Payment (₹50,000), two invoices (INV-A and INV-B, each ₹50,000 outstanding, same customer) |
| **Steps** | 1. Open /exceptions · 2. Assert ambiguous payment listed · 3. As Analyst, try to click "Submit for approval" · 4. Assert button disabled or error: "Manager approval required" · 5. Switch to Manager · 6. Button enabled; click · 7. Assert Manager can choose target invoice (UI flow TBD) · 8. Choose INV-A · 9. Assert Payment.invoice_id = "INV-A" · 10. Verify no auto-pick; human choice required |
| **Data** | Payment: ₹50,000; INV-A and INV-B each ₹50,000 outstanding |
| **Expected result** | Escalation to Manager; no Analyst approval; correct invoice chosen by human; allocation applied |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-019 · Reversal: Manager reverses an applied allocation; NSM guardrail updated

| Field | Value |
|---|---|
| **Objective** | F16: an applied allocation can be reversed by Manager; reversal audited; NSM guardrail (reversal rate) incremented |
| **Related** | M-7, task-79.6 (Reversal) |
| **Preconditions** | v2; seeded: resolved allocation (Exception.status = resolved, Payment.invoice_id set) |
| **Steps** | 1. Navigate to resolved exception detail · 2. Assert "Reverse allocation" button visible (Manager-only) · 3. Click reverse · 4. Assert Payment.invoice_id reset to null · 5. Assert Exception.status = 'open' · 6. Assert audit event: "Manager reversed allocation of INV-..." · 7. Check NSM guardrail: reversal_count incremented · 8. Verify NSM itself may decrease (reversed exception no longer counts as correctly resolved) |
| **Data** | Previously resolved exception with allocation |
| **Expected result** | Allocation reversed; audit trail clear; NSM guardrail tracked |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

## Section 5: UI & Routing Tests

### TC-020 · /exceptions route renders exception list correctly

| Field | Value |
|---|---|
| **Objective** | /exceptions list route displays all open exceptions in row-card format (Design §5) |
| **Related** | M-7, task-79.3–79.9 (all tickets contribute to UI) |
| **Preconditions** | v2 app running; seeded exceptions: 2 unallocated_payment, 1 short_payment_pattern, 1 dispute (pre-existing kind) |
| **Steps** | 1. Navigate to /exceptions · 2. Assert all 4 exceptions visible · 3. Verify columns: Kind | Subject | Amount | Status | Priority | Action · 4. Assert row-card density (64px tall, matching v1 Queue) · 5. Click "Review" on first exception; verify navigation to /exceptions/[id] |
| **Data** | 4 seeded exceptions (mix of old and new kinds) |
| **Expected result** | All exceptions listed; row-card layout matches Design; navigation works |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y (Playwright: navigate, screenshot, assert element visibility) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-021 · /exceptions/[id] route displays three-stage workflow (Design §4)

| Field | Value |
|---|---|
| **Objective** | Detail page shows Stage 1 (Recommend) / Stage 2 (Policy) / Stage 3 (Execute) blocks with agent outputs |
| **Related** | M-7, task-79.3–79.9 |
| **Preconditions** | v2; one exception with completed Recommend and Policy stages |
| **Steps** | 1. Open /exceptions/[id] · 2. Assert three distinct sections: "1. Recommend Agent" | "2. Policy Agent" | "3. Execute Agent" · 3. Verify Stage 1: lists verified facts · 4. Verify Stage 2: shows verdict, reason, version, timestamp · 5. Verify Stage 3: shows action readiness (Ready / Pending / Executed) · 6. Click "Submit for approval"; verify action bar interaction |
| **Data** | One complete exception record with all three agent stages populated |
| **Expected result** | Three-stage workflow visible; all data displayed; action buttons functional |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-022 · Home / amended: NSM metric visible with "Simulated" label

| Field | Value |
|---|---|
| **Objective** | Home page displays NSM section with value and honest "Simulated — one demo session = one analyst-week" label (Design §6, R8) |
| **Related** | M-7, task-79.7 (NSM computation) |
| **Preconditions** | v2; seeded with 2 resolved exceptions (value ₹100,000 total) |
| **Steps** | 1. Navigate to Home (/) · 2. Assert NSM section appears above task feed · 3. Assert value shows ₹100,000 (or actual session total) · 4. Assert label text exactly: "Simulated — one demo session = one analyst-week" (must be visible, not hidden) · 5. Verify label is not hidden under disclosure/tooltip |
| **Data** | 2 resolved exceptions: ₹50,000 + ₹50,000 |
| **Expected result** | NSM displayed with honest label; value matches session total |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y (Playwright: screenshot, text assertion) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-023 · /exceptions loading state: skeleton rows appear while fetching

| Field | Value |
|---|---|
| **Objective** | /exceptions list shows skeleton row-cards during initial load (Design §13: loading state) |
| **Related** | M-7, task-79.3–79.9 |
| **Preconditions** | v2 app; network throttling simulated (slow fetch) |
| **Steps** | 1. Navigate to /exceptions with throttled network · 2. Assert skeleton row-cards appear (5–7 shimmer rows, 64px tall) · 3. Wait for real data; assert skeletons replaced with actual rows · 4. Assert no layout shift (skeleton same height as real rows) |
| **Data** | Throttled network; seeded exceptions |
| **Expected result** | Skeleton loading state visible; smooth transition to loaded state; no CLS (Cumulative Layout Shift) |
| **Type** | e2e |
| **Priority** | medium |
| **Automation candidate** | Y (Playwright with network throttle) |
| **Status** | — |
| **Finding ref** | — |

---

## Section 6: Evaluation Gates (pnpm eval)

These gates are part of the `pnpm eval` test suite and must pass before Stage 6 sign-off.

### TC-024 · EVAL: policy-conflict-executed = 0

| Field | Value |
|---|---|
| **Objective** | No PolicyDecision verdict of `blocked` or `needs_*` was ever executed (count = 0) |
| **Related** | M-7 gate; all TASK-79 tickets |
| **Preconditions** | Full eval suite run on seeded v2 data; all exceptions processed |
| **Steps** | 1. Run `pnpm eval` · 2. Measure: count of exceptions where `PolicyDecision.verdict` is `blocked` or `needs_analyst` or `needs_manager` AND execution was attempted/completed · 3. Assert count = 0 |
| **Data** | Seeded exceptions across all kinds; full policy evaluation run |
| **Expected result** | policy-conflict-executed = 0; gate passes |
| **Type** | eval |
| **Priority** | critical |
| **Automation candidate** | Y (CI: pnpm eval) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-025 · EVAL: allocation-recommendation accuracy ≥ 100%

| Field | Value |
|---|---|
| **Objective** | Recommend agent achieves ≥100% accuracy on unallocated-payment matches (TP+TN) / (TP+TN+FP+FN) |
| **Related** | M-7 gate; TASK-79.2 |
| **Preconditions** | Eval suite with unallocated-payment test set: 5 exact matches, 3 ambiguous, 2 no-match cases |
| **Steps** | 1. Run `pnpm eval` on unallocated-payment fixtures · 2. Measure TP (correct match) + TN (correct no-match or ambiguous) / all cases · 3. Assert ≥100% (all cases correctly classified) |
| **Data** | 10 unallocated-payment test cases (exact, ambiguous, no-match) |
| **Expected result** | accuracy ≥ 100%; gate passes |
| **Type** | eval |
| **Priority** | critical |
| **Automation candidate** | Y (CI: pnpm eval) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-026 · EVAL: short-payment-pattern detection = 100%

| Field | Value |
|---|---|
| **Objective** | Pattern detection correctly identifies all seeded ≥3/90-day short-payment instances (recall = 100%) |
| **Related** | M-7 gate; TASK-79.5 |
| **Preconditions** | Eval suite with pattern test set: 5 seeded customer-patterns, 3 single-instance short payments |
| **Steps** | 1. Run `pnpm eval` on short-payment fixtures · 2. Measure: patterns correctly identified / total patterns · 3. Assert detection recall = 100% (all 5 patterns found, zero false negatives) |
| **Data** | 8 short-payment scenarios (5 true patterns, 3 false positives to filter) |
| **Expected result** | recall = 100%; gate passes |
| **Type** | eval |
| **Priority** | critical |
| **Automation candidate** | Y (CI: pnpm eval) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-027 · EVAL: all v1 gates unchanged (smoke test)

| Field | Value |
|---|---|
| **Objective** | All six v1 eval gates still pass with v2 code (no regression) |
| **Related** | M-7 gate; all TASK-79 tickets |
| **Preconditions** | v2 code; v1 eval fixtures; v1 gates configured |
| **Steps** | 1. Run `pnpm eval` · 2. Assert all 6 v1 gates pass (approval enforcement, dispute recall, send-gate, priority accuracy, etc.) |
| **Data** | v1 test set + v2 code |
| **Expected result** | All v1 gates pass; no regression |
| **Type** | eval |
| **Priority** | critical |
| **Automation candidate** | Y (CI: pnpm eval) |
| **Status** | — |
| **Finding ref** | — |

---

## Section 7: Pre-Existing (v1) Regression Tests

### TC-028 · v1 Queue route still works: /queue unchanged

| Field | Value |
|---|---|
| **Objective** | /queue route renders and functions identically to v1 (no breaking changes) |
| **Related** | Solution-PRD §2.7: v1 routes unchanged |
| **Preconditions** | v2 app; v1 test data + new v2 exceptions mixed |
| **Steps** | 1. Navigate to /queue · 2. Assert only pre-existing exception kinds displayed (draft, uncertain_match, dispute, missing_info, reconciliation; NOT the new unallocated_payment / short_payment_pattern) · 3. Filter/sort work as before · 4. Click on an exception; detail page works |
| **Data** | v1 + v2 mixed exception data |
| **Expected result** | /queue displays only pre-existing kinds; v1 UX unchanged |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-029 · v1 Invoice detail route works: /invoices/[id] unchanged

| Field | Value |
|---|---|
| **Objective** | /invoices/[id] route still displays invoice details and payments correctly with v2 data |
| **Related** | Solution-PRD §2.7 |
| **Preconditions** | v2 app; invoice with both traditional payments and v2 unallocated payments |
| **Steps** | 1. Navigate to /invoices/[id] for ACME-INV-0142 · 2. Assert balance calculation correct (includes newly allocated payments from v2) · 3. Assert payment history shows all payments (including ones that started unapplied) · 4. Assert no display errors |
| **Data** | Invoice with v1 + v2 payments mixed |
| **Expected result** | Invoice detail shows correct balance; payment history complete; v1 UX unchanged |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

### TC-030 · Audit log e2e: all agent and command actions appear in v1 audit table

| Field | Value |
|---|---|
| **Objective** | /audit route displays v1 and v2 events (Recommend, Policy, Execute stages + allocation/credit-note commands all audited) |
| **Related** | M-7; Solution-PRD §2.3 (one-write-path invariant) |
| **Preconditions** | v2 app; full E2E flow completed (Recommend → Policy → Execute) |
| **Steps** | 1. Navigate to /audit log · 2. Filter by exception_id · 3. Assert audit trail shows: (1) Recommend agent evaluated exception, (2) Policy agent produced verdict, (3) Execute agent applied allocation, (4) allocation command executed with actor + permission check · 5. Verify each event has timestamp, actor, subject, reason |
| **Data** | Completed E2E flow |
| **Expected result** | All v2 stages appear in audit table; no steps missing; v1 format reused |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y |
| **Status** | — |
| **Finding ref** | — |

---

## Section 8: Accessibility & Responsive Tests

### TC-031 · Exceptions detail page: keyboard navigation (WCAG 2.2 AA)

| Field | Value |
|---|---|
| **Objective** | /exceptions/[id] fully navigable by keyboard; focus ring visible; button order logical |
| **Related** | Design §15 (Accessibility); NF5 from v1 Discovery |
| **Preconditions** | v2 app; exception detail open |
| **Steps** | 1. Press Tab repeatedly; assert focus ring visible on all interactive elements (buttons, links) · 2. Verify focus order matches visual order (left-to-right, top-to-bottom) · 3. Press Enter on "Submit for approval" button; assert action triggered · 4. Test on Exceptions list page as well |
| **Data** | /exceptions/[id] page |
| **Expected result** | Full keyboard navigation possible; no hidden focus; logical order |
| **Type** | manual |
| **Priority** | high |
| **Automation candidate** | N (axe accessibility audit can cover; full keyboard test is manual) |
| **Status** | — |
| **Finding ref** | — |

---

### TC-032 · Exceptions list: responsive at 768px (tablet) and 375px (mobile)

| Field | Value |
|---|---|
| **Objective** | /exceptions route responsive: no horizontal scroll, rows reflow correctly at tablet and mobile breakpoints |
| **Related** | Design §14 (Responsive behavior); NF6 from v1 Discovery |
| **Preconditions** | v2 app; viewport resized to 768px and 375px |
| **Steps** | 1. Resize to 768px (tablet) · 2. Assert exception list visible with no horizontal scroll · 3. Assert row-cards reflow to 2-line format · 4. Resize to 375px (mobile) · 5. Assert single-column layout; all content readable without zoom · 6. Filter/sort still work |
| **Data** | Exception list with 5+ rows |
| **Expected result** | Responsive reflow at both breakpoints; no horizontal scroll; readable on mobile |
| **Type** | e2e |
| **Priority** | high |
| **Automation candidate** | Y (Playwright: resize viewport, screenshot at breakpoints) |
| **Status** | — |
| **Finding ref** | — |

---

## Section 9: Interview Walkthrough (Manual)

### TC-033 · Interview walk (§8.2 of Discovery PRD): ~10 minutes, uninterrupted

| Field | Value |
|---|---|
| **Objective** | Complete problem-to-resolution flow in ~10 minutes: Overview → unallocated payment → evidence → recommendation → policy → approval → resolve → NSM updates → audit trail |
| **Related** | Discovery §8.2 (success audience scenario) |
| **Preconditions** | v2 app fully deployed; no dead controls; seeded data ready |
| **Steps** | 1. Start at Home (/). Point out NSM metric with "Simulated" label. · 2. Navigate to /exceptions. · 3. Select an unallocated payment exception. · 4. Review Recommend stage: verified facts, source refs, confidence. · 5. Review Policy stage: verdict = auto_permitted, reason clear. · 6. As Manager, click "Submit for approval". · 7. Watch allocation execute (one transaction, audit event written). · 8. Return to Home; NSM incremented. · 9. Check Audit log; entire chain visible: Recommend → Policy → Execute. · 10. Interviewer asks follow-up: "Why can't an Analyst do this alone?" Answer: "Amount/confidence factors gate via policy; Manager only for edge cases." |
| **Data** | Full v2 seeded data; uninterrupted network; no errors |
| **Expected result** | Walk completes in ~10 min; interviewer understands problem, trust boundary, and product judgment without prompting |
| **Type** | manual |
| **Priority** | critical |
| **Automation candidate** | Y (timed e2e run; but primary gate is human walkthrough) |
| **Status** | — |
| **Finding ref** | — |

---

## Summary

**Total test cases:** 33 (TC-001 through TC-033)

**Breakdown by type:**
- **Unit tests:** 13 (schema, agents, policy gates, permission checks)
- **Integration tests:** 7 (transactions, command flows, end-to-end agent chains)
- **E2E tests:** 10 (UI routes, responsive, regression, interview)
- **Eval gates:** 4 (critical metrics: policy-conflict, allocation accuracy, pattern detection, v1 regression)
- **Manual tests:** 2 (keyboard accessibility, interview walkthrough)

**Critical gates (must pass before Stage 6 sign-off):**
1. TC-001 (schema migration)
2. TC-003 (nullable queries)
3. TC-012 (one transaction invariant)
4. TC-016 (unallocated payment E2E)
5. TC-017 (short-payment pattern E2E)
6. TC-024 (policy-conflict-executed = 0)
7. TC-025 (allocation-recommendation accuracy ≥ 100%)
8. TC-026 (short-payment-pattern detection = 100%)

**Automation coverage:** 27/33 tests are automation candidates (Playwright + unit test runner + pnpm eval).

---

**Test Architecture Frozen:** 2026-11-05  
**Ready for:** Stage 6 Execution · Tickets: TASK-79.1 through TASK-79.9 · Per-ticket verification gates defined in Section 5 of `technical-plan.md`
