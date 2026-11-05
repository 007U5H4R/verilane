# TASK-75 — Verilane v2 (ExceptionOS) — Technical Plan

> **Stage:** 5 · Technical Planning (Full tier) · **Ticket:** TASK-75 · **Date:** 2026-11-05
> **Status:** APPROVED FOR IMPLEMENTATION (Stage 4 breakdown completed; gate passed)
> **Inputs:** `Solution-PRD-TASK-75.md` (approved), `Design-TASK-75.md` (approved), `milestones.md` (below), `tickets.md` (S2.3–S2.9 mapping)
> **This document:** technical architecture, data flow, component breakdown, and per-ticket atomic implementation plan with verification gates. No discovery or design decisions are revisited here; this is *how we build what was decided*.

---

## 0. Architecture Overview

TASK-75 extends the live Verilane domain with three new agents (Recommend, Policy, Execute) and two new data entities (`Exception` evolved from `ReviewItem`, and `CreditNote`). No new trust boundary; all financial writes still pass through the existing `commands.ts` one-write-path transaction (S14/Solution-PRD §2.3).

### Component layers (unchanged from v1)

```
UI Layer (React Next.js routes)
  ├─ /exceptions (list)
  ├─ /exceptions/[id] (detail)
  └─ / (amended: NSM metric added)

Application Layer (domain logic)
  ├─ src/domain/commands.ts (one-write-path: permission → transition → audit)
  ├─ src/domain/policy.ts (NEW: gated rule table, PolicyDecision generation)
  ├─ src/ai/provider.ts (amended: Recommend agent output shape; Policy engine call)
  └─ src/domain/transitions.ts (unchanged: state machine for all Exception kinds)

Data Layer (Dexie)
  ├─ exceptions (renamed from reviewItems; Exception schema with new kind values)
  ├─ payments (nullable invoice_id, amended query paths)
  ├─ creditNotes (NEW: write-off record)
  ├─ policyDecisions (NEW: append-only decision record)
  └─ [v1 tables: invoices, customers, … — unchanged]
```

### New agent state machine

```
Exception Queue Entry
    ↓
[1. Recommend Agent]
    Reads: Exception, related payments/invoices
    Outputs: recommendation_ref (verified facts, reusing draft.ts factsFor() pattern)
    Writes: nothing; produces read-only output
    ↓
[2. Policy Agent]
    Reads: recommendation_ref, Exception, permission matrix, config
    Runs: gated rule table (G1–G7 shape from priority.v1)
    Outputs: PolicyDecision {verdict, reason, config_version}
    Writes: PolicyDecision row to policyDecisions table (append-only)
    ↓
[3. Execute Agent]
    Reads: PolicyDecision.verdict (ONLY; never raw recommendation)
    If auto_permitted: calls commands.ts write path (allocation/credit-note command)
    If needs_analyst/needs_manager: queues to human review
    Outputs: audit event (via commands.ts)
    Writes: via existing one-write-path transaction
```

---

## 1. Data Model Changes

### 1.1 Exception (evolved ReviewItem)

**Schema (Dexie, src/store/db.ts):**

```typescript
// Existing fields (unchanged)
interface Exception {
  item_id: string; // PK
  subject_invoice_id?: string; // FK: invoices.invoice_id
  subject_customer_id?: string; // FK: customers.customer_id
  kind: 'draft' | 'uncertain_match' | 'dispute' | 'missing_info' | 'reconciliation' 
       | 'unallocated_payment' | 'short_payment_pattern'; // NEW kinds added
  recommendation?: string; // human-readable summary
  evidence_ids?: string[]; // refs to audit records
  validation_status: 'unreviewed' | 'reviewed' | 'confirmed';
  escalation_reason?: string;
  requires_role: 'analyst' | 'manager';
  status: 'open' | 'in_progress' | 'pending_approval' | 'resolved' | 'disputed';
  created_at: number; // timestamp
  updated_at: number;
  // NEW fields
  recommendation_ref?: string; // FK: references (id of Recommend agent's output)
  policy_decision_id?: string; // FK: policyDecisions.decision_id
}

// Dexie table: renamed from reviewItems to exceptions
export const exceptionSchema = "++item_id, subject_invoice_id, subject_customer_id, kind, status, created_at";
```

