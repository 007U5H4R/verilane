# TASK-75 — Verilane v2: AR Exception Resolution — Discovery PRD

> **Stage:** 1 · Product Discovery (Full tier) · **Ticket:** TASK-75 · **Date:** 2026-11-05
> **Status:** **Approved — 2026-11-05.** All 16 discovery questions were answered on 2026-11-05 (§11). The user approved the document as written, including the inferred rule that reversal is Manager-only (§2, still to be confirmed in Stage 2).
> **Source material:** `~/Downloads/VerilaneV2.md` (the "ExceptionOS / Agentic Financial Operations" prompt). The baseline is the approved root `Discovery-PRD.md` (TASK-1, v1).
> **Scope of this document:** *what* and *why* only. It names no architecture, no agent count, no schema and no screen layout. Those are decided in Stage 2 (`Solution-PRD-TASK-75.md`) and Stage 3 (a Design.md revision).

## 0. Why this file is not `Discovery-PRD.md`

The root `Discovery-PRD.md` is v1's approved product record, and other docs cite its section IDs. Following the precedent of `docs/Discovery-PRD-TASK-45.md` and `-TASK-46.md`, this v2 scope change gets a ticket-scoped file.

**v2 extends v1. It does not replace it (Q2).** Everything in v1 that is not explicitly amended here still applies:
- requirements F1–F11, NF1–NF7, A1–A6 and T1–T6;
- failure scenarios FS1–FS13;
- the AI targets in §8.2;
- the out-of-scope list in §9.

The new IDs below continue v1's numbering, starting at F12 and FS14, so existing references stay valid.

**VerilaneV2.md's own process (Phases 1–9 and Stages A–F) is not followed.** Its content is routed through the existing 11-stage chain instead. Its requested document set maps onto artifacts this repo already has. The only exceptions are two interview-facing documents (F17).

## 1. Problem statement

v1 answers one question: *"Should I chase this invoice at all?"* That is necessary, but in real AR it is only one of the reasons a receivable fails to flow straight through to cash. Two other reasons sit upstream of chasing:
- **Cash arrives but can't be applied.** The bank shows a credit, but the remittance is missing, cites the wrong invoice, or the amount fits several open invoices. Until someone resolves it, the invoice looks overdue. An analyst may then chase a customer who has already paid. This is the most damaging AR error, and v1 can only block it when the customer *says* they paid.
- **Customers pay short, repeatedly.** One deduction is a query. Three deductions from the same customer in 90 days is a pattern, typically an unrecorded pricing or credit-note issue. Nobody sees it, because each short payment is handled in isolation.

**The v2 problem:** finance teams lack one place to see every reason a receivable isn't clean. They also lack a way to get an evidence-backed recommendation for each one and resolve it safely, where:
- deterministic policy decides which actions are allowed;
- a human approves every action;
- nothing executes outside that approval.

The **Exception** is the unit of work. An Exception is any condition that stops an invoice or payment from flowing straight through to closed. A collections reminder becomes one possible resolution among several (Q6).

### Why it matters
- **Cash accuracy:** unapplied cash misstates overdue balances and directly causes wrongful chasing.
- **Leakage:** repeated short payments are silent revenue loss, and they are only visible as a pattern.
- **Trust in AI:** the more consequential the action (applying cash or writing off a deduction, rather than drafting an email), the more the AI-recommends / policy-gates / human-approves boundary matters. This is the core product-judgment story.

### Who the success audience is (Q1)
v2's success is judged by a **Senior PM interviewer** watching a live demo of about 10 minutes. The in-product personas stay fictional AR users (§2). That audience is why §9 favours depth over breadth: two new scenarios that are fully real, rather than six shallow ones.

## 2. Users

The personas are unchanged from v1 §3: **AR Analyst** (primary) and **Collections Manager** (secondary), with no real authentication and the demo role switcher. v2 adds the following permissions (Q12):

| Action | Analyst | Manager |
|---|:-:|:-:|
| Propose any resolution | ✓ | ✓ |
| Approve applying cash on an **exact, unambiguous** match ≤ ₹5,00,000 | ✓ | ✓ |
| Approve split or partial allocations | — | ✓ |
| Approve resolution of an ambiguous match | — | ✓ |
| Approve any allocation > ₹5,00,000 | — | ✓ |
| Approve **any** deduction write-off or acceptance of a short payment | — | ✓ |
| Reverse an applied allocation | — | ✓ |
| Let a model execute any action | — | — |

