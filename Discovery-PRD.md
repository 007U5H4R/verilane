# Verilane — Discovery PRD

> **Stage:** 1 · Product Discovery (Full tier) · **Ticket:** TASK-1 · **Date:** 2026-10-30
> **Status:** Approved — 2026-10-30
> **Source brief:** `verilane.md` (product, brand, UI/UX & build brief) + approved logo `Verilane Green Ribbon Logo.png`
> **Scope of this document:** *what* and *why* only. Architecture, data model, AI evaluation method and design system are deliberately deferred to Stage 2 (`Solution-PRD.md`, `docs/Architecture.md`, `docs/Data-Model.md`, `docs/AI-Evaluation.md`) and Stage 3 (`Design.md` / `docs/Design-System.md`). This file is the canonical home of the brief's requested `docs/Discovery-PRD.md`.

---

## 1. Problem statement

Accounts receivable (AR) analysts spend most of their collection effort not on *chasing* payment but on *working out whether they should chase at all*. For each overdue invoice they must reconcile the ledger with a scattered inbox: has the customer promised a date, claimed they already paid, disputed the amount, or said they were billed twice? Getting that wrong is costly in both directions — a reminder sent on a disputed or already-paid invoice damages the customer relationship and creates rework; a missed follow-up on a genuinely overdue invoice delays cash.

Generic AI writing tools make the problem *worse*: they produce fluent reminders that can contain invented invoice numbers, wrong amounts, or a tone-deaf demand on a disputed bill — and nothing tells the analyst which sentence is grounded and which is not.

**The problem Verilane addresses:** finance teams lack a way to act on outstanding invoices where every recommended action is grounded in verifiable evidence, uncertain situations are surfaced instead of guessed, and no customer-facing message leaves without an accountable human decision.

### Why it matters
- **Cash & relationship risk:** inappropriate reminders (on disputes, duplicates, already-paid claims) are the most visible, most damaging AR error.
- **Trust is the adoption blocker for AI in finance:** a finance manager will not let an AI near customer communication unless every financial claim is traceable and every send is approved and audited.
- **Auditability:** collection actions must be explainable after the fact to a manager or auditor.

## 2. Hypotheses

**First-impression hypothesis (what it looks like):** "An AI that writes payment reminder emails faster."

**Final product hypothesis (what it actually is):** The value is not drafting speed — reminder text is a commodity. The value is **evidence-constrained decision support**: a deterministic view of *who to chase and why*, an interpretation of customer email that *blocks* inappropriate chasing, and drafts in which every financial fact is linked to its source and validated before a human can approve it. If analysts trust the evidence, they will act on more invoices with fewer errors; if they don't, no amount of drafting speed matters.

## 3. Users

| | **Primary — AR Analyst** | **Secondary — Collections Manager** |
|---|---|---|
| Goal | Work the overdue book accurately and quickly | Keep collections healthy, risk controlled, team unblocked |
| Daily work | Review outstanding invoices, read customer replies, resolve discrepancies, follow up | Monitor performance and escalations, resolve disputes, approve exceptions |
| Fears | Sending a wrong or inappropriate reminder; missing a promise-to-pay | An unaccountable action reaching a customer; invisible risk |
| Permissions (settled, Q4) | Investigate; generate/edit/submit drafts; approve **standard** reminders; flag or *propose* dispute resolution | Everything the analyst can do; **resolve/reject disputes** (the only path back into the reminder queue); approve **escalated** items — ambiguous matches, conflicting payment information, reminders above **₹5,00,000**; view team workload |

Personas are switchable in the demo via a role switcher (no real authentication — see §9).

## 4. Current-state workflow (without Verilane)

1. Export the ageing report from the ledger; sort by days overdue or amount (ad hoc, inconsistent).
2. For each invoice, search the shared inbox by customer name or invoice number.
3. Mentally reconcile: promise to pay? claimed payment? dispute? duplicate?
4. Copy-paste a template reminder; hand-type invoice number, amount, due date.
5. Send from personal mailbox; maybe note it in a spreadsheet.
6. Disputes live in email threads and memory; the manager learns of them late.

## 5. Pain points → jobs to be done

| Pain point | Job to be done |
|---|---|
| Prioritisation is ad hoc and unexplainable | *When I start my day, I want a ranked queue with a stated reason per invoice, so I work the right invoices first and can justify it.* |
| Customer context is buried in the inbox | *When I open an invoice, I want every related customer message and what it claims, so I don't chase something already in motion.* |
| Disputes and payment claims are missed | *When a customer disputes or claims payment, I want the invoice pulled out of normal chasing automatically, so I never send an inappropriate reminder.* |
| Hand-typed reminders contain errors | *When I draft a reminder, I want every figure taken from verified data and linked to its source, so I can send it without re-checking.* |
| Ambiguous emails get silently mis-filed | *When the system is unsure which invoice an email refers to, I want it to tell me and ask, not guess.* |
| No accountable trail | *As a manager, I want to see who recommended, edited, approved, and sent what, and on what evidence.* |

