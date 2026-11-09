# Verilane v2 — product case study

> **Ticket:** TKT-75.09 (TASK-79.9) · F17 · Discovery-PRD-TASK-75 §4.1
> **Status:** Draft. Checked against `task/75-exceptionos` @ `f561490` and the repo's own records: `docs/Discovery-PRD-TASK-75.md`, `docs/Solution-PRD-TASK-75.md`, `decisions.md` S38–S46 and the EXE entries.
> **Honesty boundary:** Verilane is a portfolio demo built on synthetic data. It has no customers, users, deployments, interviews or adoption figures, and this document claims none. Where something is an assumption, it is named as one (Discovery §10, AS8/AS9).
> **Pending:** the sections marked **PENDING (TASK-79.5)** cover the short-payment pattern and the v2 eval gates. They are not built on this base, and are rewritten when 79.5 merges.

## 1. Problem

v1 answered one question for an AR analyst: *should I chase this invoice at all?* In accounts receivable, though, chasing is only one of the reasons a receivable doesn't flow straight to cash. Two failures sit upstream of it:

1. **Cash arrives but can't be applied.** The remittance is missing or wrong, or the amount fits several invoices. Until it is applied, the invoice looks overdue, and the analyst may chase a customer who has already paid. v1 could only block that chase when the customer *said* they had paid.
2. **Customers pay short, repeatedly.** One deduction is a query. Three from the same customer in 90 days is a pattern, usually a pricing or credit-note problem. Nobody sees it, because each short payment is handled on its own.

So v2 makes the **Exception** the unit of work: anything that stops an invoice or payment from flowing straight to closed. A collections reminder becomes one possible resolution among several.

**Who judges success:** a Senior PM interviewer watching a ~10-minute live walk (Discovery §1, §8.2). That audience drove the choice of depth over breadth: two new scenarios built fully, rather than six built shallowly.

## 2. The trust boundary (the core product judgment)

Applying cash or writing off a deduction moves money. Drafting an email doesn't. The more consequential the action, the more the line between *AI recommends* and *something approves* matters. v2 draws that line in three places:

- **Recommend agent:** proposes, with verified facts that each trace to a ledger record. It cannot write.
- **Policy agent:** a deterministic, versioned rule table, not a model. It writes a persisted `PolicyDecision` with one of four verdicts: `auto_permitted`, `needs_analyst`, `needs_manager` or `blocked`.
- **Execute agent:** reads only the persisted verdict, never the recommendation. It acts on `auto_permitted` alone, through the same single audited write path the humans use (`src/domain/commands.ts`). Anything else is handed to the right role.

**In the product today** (verified by TC-75.46):
- P-012 (₹25,000) has exactly one candidate, so it is auto-permitted and the Execute agent allocates it. The audit row names "Execute Agent" and the policy version.
- P-013 (₹48,000) fits INV-019 and INV-020 equally (FS14). It gets low confidence and is escalated to `needs_manager`. The Analyst is shown "Manager approval required"; only the Manager can submit it.
- A disputed invoice still can't receive a reminder: one pre-approval check fails, and submit is unavailable with that reason.

## 3. Key decisions and trade-offs

| Decision | Options weighed | Chosen, and why | Cost accepted |
|---|---|---|---|
| Exception model (S38) | New parallel entity; subtypes; **widen `ReviewItem`** | Widen `ReviewItem` into `Exception`: one queue, one state machine, one write path | Renaming touched every consumer. The compiler and the existing tests caught them |
| Unapplied cash (S39) | Placeholder invoice; **nullable `Payment.invoice_id`** | Nullable FK. A placeholder invoice would fabricate a fact | Every payment aggregate had to handle `null` explicitly, or it would silently drop cash |
| Agent architecture (S40) | One pipeline (*recommended*); two agents; **three agents** | Three agents, Recommend / Policy / Execute: **the user's explicit, twice-confirmed choice, which overrode the recommendation** | The most code, state and eval surface of the three. It was accepted for the architectural story, and the money still only moves through `commands.ts` |
| Policy engine (S41) | Weighted score; inline checks; **gated rule table** | Gated rule table writing a versioned `PolicyDecision`. "Why was this allowed?" has a legible, auditable answer | New surface, held to exhaustive unit tests |
| Approval semantics (Amendment A1, EXE129) | Human-only approval; **human or versioned `auto_permitted` decision** | "Approval" means a permitted human *or* a standing, versioned policy decision. "Actions executed without approval = 0" still holds | An auto-permitted action is only as safe as the rule table, which is why the table is versioned and audited |
| NSM (S42) | Rolling average; raw total; **one session = one analyst-week** | Computed live from this session's audit log and labelled "Simulated — one demo session = one analyst-week". Nothing is seeded | It is a small-sample, demo-scale figure, reported but not oversold |
| Routes (S44, F18) | Merge `/queue` into `/exceptions`; **additive routes only** | v1 routes are unchanged; `/exceptions` and `/exceptions/[id]` are new. The live site has shared links | Two lists, Queue and Exceptions, coexist. TC-75.50 checks that no v1 route, redirect or testid was lost |
| Seed data (S43) | Second dataset; **extend `scripts/seed.ts`** | One fixed-PRNG generator with a coverage test that fails the build if a scenario is missing | — |