The Manager-only reversal row is inferred from the write-off rule: a reversal undoes a money movement. It is a Stage 2 confirmation item.

## 3. Jobs to be done (new in v2)

| Pain point | Job to be done |
|---|---|
| Cash lands with no usable remittance | *When unapplied cash arrives, I want the candidate invoices with the evidence for each, so I can apply it correctly, or know exactly why I can't.* |
| Wrongful chasing of customers who have paid | *When cash for an invoice is sitting unapplied, I want that invoice kept out of reminders until it is resolved.* |
| Short payments handled one at a time | *When a customer pays short again, I want to see that it's a pattern, with its history and total value, so I fix the root cause instead of the instance.* |
| No single view of what's wrong | *When I start my day, I want one overview of every open exception, its ₹ value and its age, and what's waiting on me.* |
| Consequential AI actions | *As a manager, I want any money-moving action (applying cash, writing off a deduction) to be impossible without my approval, and fully audited.* |

## 4. Requirements (what, not how)

### 4.1 Functional (new or amended)
- **F1 (amended) Overview.** The v1 Home at `/` is renamed **Overview** and stays first in the navigation. It is the single summary surface; no second dashboard is added (Q15). It summarises:
  1. the North Star Metric and its guardrails, labelled **Simulated** (§8.1);
  2. open exceptions by type and age, with the ₹ value at stake;
  3. unapplied cash, total and oldest item;
  4. customers with a short-payment pattern;
  5. pending approvals, split by Analyst and Manager;
  6. v1's AR basics: outstanding, overdue and ageing;
  7. AI eval health against targets.

  Every tile drills down to the filtered list behind it. All four screen states (loading, empty, error, working) are handled. The layout is a Stage 3 decision.