## 6. Requirements (what, not how)

### 6.1 Functional
- **F1 Overview:** outstanding / overdue totals, overdue count, high-priority, disputed, pending approvals, ageing distribution, status and priority distribution, weekly activity — all derived from the dataset, filterable by date, status, customer; primary path into the queue.
- **F2 Collection Queue (central screen):** searchable, sortable, filterable, paginated invoice list with customer, invoice no., invoice/due date, outstanding amount, days overdue, priority, status, recommended action; navigation to invoice detail.
- **F3 Explainable priority:** each invoice gets a priority from explicit, documented rules with a human-readable reason linked to source data. Disputed invoices never appear in the normal reminder path; insufficient-data invoices are marked *needs review* / *unknown*.
- **F4 Invoice investigation:** full invoice facts, customer, payment history, related emails, observations, dispute status, recommended next action; an evidence panel where every fact shows source document, row/email ID, original field/text, validation status, and opens the source record.
- **F5 Email intelligence:** for each synthetic email thread, extract customer, invoice reference, commitment, payment-confirmation claim, dispute / duplicate claims, delay, requested action, dates, missing info; classify into the seven classes (payment commitment, payment confirmation, invoice dispute, duplicate invoice claim, payment delay, general enquiry, unknown). Association to an invoice only when identity and reference match; ambiguous matches escalate.
- **F6 Disputes:** dedicated inbox covering the seven dispute types and five statuses; disputed invoices excluded from reminders until a Manager resolves.
- **F7 Reminder drafting:** generate / regenerate / edit / approve / reject; drafts contain only verified facts; the nine pre-approval checks in the brief must all pass or approval is blocked with an explanation; send is **simulated** only.
- **F8 Review & Approvals:** one human-review inbox for drafts, uncertain matches, disputes, missing financial info, reconciliation issues — each with recommendation, evidence, validation status, escalation reason and actions, honouring persona permissions.
- **F9 Audit log:** chronological, manager-readable history of imports, changes, email processing, recommendations, source references, validation failures, edits, approvals, rejections, simulated sends.
- **F10 Data operations:** CSV import and export, Reset Demo Data, visible **DEMO DATA** indicator everywhere.
- **F11 Theme:** light and dark themes in the emerald brand system.

### 6.2 Non-functional
- **NF1 Runs locally** with one command, no API key required.
- **NF2 Reproducible:** same seed data → same priorities, classifications (in demo mode), and eval results on every run.
- **NF3 Responsive:** usable at 1440 / 1280 / 768 / 390 px; no horizontal page scroll; evidence and approval controls readable on mobile.
- **NF4 Accessible:** keyboard operable; status never conveyed by colour alone; WCAG AA contrast in both themes.
- **NF5 Screen states:** every data-backed view has loading, empty, error and working states.
- **NF6 No dead controls:** every visible control does something real.
- **NF7 Public demo surface (settled, Q3):** deployable as a public Vercel demo with Open Graph / Twitter link previews; no secrets in the client.

### 6.3 AI-specific
- **A1** Financial calculations, matching constraints, priority, state transitions, permissions and send restrictions are never delegated to a model.
- **A2** Model-produced content (interpretation, classification, summaries, drafts, explanations) is schema-validated before use; invalid output is rejected, not repaired silently.
- **A3** Every generated claim carries provenance (claim, source type, record, row/email ID, field, validation status).
- **A4** The product works fully in a **deterministic demo mode**; an optional **live Claude mode** is switchable by environment configuration (settled, Q5). Every AI output is visibly labelled **Simulated** or **Live LLM**.
- **A5** Missing / conflicting / ambiguous inputs produce an explicit *unknown* or *needs review* outcome with the reason and suggested next action — never a best guess.
- **A6** No "confidence score as proof." Trust is shown through validation outcomes, source coverage and measured evaluation results.

### 6.4 Trust & safety
- **T1** Never invent invoice numbers, amounts, dates, customer names or payment states.
- **T2** No message is ever sent without an explicit, permitted human approval; no real email is ever sent.
- **T3** Disputes and payment-confirmation claims block reminders until resolved by an authorised human.
- **T4** Unsupported claims cannot silently enter an approved message.
- **T5** Synthetic, fictional data only; no real, anonymised or proprietary enterprise data or workflows.
- **T6** Every recommendation, validation, edit and decision is recorded in the audit trail.

## 7. Failure scenarios the product must handle