**Migration:** v1's `reviewItems` table is renamed to `exceptions` in the Dexie schema bump (version 2). All queries updated in the same changeset (no half-migrated state).

### 1.2 Payment (amended)

**Schema change:**

```typescript
interface Payment {
  payment_id: string; // PK
  amount_paise: number; // gross, before allocation
  invoice_id?: string | null; // FK: invoices.invoice_id — NOW NULLABLE
  received_at: number; // timestamp
  method: 'neft' | 'check' | 'ach' | 'wire' | 'other';
  sender_ref?: string;
  notes?: string;
  // ... existing fields
}
```

**Queries amended:** every query that assumes `invoice_id` is non-null (e.g., outstanding balance calc, payment history) is updated to handle `null` explicitly. No silent `undefined`.

**Outstanding balance query fix (example):**

```typescript
// OLD (fails on null invoice_id):
const paid = payments
  .filter(p => p.invoice_id === invoiceId)
  .reduce((sum, p) => sum + p.amount_paise, 0);

// NEW (explicit null handling):
const paid = payments
  .filter(p => p.invoice_id === invoiceId && p.invoice_id !== null)
  .reduce((sum, p) => sum + p.amount_paise, 0);
const unapplied = payments
  .filter(p => p.invoice_id === null)
  .reduce((sum, p) => sum + p.amount_paise, 0);
```

### 1.3 CreditNote (new)

**Schema:**

```typescript
interface CreditNote {
  credit_note_id: string; // PK: "CN-{timestamp}-{hash}"
  invoice_id: string; // FK: invoices.invoice_id (required; write-off is always tied to an invoice)
  amount_paise: number; // deduction/short-payment amount accepted
  reason: string; // e.g. "Customer short payment, repeated pattern"
  approved_by: string; // role: must be "manager" per permission matrix
  created_at: number; // timestamp
  audit_event_ref?: string; // FK: audit log event
}

// Dexie table:
export const creditNoteSchema = "++credit_note_id, invoice_id, created_at";
```

**Permission gate (in commands.ts):** CreditNote creation requires `can(approver_role, "approve_write_off", subject)` to return true. Analyst attempts are rejected.

### 1.4 PolicyDecision (new)

**Schema:**

```typescript
interface PolicyDecision {
  decision_id: string; // PK: "POL-{timestamp}-{hash}"
  exception_id: string; // FK: exceptions.item_id
  recommendation_ref?: string; // FK: references (Recommend agent's output)
  verdict: 'auto_permitted' | 'needs_analyst' | 'needs_manager' | 'blocked';
  reason: string; // human-readable gate result (e.g., "Amount ≤ ₹5,00,000 and exact match")
  config_version: string; // policy rules version (e.g., "v1") — immutable
  evaluated_at: number; // timestamp when Policy agent ran
  executed_at?: number; // when Execute agent acted (null if pending)
  executed_by?: string; // role or "execute_agent"
}

// Dexie table — append-only:
export const policyDecisionSchema = "++decision_id, exception_id, evaluated_at";
```

**Invariant:** no update/delete API for PolicyDecision; all changes are new rows or corrections via new PolicyDecision entries with a note.

### 1.5 Dexie Schema Version Bump

**Current version: 1 (v1)**
**New version: 2 (TASK-75)**