## 4. The North Star Metric

**Correctly resolved exception value (₹) per analyst-week.** *Correctly* means the exception was closed by an approved action and has not been reversed or reopened since. That makes the metric reward value and correctness, not count or speed.

- The figure is shown on Home with its Simulated label. In the walk it rises by exactly ₹25,000.00 after the auto-permitted P-012, and by a further ₹48,000.00 after the Manager approves P-013 (TC-75.46).
- Guardrails are computed alongside it in `src/domain/nsm.ts`: actions without approval, the reversal/reopen rate, median time to resolution and the escalation rate. On this base, Home shows only the headline figure, not the guardrails.

## 5. What was kept, changed and cut from v1

**Kept:**
- every v1 route, and the v1 trust walk;
- the dispute block on reminders;
- the single audited write path (S14);
- the deterministic simulated AI as the default and the eval gate;
- zero spend and synthetic data only.

**Changed:**
- `ReviewItem` became `Exception`, with two new kinds;
- `Payment.invoice_id` became nullable;
- Home gained the NSM block;
- multi-agent orchestration moved from out of scope to built;
- "approval" was widened by A1 to cover versioned standing policy.

One gap against the PRD: Discovery F1 renames Home to "Overview", but on this base the navigation label still reads **Home**.

**Cut** (Discovery §6):
- duplicate-payment detection;
- PO mismatch;
- missing remittance as a standalone exception type;
- the broader VerilaneV2.md document set;
- an "Agent Operations Center" view.

The reason was the same each time: the ~10-minute walk doesn't need them, and depth beat breadth.

## 6. Failure scenarios covered

On this base, the FS14–FS17 payment edge cases are seeded and unit-tested (TASK-79.8):

| Case | Seeded as | Behaviour |
|---|---|---|
| FS14, amount fits two invoices | P-013 | No pick; escalated to the Manager. Walked end to end in the e2e |
| FS15, overpayment | P-014 | Only the matched portion is proposed; the excess is held |
| FS16, mistyped reference | P-015 | No fuzzy match; the cited reference is shown verbatim |
| FS17, untraceable cash | P-016 | Stays unallocated, with the reason |

FS21 (an Analyst attempts a Manager-only action) is shown in the walk on P-013.

**PENDING (TASK-79.5):** FS18 and FS19, the short-payment pattern scenarios.

## 7. Short-payment pattern — **PENDING (TASK-79.5)**

This isn't built on this base. When 79.5 merges, this section will describe how three or more short payments from one customer in 90 days raise one customer-level pattern exception, with its history and total deducted value. It will be checked against the running product then. The "≥3 in 90 days" threshold stays an **unvalidated assumption** (AS9).

## 8. Evaluation — **PENDING (TASK-79.5)**

Discovery §8.3 sets these targets:
- 100% correct allocation recommendations on unambiguous payments;
- 100% of ambiguous payments escalated;
- 100% detection of the seeded short-payment patterns;
- 0 actions executed without approval;
- 0 policy-conflicting recommendations executed.

TC-75.51 (eval, all gates) is pending 79.5. No eval result is claimed here until it has been measured.

## 9. What I would validate next (not done)

These are assumptions, not findings:
- **AS8:** that unapplied cash causes wrongful chasing often enough to lead the demo;
- **AS9:** the pattern threshold;
- the Analyst/Manager split at ₹5,00,000.

Each would need AR practitioners or a real deployment to confirm, and Verilane has neither.