| # | Scenario | Required behaviour |
|---|---|---|
| FS1 | Invoice missing invoice number | Flag *needs review*; cannot be reminded |
| FS2 | Invoice missing due date | Days overdue *unknown*; priority *needs review*; draft blocked |
| FS3 | Similar invoice numbers (e.g. INV-1042 vs INV-1024) | No fuzzy auto-match; ambiguous email escalated |
| FS4 | Customer with multiple open invoices, email names none | Customer matched, invoice *unresolved*; escalate |
| FS5 | Conflicting payment info (ledger unpaid, email says paid) | Reminder blocked; reconciliation item for review |
| FS6 | Duplicate-invoice claim | Dispute (duplicate) opened; both invoices excluded from reminders |
| FS7 | Payment claimed, invoice still unpaid | Payment-confirmation claim blocks reminder; reconciliation review |
| FS8 | Partial payment | Outstanding = verified remaining balance only |
| FS9 | No related email | Priority from ledger facts only; draft states no prior communication |
| FS10 | Unknown invoice status | *Unknown* status; excluded from reminders; review item |
| FS11 | Model returns malformed / out-of-schema output | Rejected, logged as validation failure, item marked *needs review* |
| FS12 | Analyst edits a draft and introduces a new amount | Edited figure must re-validate against source or approval blocks |
| FS13 | Analyst attempts Manager-only action | Action unavailable with reason; attempt not executed |

## 8. Success metrics

### 8.1 Primary — the end-to-end trust walk (settled, Q6)
In the real running app, with no dead controls, one uninterrupted pass:
**Collection Queue → high-priority invoice → evidence clicked through to source row & email → draft generated → validation passes → approved → simulated send → disputed invoice shows draft blocked & escalated → every step visible in the Audit Log.**
A reviewer unfamiliar with the product follows the trust story in ≈5 minutes.

### 8.2 AI acceptance targets (measured in deterministic demo mode — the gate)

| Metric | Target |
|---|---:|
| Invoice amount exact-match accuracy | 100% |
| Invoice number exact-match accuracy | 100% |
| Unsupported financial claims in drafts | 0 |
| Correct matching on unambiguous cases | 100% |
| Dispute recall | ≥ 95% |
| Human approval enforcement | 100% |

Reported with TP / FP / TN / FN, precision, recall, exact-match accuracy, unsupported-claim rate. If a Claude key is present, the same suite runs in live mode and is **reported alongside, not gated** (Q5). Targets are targets — results are measured, never assumed.

### 8.3 Product-health metrics (would be tracked in a real deployment; illustrative in the demo)
- Share of overdue invoices actioned per analyst-day
- Inappropriate-reminder rate (reminders later found to be on disputed/paid invoices) — target 0
- Draft edit rate and validation-block rate
- Time from dispute received → resolved
- Share of emails needing human match review

## 9. MVP scope

### In scope
All of §6 F1–F11 over a reproducible synthetic dataset: **50 invoices, 10 customers, 25 email conversations**, including ≥5 each of duplicate, commitment, confirmation, dispute and missing-data scenarios and all ten brief edge cases; INR default; demo role switcher (Analyst / Manager); deterministic demo mode + optional live Claude mode; labelled AI evaluation suite; local run + public Vercel demo.

### Explicitly out of scope
- Real authentication, multi-tenant accounts, user management
- Real email sending or inbox connection (send is simulated)
- Real ERP / ledger / bank integrations; payment processing; cash application
- Any real, anonymised or proprietary data
- Multi-currency conversion (currency displayed; no FX)
- Vector databases, multi-agent orchestration, message queues
- Automated dunning schedules / sending without a human
- Native mobile apps
- Credit-risk scoring or customer credit-limit decisions

## 10. Assumptions requiring validation

| # | Assumption | Why it matters | How it would be validated |
|---|---|---|---|
| AS1 | Analysts trust evidence links more than fluent text | Core product bet | Usability sessions: task success + stated trust with vs. without evidence panel |
| AS2 | A rule-based priority with stated reasons is "good enough" vs. a learned model | Determinism and explainability over marginal accuracy | Compare analyst's own ranking with engine ranking on sample books |
| AS3 | Strict "no match unless identity + reference agree" doesn't create too many review items | Too much escalation = review fatigue | Measure review-item rate on realistic inbox samples |
| AS4 | ₹5,00,000 is a sensible manager-approval threshold | Permission design | Confirm with collections managers; keep configurable |
| AS5 | Seven email classes and seven dispute types cover the common cases | Classification coverage | Label a real-shaped (synthetic) inbox; measure *unknown* rate |
| AS6 | Deterministic demo-mode extraction is a fair stand-in for LLM behaviour for evaluating the *guardrails* | Eval validity | Run the same suite in live mode and compare (Q5) |
| AS7 | A portfolio reviewer can grasp the trust story in ~5 minutes | Primary success metric | Timed walkthrough with someone unfamiliar |

## 11. Settled discovery decisions (from grilling, 2026-10-30)
See `decisions.md` S1–S7. Summary: gated at Stages 1/2/3/9, straight-through 4–8 · Campfire project `verilane` · portfolio/demo, local + public Vercel with link previews, demo role switcher · Analyst/Manager permission split with ₹5,00,000 threshold · deterministic demo mode is the eval gate, live Claude optional · end-to-end trust walk is the primary success measure.

## 12. Deferred to later stages (not decided here)
Stack and architecture, persistence, data schema, priority weights, extraction approach, evaluation harness, design system & tokens, dark-mode logo treatment (the supplied wordmark is near-black on a transparent background and needs a faithful treatment for dark surfaces) → Stages 2 and 3.