```typescript
// src/store/db.ts
const db = new Dexie('verilane');
db.version(1).stores({
  invoices: "++invoice_id, customer_id, created_at",
  payments: "++payment_id, invoice_id, received_at",
  reviewItems: "++item_id, subject_invoice_id, kind, status", // will migrate
  // ... v1 tables
});
db.version(2)
  .stores({
    invoices: "++invoice_id, customer_id, created_at",
    payments: "++payment_id, invoice_id, received_at", // invoice_id now nullable
    exceptions: "++item_id, subject_invoice_id, kind, status", // renamed from reviewItems
    creditNotes: "++credit_note_id, invoice_id, created_at", // new
    policyDecisions: "++decision_id, exception_id, evaluated_at", // new
    // ... other v1 tables unchanged
  })
  .upgrade(async (tx) => {
    // Migrate reviewItems → exceptions
    const oldItems = await tx.table('reviewItems').toArray();
    if (oldItems.length > 0) {
      await tx.table('exceptions').bulkAdd(oldItems);
      await tx.table('reviewItems').clear();
    }
  });
```

---

## 2. Agent Architecture & Implementation

### 2.1 Recommend Agent

**Input:** an `Exception` row, related `Payment` rows, related `Invoice` rows, related `Customer` row

**Output:** a `recommendation_ref` object (read-only; stored in audit, not written to DB as a separate table)

```typescript
// src/domain/draft.ts — reuse existing pattern for verified facts
interface RecommendedFacts {
  exception_id: string;
  facts: VerifiedFact[]; // each VerifiedFact = {claim, source_type, source_id, evidence}
  recommendation_text: string; // human-readable action (e.g., "Allocate to INV-0142")
  confidence: 'high' | 'medium' | 'low';
  generated_at: number;
}

// src/ai/provider.ts — NEW export
export async function recommendForException(
  exception: Exception,
  payments: Payment[],
  invoices: Invoice[],
  customer: Customer
): Promise<Result<RecommendedFacts, Rejected>> {
  // Claude call: "Given this unallocated payment and these candidate invoices, which is the best match?"
  // Returns VerifiedFact[] via factsFor() pattern (existing from draft.ts)
  // Never fabricates a fact; every claim traces back to a source record
}
```

**Unit test coverage:** every fact type, every confidence level, every ambiguous case that should return `Rejected`.

### 2.2 Policy Agent

**Input:** an `Exception`, a `recommendation_ref` from the Recommend agent, the permission matrix (Discovery §2)

**Output:** a `PolicyDecision` row (persisted to DB, append-only)

```typescript
// src/domain/policy.ts — NEW file
interface PolicyConfig {
  version: string; // e.g., "v1"
  thresholds: {
    exact_unambiguous_analyst_limit: number; // ₹5,00,000 in paise
  };
}

// Gated rule table (G1–G7 shape from priority.v1)
interface PolicyGate {
  id: string; // "G1", "G2", etc.
  condition: (context: PolicyContext) => boolean;
  verdict: PolicyDecision['verdict'];
  reason: string;
}

const policyGates: PolicyGate[] = [
  {
    id: 'G1',
    condition: (ctx) => 
      ctx.exception.kind === 'unallocated_payment' &&
      ctx.recommendation.confidence === 'high' &&
      ctx.recommendation.amount_paise <= ctx.config.exact_unambiguous_analyst_limit,
    verdict: 'auto_permitted',
    reason: 'Amount ≤ ₹5,00,000 and exact/unambiguous match → Analyst can approve',
  },
  {
    id: 'G2',
    condition: (ctx) => 
      ctx.exception.kind === 'short_payment_pattern' &&
      ctx.currentRole === 'manager',
    verdict: 'auto_permitted',
    reason: 'Short-payment pattern write-off requires Manager',
  },
  {
    id: 'G3',
    condition: (ctx) => ctx.exception.kind === 'unallocated_payment' && 
      ctx.recommendation.confidence === 'low',
    verdict: 'needs_manager',
    reason: 'Ambiguous match → requires Manager approval',
  },
  {
    id: 'G4',
    condition: (ctx) => ctx.recommendation.amount_paise > ctx.config.exact_unambiguous_analyst_limit,
    verdict: 'needs_manager',
    reason: 'Amount > ₹5,00,000 → requires Manager approval',
  },
  // G5–G7 for other exceptions and edge cases
];

export async function evaluatePolicyForException(
  exception: Exception,
  recommendedFacts: RecommendedFacts,
  config: PolicyConfig,
  currentRole: 'analyst' | 'manager'
): Promise<Result<PolicyDecision, Rejected>> {
  // Run gates in order; return the first matching verdict
  for (const gate of policyGates) {
    if (gate.condition({ exception, recommendation: recommendedFacts, config, currentRole })) {
      const decision: PolicyDecision = {
        decision_id: `POL-${Date.now()}-${randomHash()}`,
        exception_id: exception.item_id,
        verdict: gate.verdict,
        reason: gate.reason,
        config_version: config.version,
        evaluated_at: Date.now(),
      };
      await db.policyDecisions.add(decision); // persist
      return { ok: true, value: decision };
    }
  }
  // No gate matched → invalid state
  return { ok: false, error: new Rejected('No policy gate matched') };
}
```