- **F12 Exceptions as the unit of work.** One list of every open exception, across types (unallocated payment, short payment, dispute, payment-claim conflict and v1's data issues). Each exception shows its type, ₹ value, age, owner role, status and recommended next step. Each opens an investigation view with evidence.
- **F13 Unallocated payment resolution.** For each unapplied cash item, the product shows:
  - the bank line, the remittance (if any) and the candidate invoices, with the evidence for each;
  - a recommended allocation, or an explicit *cannot recommend* with the reason;
  - the actions policy allows for the current role.

  On approval, the allocation is applied in simulation, and the invoice's balance and status update accordingly. While an invoice has related unapplied cash, it is excluded from reminders.
- **F14 Short-payment pattern detection.** Every short payment becomes an exception. When one customer has **≥3 short payments within 90 days**, the product raises a customer-level pattern exception. That exception shows the history, the total deducted value and any stated reasons (Q13f).
- **F15 Controlled action pipeline.** For every consequential action: the AI investigates and recommends, with evidence; deterministic policy determines which actions are allowed; a permitted human approves; execution is simulated; and every step is written to the audit log. Whether this takes one agent or several is a Stage 2 decision (Q8).
  - *Amendment A1 (approved by user, 2026-11-05, "A1 is also approved"; drafted 2026-11-05, TASK-79.1; see Design-TASK-75.md §25 item 5, decisions.md EXE129):* "approval" here, and in §8.1 / §8.3, is satisfied either by a permitted human or by a versioned `auto_permitted` `PolicyDecision` (standing policy approval). "Actions executed without approval = 0" then means no write without either; the metric is kept.
- **F16 Reversal.** An applied allocation can be reversed by a permitted human. The reversal is audited and counts against the North Star Metric (Q13g).
- **F17 Interview deliverables (Q9):**
  - `docs/demo/interview-demo-script.md`: the §8.2 walk, step by step, with talking points.
  - `docs/interview/product-case-study.md`: problem, decisions, trade-offs, and what was kept, changed or cut from v1, and why.

  Neither document may invent user interviews, adoption figures, customers or deployments.
- **F18 Route continuity (Q14).** Every v1 route keeps working or redirects, because the live site has shared links.

### 4.2 Unchanged constraints restated for emphasis (Q5)
- **Zero spend.** No paid APIs, services or hosting tiers.
- **Synthetic, fictional data only.** No American Express, employer, client, real customer or real financial data.
- **Deterministic simulated mode is the default and the eval gate.** Live Claude is optional, local only, and kept out of deploys by `check-deploy-env.ts`.
- **Every AI output is labelled Simulated or Live LLM.** No fake AI, no fake integrations, no fabricated outcomes.
- **Brand (Q14).** "Verilane" stays the brand, and "ExceptionOS" never appears in the UI. Navigation wording is a Stage 3 decision.

## 5. Failure scenarios (new; FS1–FS13 still apply)

| # | Scenario | Required behaviour |
|---|---|---|
| FS14 | The payment amount fits two or more invoices equally well | No pick. The item is escalated to the Manager with all candidates shown |
| FS15 | The payment exceeds the customer's total open balance | The matched portion may be proposed. The excess is held as unapplied and needs review |
| FS16 | The remittance cites an unknown or mistyped invoice number | No fuzzy match. The item is escalated, showing the cited reference verbatim |
| FS17 | The cash can't be traced to any customer | It stays unallocated, with the reason stated. No invoice is touched |
| FS18 | A short payment has no reason given | *Needs review*. No assumed deduction type |
| FS19 | A third short payment from a customer within 90 days | A customer-level pattern exception is raised, linked to all its instances |
| FS20 | An applied allocation is reversed | The balance is restored and the reversal audited. The original resolution no longer counts as "correctly resolved" |
| FS21 | An Analyst attempts a Manager-only money action | The action is unavailable, with the reason. Nothing executes, and the attempt is audited |
| FS22 | A model recommendation conflicts with deterministic policy | Policy wins. The conflict is shown and logged |

## 6. Out of scope

All of v1 §9's out-of-scope list carries over (Q16):
- real auth or multi-tenancy;
- real email, ERP, bank or payment integrations, and real cash application;
- real data;
- FX conversion;
- automatic sending or applying without a human;
- native mobile apps;
- credit-risk scoring.

**One change:** "multi-agent orchestration" moves from *excluded* to *open for Stage 2* (Q8).

**Explicitly out of v2 (Q7):**
- the duplicate-payment scenario;
- the PO-mismatch scenario;
- missing remittance as a separate scenario (largely covered by F13);
- VerilaneV2.md's broader document set (strategy, ERD, ADR set and so on), which maps onto the existing Solution-PRD, `decisions.md` and `docs/`;
- VerilaneV2.md's "Agent Operations Center" as a required surface (it may come back in Stage 2/3 only if it serves the §8.2 walk).

## 7. Sequencing (Q3, Q4)

- **Time box:** about **2 weeks** to a demo-ready v2. Scope is cut to fit the date, not the other way round. If a specific interview date exists, that date replaces the 2 weeks.
- **In-flight work:** Stage 1–2 documents proceed in parallel with TASK-45 (splash screen) and TASK-46 (heritage art). **No v2 code starts until both are Done or parked.** Which one it is gets decided at the Stage 2 gate, once v2's visual identity is known.

## 8. Success criteria

### 8.1 North Star Metric (user-requested; Q10)
**NSM: Correctly resolved exception value (₹) per analyst-week.**

*Correctly resolved* means an exception closed by an approved action that is **not later reopened or reversed**. The metric measures value and correctness together, rather than count or speed, so it doesn't reward fast but wrong closures.

| Guardrail counter-metric | Target |
|---|---:|
| Reversal / reopen rate | tracked; lower is better |
| Inappropriate-reminder rate (reminders on disputed, paid or unapplied-cash invoices) | 0 |
| Actions executed without a permitted approval | 0 |
| Median time from exception raised to resolved | tracked |
| Review-queue escalation rate (review-fatigue watch) | tracked |

**Honesty rule:** in the demo, the NSM and its guardrails are computed live from the actions actually taken in the session, and labelled **Simulated**. No outcome numbers are seeded or claimed.

### 8.2 Primary success measure: the ~10-minute interview walk (Q11)
One uninterrupted pass in the real app, with no dead controls:

**Overview → open an unallocated payment → evidence (bank line, remittance, candidate invoices) → AI recommendation → policy shows the allowed actions → permitted human approves → simulated apply → NSM updates on Overview → short-payment pattern flagged for a customer → the existing dispute shows reminders blocked → every step visible in the Audit Log.**

An interviewer unfamiliar with the product follows the problem, the trust boundary and the product judgment in about 10 minutes.

### 8.3 AI acceptance targets (simulated mode is the gate; live is reported alongside, not gated)

| Metric | Target |
|---|---:|
| All v1 §8.2 targets | unchanged |
| Correct allocation recommendation on unambiguous payments | 100% |
| Ambiguous payments escalated, never auto-picked | 100% |
| Detection of the seeded short-payment patterns | 100% |
| Actions executed without approval | 0 |
| Policy-conflicting recommendations executed | 0 |

These are reported with TP / FP / TN / FN as in v1. Results are measured, never assumed.

### 8.4 Delivery criteria
- The v1 trust walk (v1 §8.1) still passes. This is a no-regression requirement on the live product.
- The two F17 documents exist and match the running product.
- v1's responsive, accessibility, screen-state and link-preview gates (NF3–NF7) apply to every new or changed surface.

## 9. MVP scope summary

- **In:** F1 (amended), F12–F18, FS14–FS22, the NSM with guardrails, the §8.2 walk, the §8.3 targets.
- **Data:** v1's seeded dataset, extended with enough synthetic bank lines, remittances and short payments to exercise F13, F14 and FS14–FS22. Exact counts are a Stage 2 decision.
- **Scenarios:** unallocated payment and repeated short payments are new; the dispute walk is carried from v1.

## 10. Assumptions requiring validation

| # | Assumption | Why it matters | How it would be validated |
|---|---|---|---|
| AS8 | Unapplied cash is a common enough cause of wrongful chasing to lead the demo | It is the walk's opening scenario | Industry AR literature during Stage 2 research; not claimed as measured |
| AS9 | "≥3 in 90 days" is a sensible threshold for a short-payment pattern | It sets the pattern exception | Keep it configurable; confirm with AR practitioners in a real deployment |
| AS10 | One Overview can show seven summary groups without overload | The success of F1 | Stage 3 design validation; Stage 7 critique |
| AS11 | The NSM is computable honestly from a short demo session | The honesty rule in §8.1 | Stage 2 defines the computation; Stage 8 tests it |
| AS12 | Two weeks is enough for this scope | The time box in §7 | Stage 4 breakdown sizing. If it doesn't fit, cut scope, don't extend |
| AS13 | Interviewers value a deep trust boundary over feature breadth | Q1 and Q7 | Timed walkthrough with someone unfamiliar with the product |

## 11. Settled discovery decisions (grilling, 2026-11-05)

| Q | Decision |
|---|---|
| Q1 | The success audience is a Senior PM interviewer. The AR Analyst and Manager stay as fictional personas |
| Q2 | **Extend** v1. The collections trust walk becomes one exception type |
| Q3 | Discovery and solution design run in parallel with TASK-45/46. No code until both are Done or parked; that choice is made at the Stage 2 gate |
| Q4 | About a 2-week time box. Scope is cut to fit |
| Q5 | Zero spend, synthetic data only, simulated mode as the gate, live mode local-only: all unchanged |
| Q6 | The Exception is the core unit of work |
| Q7 | New scenarios: unallocated payment and repeated short payments. Dispute carried over. Duplicate payment, PO mismatch and missing remittance are out |
| Q8 | "Agentic" is a behavioural requirement (F15). The agent count is a Stage 2 decision |
| Q9 | Two interview documents only (F17). No duplicate PRD/ADR set |
| Q10 | NSM: correctly resolved exception value (₹) per analyst-week, with guardrails and the Simulated honesty rule |
| Q11 | The ~10-minute interview walk and the §8.3 targets |
| Q12 | The permission table in §2 |
| Q13 | FS14–FS20, including "≥3 short payments in 90 days" |
| Q14 | Verilane brand only. Navigation wording is decided in Stage 3. v1 routes are preserved |
| Q15 | Rename Home to **Overview** and make it the single summary dashboard at `/` |
| Q16 | v1's out-of-scope list carries over. Multi-agent orchestration is open for Stage 2 |

## 12. What this document deliberately does not contain

- No agent count or agent names.
- No entity or schema design (Remittance, Credit Note, Exception), no routes and no nav labels.
- No Overview layout and no NSM computation method.
- No priority or allocation algorithm.

These belong to Stage 2 (Solution Design) and Stage 3 (UI/UX Design).
