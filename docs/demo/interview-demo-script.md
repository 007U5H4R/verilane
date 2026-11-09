# Verilane v2 — interview demo script (~10 minutes)

> **Ticket:** TKT-75.09 (TASK-79.9) · F17 · Discovery-PRD-TASK-75 §8.2
> **Status:** Draft. Checked against the running product on `task/75-exceptionos` @ `f561490`. Each step below is exercised by the e2e walk `tests/e2e/exceptionos-walk.spec.ts` (TC-75.46).
> **Pending:** step 8 (short-payment pattern) depends on TASK-79.5 and is not in the product yet. Skip it in a demo until 79.5 merges and this section is rewritten against it.

## Ground rules for the presenter

- Everything on screen is **synthetic data** in a fictional company. There are no real customers, users, deployments or adoption numbers. Do not imply otherwise.
- The AI runs in **deterministic simulated mode** by default. Every AI output is labelled Simulated. Say so when it first appears.
- The North Star Metric is computed live from what you do in this session. Its label reads "Simulated — one demo session = one analyst-week". No outcome numbers are seeded.
- Start from a fresh session (Settings → Reset demo data, or a new browser profile) so the NSM begins at ₹0.00. Use a desktop width (≥1024px) so the sidebar is visible.
- Every control you click in this script does something. If one doesn't, stop and treat it as a bug.

## The walk

### 1 · Overview (Home, `/`) — ~1 min
**Show:** the North Star Metric block, with its Simulated label ("Value of payment exceptions resolved by an approved action and not reversed"), and the task feed with open exceptions.
**Say:** "v1 answered *should I chase this invoice?* v2 asks *why isn't this receivable clean?* The unit of work is the Exception: anything that stops an invoice or payment from flowing straight to closed. The metric is value resolved **correctly**: a reversal or reopen takes it back out, so fast-but-wrong closures don't score."

### 2 · Open an unallocated payment (Exceptions → RV-PAY-P-012) — ~30 s
**Click:** Exceptions in the sidebar, then *Review* on the Unallocated payment row RV-PAY-P-012.
**Say:** "Cash arrived, but nobody has applied it. Until it is applied, the invoice looks overdue, and an analyst might chase a customer who has already paid. That is the most damaging AR error."

### 3 · Evidence — ~1 min
**Show:** the bank line for P-012 (₹25,000.00) and the unapplied-cash total.
**Say:** "The evidence comes first. Every claim the agent makes has to trace back to a record on this page."

### 4 · AI recommendation (Recommend Agent) — ~1 min
**Show:** stage 1, "Recommend Agent": the proposed invoice INV-F, "Confidence: high", and the cited sources.
**Say:** "The Recommend agent only proposes. It can't move money. Its output is a set of verified facts, each tied to a ledger record."

### 5 · Policy shows the allowed actions (Policy Agent) — ~1 min
**Show:** "Policy verdict: Auto-permitted" and the policy decision card with its Decision ID and Policy version.
**Say:** "Policy is a deterministic, versioned rule table, not the model. It writes a persisted decision that anyone can audit later. One exact candidate at ₹5,00,000 or less is auto-permitted under the Manager's standing policy. Anything ambiguous or larger needs a human."

### 6 · Execute + simulated apply — ~30 s
**Show:** "Executed by Execute agent · … · policy v1", status Resolved, and the audit line "Allocated payment P-012 (₹25,000.00) to INV-F". The submit button is disabled with the reason "Already resolved".
**Say:** "The Execute agent reads only the policy verdict, never the recommendation. It writes through the same single, audited write path the humans use. Applying the payment is simulated."

### 7 · NSM updates on Overview — ~30 s
**Click:** Home. **Show:** the NSM has risen by exactly ₹25,000.00.
**Say:** "This number isn't seeded. It is the sum of what this session actually resolved, through an approved action."

### 7b · Ambiguous payment → a human must approve (RV-PAY-P-013) — ~1.5 min
**Click:** Exceptions → *Review* on RV-PAY-P-013.
**Show:**
- P-013 is ₹48,000.00. The recommendation shows "Confidence: low" and cites both INV-1019 and INV-1020.
- The policy verdict reads "Needs manager review", and Execute shows "Pending manager hand-off."
- As the Analyst, pick a candidate. Submit stays disabled, with the reason "Manager approval required".
- Switch the role to Manager, pick INV-019 and submit. The status changes to Resolved.

**Then:** go to Home. The NSM has now risen by ₹73,000.00 in total.
**Say:** "When the amount fits two invoices equally, the product doesn't guess. It shows every candidate and escalates. The Analyst is told why they can't act. The Manager's approval is a human action under a recorded role, so it counts in the metric just like the auto-permitted one."

### 8 · Short-payment pattern flagged — **PENDING (TASK-79.5)**
*Not in the product yet.* When 79.5 merges, this step will show a customer with three or more short payments in 90 days, raised as one customer-level pattern exception with its history and total deducted value. Rewrite this step against the real screen then; until that happens, leave it out of the demo.

### 9 · The existing dispute blocks reminders — ~1.5 min
**Click:** Queue, then filter to disputed (`/queue?band=disputed`). Open a disputed invoice that is excluded from reminders, then click *Generate draft*.
**Show:**
- The pre-approval checks read "8 of 9 passed". The failing check is "No open dispute".
- "Submit for approval" is unavailable, with the reason "1 pre-approval check is failing". The next step is shown.

**Say:** "This is the v1 trust boundary, carried into v2 unchanged. The AI can draft, but a reminder on a disputed invoice can't be sent."

### 10 · Every step is in the Audit Log — ~1 min
**Click:** Audit Log, and set Rows per page to 50.
**Show:**
- the Recommend and Policy evaluations;
- two `allocate_payment` rows: P-012 as "Execute Agent allocated payment" by the System actor, and P-013 by "Manager";
- the draft generated for the disputed invoice, with "8 of 9 checks pass";
- no submitted draft.

**Say:** "Every step is here: who or what acted, under which role or policy decision. No action executed without an approval."

## Closing line (~30 s)
"AI recommends, deterministic policy decides what is allowed, and a permitted approval, human or standing policy, gates every money movement. All of it is audited, and the metric only counts what stays resolved."

## Not shown (and why)
- **Reversal (F16, Manager-only):** it exists, but it is left out of the 10-minute walk for time. If asked, a Manager can reverse an allocation; the reversal is audited and the NSM drops by the reversed amount.
- **Live LLM mode:** this is local-only and optional. Deploys are kept in simulated mode.