**Unit test:** every gate, every verdict, every boundary condition (e.g., exactly ₹5,00,000, just over, zero). Match the exhaustive test bar of `permissions.ts`.

### 2.3 Execute Agent

**Input:** a `PolicyDecision` row (reads verdict from DB, never from the Recommend agent's output)

**Output:** if `verdict === 'auto_permitted'`, calls the appropriate command via `commands.ts`; otherwise queues to human review

```typescript
// src/ai/provider.ts — NEW export (or src/domain/execute.ts)
export async function executePolicy(
  decision: PolicyDecision,
  exception: Exception
): Promise<Result<{ audit_event_id: string }, Rejected>> {
  if (decision.verdict === 'auto_permitted') {
    // Invoke the appropriate command via commands.ts
    if (exception.kind === 'unallocated_payment') {
      return await allocatePaymentCommand(exception, decision.reason);
    } else if (exception.kind === 'short_payment_pattern') {
      return await approveCreditNoteCommand(exception, decision.reason);
    }
  } else if (decision.verdict === 'needs_analyst' || decision.verdict === 'needs_manager') {
    // Queue to human review; no automatic action
    await db.exceptions.update(exception.item_id, { 
      status: 'pending_approval',
      requires_role: decision.verdict === 'needs_manager' ? 'manager' : 'analyst',
    });
    return { ok: true, value: { audit_event_id: 'queued' } };
  } else if (decision.verdict === 'blocked') {
    // No action; exception remains open
    return { ok: false, error: new Rejected('Policy verdict is blocked') };
  }
}
```

**Trust boundary:** the Execute agent writes only via `commands.ts`, which enforces the one-write-path invariant (S14). No direct DB writes.

---

## 3. Data Flow & Sequencing

### 3.1 Unallocated Payment Flow (F13)

```
1. Seed data includes Payment with invoice_id = null
2. On app load, system detects this payment via query:
   SELECT * FROM payments WHERE invoice_id IS NULL AND status != 'resolved'
3. System creates an Exception row:
   {kind: 'unallocated_payment', subject_payment_id, status: 'open', …}
4. User opens /exceptions, clicks on the unallocated payment
5. [Recommend Agent] runs:
   - Fetches all related invoices for the customer
   - Calls Claude: "Match this payment to an invoice"
   - Returns VerifiedFact[] (each fact traces to invoice/payment record)
6. [Policy Agent] runs:
   - Evaluates: is amount ≤ ₹5,00,000 AND confidence === 'high'?
   - If yes: verdict = 'auto_permitted'
   - Writes PolicyDecision row to policyDecisions table
7. [Execute Agent] runs:
   - Reads PolicyDecision verdict
   - If auto_permitted: calls allocatePaymentCommand()
   - allocatePaymentCommand updates Payment.invoice_id, writes audit event (one transaction, S14)
   - Exception status → 'resolved'
8. UI updates: payment now shows on the matched invoice, no longer in /exceptions queue
9. NSM updates: this correctly resolved exception's value is added to the session total
```

### 3.2 Short-Payment Pattern Flow (F14)

```
1. Seed data includes Customer with ≥3 payments short by >0 within 90 days
2. On app load, system detects pattern via query:
   SELECT COUNT(*) FROM payments 
   WHERE customer_id = ? AND is_short = true AND received_at > (now - 90 days)
   HAVING COUNT(*) >= 3
3. System creates one Exception row (not one per payment):
   {kind: 'short_payment_pattern', subject_customer_id, status: 'open', …}
4. User opens /exceptions, clicks on the pattern exception
5. [Recommend Agent] runs:
   - Fetches all short payments for this customer in the 90-day window
   - Analyzes: is this a real pattern or isolated incidents?
   - Returns VerifiedFact[]: each short payment, total value, repeat count
6. [Policy Agent] runs:
   - Evaluates: does Manager role have approve_write_off permission?
   - If yes: verdict = 'needs_manager' (write-off approval is always Manager-only per F2)
   - Writes PolicyDecision row
7. User (Manager) reviews and approves write-off of the short amount
   - This triggers approveCreditNoteCommand()
   - Creates CreditNote row (invoice_id, amount, reason, approved_by)
   - Audit event: "Manager Tanya approved write-off"
8. Exception status → 'resolved'
```

### 3.3 Allocation Command (R3 from Solution-PRD)

```typescript
// src/domain/commands.ts — NEW command
export async function allocatePaymentCommand(
  exception: Exception,
  policyReason: string
): Promise<Result<{ audit_event_id: string }, Rejected>> {
  return await db.transaction('rw', db.payments, db.exceptions, db.invoices, db.auditEvents, async () => {
    // Step 1: Permission check (who is calling this?)
    const caller = getCurrentRole(); // from session
    if (!can(caller, 'allocate_payment', exception)) {
      return { ok: false, error: new Rejected('Not permitted') };
    }

    // Step 2: Fetch and validate
    const payment = await db.payments.get(exception.subject_payment_id);
    if (!payment) return { ok: false, error: new Rejected('Payment not found') };
    
    const targetInvoice = await db.invoices.get(exception.subject_invoice_id);
    if (!targetInvoice) return { ok: false, error: new Rejected('Invoice not found') };

    // Step 3: Transition (is this a valid state change?)
    const nextStatus = transitionException(exception.status, 'allocate');
    if (!nextStatus.ok) return { ok: false, error: nextStatus.error };

    // Step 4: Write
    await db.payments.update(payment.payment_id, { invoice_id: targetInvoice.invoice_id });
    await db.exceptions.update(exception.item_id, { status: 'resolved', updated_at: Date.now() });

    // Step 5: Audit
    const auditEvent: AuditEvent = {
      event_id: `AE-${Date.now()}-${randomHash()}`,
      action: 'allocate_payment',
      actor: caller === 'execute_agent' ? 'execute_agent' : `${caller}_user`,
      subject_type: 'payment',
      subject_id: payment.payment_id,
      changes: { invoice_id: [null, targetInvoice.invoice_id] },
      reason: policyReason,
      created_at: Date.now(),
    };
    await db.auditEvents.add(auditEvent);

    return { ok: true, value: { audit_event_id: auditEvent.event_id } };
  });
}
```

**Invariants maintained:**
- Permission check before any write
- One transaction = one state change + one audit event (S14)
- No partial state on crash (Dexie transaction ensures atomicity)

---

## 4. UI Routes & Components

### 4.1 `/exceptions` (new list route)

**Component:** `src/app/exceptions/page.tsx`

**Data flow:**
```
1. On load: fetch all Exception rows where status !== 'resolved'
2. Map each to a row-card (reuse v1 Queue row-card pattern from Design-TASK-75.md §5)
3. Display columns: Kind | Subject | Amount | Status | Priority | Action
4. Filter panel (reuse v1 Queue filters: status, priority, customer, ageing, search)
5. Click "Review" → navigate to /exceptions/[id]
```

**Example row:**
```
Kind: unallocated_payment
Subject: NEFT received — ₹45,000
Amount: ₹45,000
Status: Open
Priority: High
Action: Review [→]
```

**Async loading state (Design §13):** skeleton row-cards while fetching; "Error loading exceptions" on failure.

### 4.2 `/exceptions/[id]` (new detail route)

**Component:** `src/app/exceptions/[id]/page.tsx`

**Sections (from Design-TASK-75.md §4):**

1. **Three-stage workflow display:**
   - Stage 1: Recommend Agent — verified facts, confidence, recommendation
   - Stage 2: Policy Agent — verdict, reason, config version, timestamp
   - Stage 3: Execute Agent — status, readiness, action summary

2. **Evidence inline (Design §8):**
   - Payment details (received amount, method, sender ref)
   - Invoice facts (ID, customer, outstanding, age)
   - CreditNote (if applicable): amount, reason, approved by

3. **Policy Decision card (Design §9):**
   - Verdict badge
   - Reason text
   - Decision ID, version, timestamp

4. **Audit trail (Design §10):**
   - Reverse-chronological list of events related to this exception
   - Each event: timestamp, actor, action, subject, reason

5. **Action bar (Design §11):**
   - "Mark disputed" button (always available)
   - "Submit for approval" button (enabled/disabled based on verdict)
   - Status message if action unavailable (e.g., "Manager approval required")

**Async loading:** skeleton layout with placeholders; reload button on error.

### 4.3 `/` (amended Home screen)

**Section added (Design §6):**

```
KPI Strip (unchanged)
  Outstanding | High priority | Open disputes | Avg days overdue
  
NSM Section (NEW)
  Label: "NEW: Normalized Success Metric (NSM)"
  Value: ₹{computed_session_total}
  Description: "Simulated — one demo session = one analyst-week."
  
Tasks (unchanged)
  High-priority invoices | Exceptions | Open disputes | Drafts
```

**NSM computation (R8 from Solution-PRD):**
```
NSM = Σ(amount_paise of correctly resolved exceptions this session) ÷ 1
where "correctly resolved" = exception closed by approved action, not later reopened/reversed
```

**Labeling requirement:** every display of NSM must include "Simulated — one demo session = one analyst-week."

---

## 5. Test Architecture & Coverage

### 5.1 Unit Tests

**Policy Agent (policy.ts):**
- Every gate (G1–G7), every verdict
- Boundary conditions (exact ₹5,00,000, just over, zero, negative edge cases)
- All gate combinations

**Commands (allocation, credit-note):**
- Permission check enforced (Analyst blocked, Manager allowed)
- State machine valid transitions
- Audit event written in same transaction
- Crash mid-write leaves no partial state (injected failure between steps)

**Data model:**
- `Exception.kind` accepts all 7 values (5 pre-existing + 2 new)
- Nullable `Payment.invoice_id` queries return consistent results
- `CreditNote` creation permission gate enforced

**Coverage target:** 100% of new code, matching v1's test bar (S14).

### 5.2 Integration Tests

**Unallocated payment end-to-end (TC-001 from test-cases.md):**
1. Seed payment with `invoice_id = null`
2. Query for exceptions: returns the payment as `kind = unallocated_payment`
3. Recommend Agent runs on it: returns high-confidence match to an invoice
4. Policy Agent runs: verdict = auto_permitted (amount ≤ ₹5,00,000)
5. Execute Agent runs: allocation succeeds, audit event written
6. Query exceptions again: payment no longer in list (status = resolved)
7. Query invoice balance: now includes the allocated payment
8. Verify: one transaction, zero intermediate states

**Short-payment pattern detection (TC-002):**
1. Seed customer with 3 short payments within 90 days
2. Query for exceptions: returns one `kind = short_payment_pattern` exception
3. Recommend Agent: lists all 3 payments, total value, pattern confidence
4. Policy Agent (as Manager): verdict = auto_permitted
5. Manager clicks "Submit for approval"
6. CreditNote row created, exception resolved
7. Verify: exactly one exception for the pattern, not one per payment

**Permission gates (TC-003):**
1. Analyst tries to approve write-off: rejected by `can()` check
2. Manager approves same write-off: succeeds, CreditNote row created
3. Analyst tries to approve allocation > ₹5,00,000: rejected, queued to Manager
4. Manager approves: succeeds

### 5.3 Evaluation Gates (pnpm eval)

New gates added to `docs/AI-Evaluation.md`:

| Gate | Target | Definition |
|------|--------|-----------|
| **policy-conflict-executed** | 0 | Count of PolicyDecision verdicts that are `blocked` or `needs_*` but still had an action executed. Must be zero. |
| **allocation-recommendation accuracy** | 100% | Recommend agent's unallocated-payment recommendations (TP + TN) / (TP + TN + FP + FN). Measured on seeded test set. |
| **short-payment-pattern detection** | 100% | Recall: seeded patterns detected / total seeded patterns. Must detect all ≥3/90-day instances. |

All six v1 gates remain unchanged; these three are additions.

### 5.4 Test Data / Fixtures

**Seeds in `scripts/seed.ts` (updated per §2.6 of Solution-PRD):**

1. **Unallocated payment:** one NEFT payment with `invoice_id = null`, ₹45,000, from ACME, matching INV-0142 exactly
2. **Short-payment pattern:** one customer with exactly 3 payments, each ₹1,000 short, within 90 days
3. **Ambiguous match:** one payment matching two invoices equally well → escalates to Manager
4. **Edge case (overpayment):** one payment exceeding customer's total open balance

**Coverage test (updated):** asserts all four scenarios present in generated output; build fails if any missing.

---

## 6. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Renaming `ReviewItem` → `Exception` misses a call site** | Missed type error, runtime crash | TS compiler catches all ReviewItem refs; existing test suite runs on old schema first, migration test runs on new schema |
| **Nullable `Payment.invoice_id` query silently drops unapplied payments** | Financial inaccuracy (dangerous) | Every query tested explicitly for null handling; integration test runs full balance calculation with unapplied payments |
| **Policy gate doesn't cover an edge case (e.g., zero-amount payment)** | Auto-executed wrong action | Unit tests cover boundary cases (zero, negative, max int); gates default to `needs_manager` if no match (no "fall through" verdict) |
| **Execute Agent writes outside one-write-path** | Breaks S14 invariant | Code review gate checks: all Execute → commands.ts calls, no direct DB writes |
| **TASK-45/46 slip past Stage 5 (this stage)** | v2 code blocked until both Done | Gate rule in Solution-PRD §2.8: stage 4+ tickets don't open until TASK-45 and TASK-46 are Done in Campfire |

---

## 7. Deployment & Rollback

### 7.1 Deployment

1. **Dexie schema bump (v1 → v2):** Dexie auto-migrates on next app open; existing demo data survives via migration function
2. **New code paths:** behind feature gate (if desired) or direct deploy (simpler for demo)
3. **Seed data:** re-run `npm run seed` to populate new fixtures (or run once on deploy)
4. **Verification:** `pnpm eval` must pass all 9 gates (6 v1 + 3 new) before ship

### 7.2 Rollback

If needed (pre-production only):
- Delete the new Dexie tables (creditNotes, policyDecisions)
- Revert `exceptions` table rename back to `reviewItems` (or keep both, unused)
- Remove /exceptions routes (404 is acceptable for a demo)
- No data loss; v1 tables are untouched

---

## 8. Milestones & Ticket Mapping

See `milestones.md` and `tickets.md` (Sections 2.3–2.9 below) for full breakdown.

**M-7: TASK-75 (Exceptions suite) milestone**
- Tickets: TASK-79 (schema) → TASK-79.1 (schema) → TASK-79.2–79.9 (agents, commands, UI)
- Gate: all unit tests pass, all integration tests pass, `pnpm eval` passes with 9 gates
- Sequence: v1 finish gates (TASK-45/46 Done) before TASK-79 branch opens

---

## 9. Testing Strategy & Verification Gates

**Per ticket (from test-cases.md):**

- **TASK-79.1 (schema migration):** existing tests still pass on v1 schema; migration test verifies reviewItems → exceptions rename; new tables created
- **TASK-79.2 (allocation end-to-end):** TC-001 passes: unallocated payment → Recommend → Policy → Execute → resolved, one transaction
- **TASK-79.3 (Recommend/Policy agents):** every agent's unit tests pass; policy gate tests cover all combinations
- **TASK-79.4 (auto-execute):** TC-003 passes: permission gates enforced, approved actions execute, forbidden actions rejected
- **TASK-79.5 (short-payment detection):** TC-002 passes: ≥3/90-day pattern detected, one exception created, not one per payment
- **TASK-79.6 (reversal):** F16 requirement: reversal permitted for Manager only, audited, NSM guardrail updated
- **TASK-79.7 (NSM computation):** NSM appears on Home with "Simulated" label, updates on action, matches session's resolved value sum
- **TASK-79.8 (fixtures):** seed coverage test passes; all 4 required scenarios (unallocated, pattern, ambiguous, overpayment) present
- **TASK-79.9 (release evidence & interviews):** interview docs written, interview walk (§8.2 of Discovery) succeeds end-to-end, all routes pass e2e tests

**Final gate (Stage 6):** `pnpm eval` passes with policy-conflict-executed = 0, allocation-recommendation accuracy ≥100%, short-payment-pattern detection ≥100%, all v1 gates unchanged.

---

## 10. Decisions Log (Appended to decisions.md on TASK-75's branch)

These entries are appended once this ticket lands on `task/75-exceptions`:

### TP1 · TASK-75: Recommend Agent reuses draft.ts VerifiedFact pattern — approved 2026-11-05

**Context.** The Recommend agent must output claims that trace back to source records, matching v1's trust model.

**Decision.** Reuse `src/domain/draft.ts`'s existing `factsFor()` pattern and `VerifiedFact` type. No new output format is invented.

### TP2 · TASK-75: Policy Agent is a pure function; verdict is written to DB, never computed on-the-fly — approved 2026-11-05

**Context.** The Execute agent must read a persisted `PolicyDecision`, never infer a verdict from the raw recommendation.

**Decision.** Policy agent writes `PolicyDecision` rows to the `policyDecisions` table (append-only, no deletes). Execute agent reads only the `verdict` field, never the original gate logic.

### TP3 · TASK-75: NSM computation: session total ÷ 1, with "Simulated" label on every display — approved 2026-11-05

**Context.** Discovery §8.1 requires NSM "per analyst-week," but demo has no session history.

**Decision.** NSM = Σ(correctly resolved value in this session) ÷ 1. Always shown with the literal label "Simulated — one demo session = one analyst-week."

---

## 11. Exit Criteria (Stage 5 → Stage 6: Execution)

- [x] Technical architecture written and consistent with Solution-PRD (§1–3 above)
- [x] Data model defined: Exception (evolved), nullable Payment.invoice_id, CreditNote, PolicyDecision, Dexie v2 (§1)
- [x] Agent state machine specified: Recommend → Policy → Execute with hand-off records (§2)
- [x] Data flows documented: unallocated payment, short-payment pattern, allocation command (§3)
- [x] UI routes planned: /exceptions (list), /exceptions/[id] (detail), / (amended) (§4)
- [x] Test architecture wired: unit tests, integration tests, eval gates, seed fixtures (§5)
- [x] Risk mitigation documented (§6)
- [x] Deployment & rollback strategy stated (§7)
- [x] Milestones & tickets mapped (§8)
- [x] Testing strategy and per-ticket verification gates defined (§9)
- [x] Decisions log entries written (§10)
- [x] Campfire PWA synced with milestone/ticket/task structure (ready for Stage 6 execution)
- [x] USER SIGN-OFF: approve plan and authorize Stage 6 execution start

---

**Technical Plan Frozen:** 2026-11-05  
**Ready for:** Stage 6 (Execution)  
**Next gate:** Code Review (Stage 8) — findings marked M-###/TC-###, fix loops bounded per orchestration-playbook
