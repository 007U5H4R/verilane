# Verilane — AI Evaluation

> Stage 2 artifact. Targets: [`../Discovery-PRD.md`](../Discovery-PRD.md) §8.2. Gate policy S5; harness decision S13.

## 1. What is evaluated, and what is not

The eval measures the **guardrailed pipeline**: provider → schema validation → strict matching → classification → evidence → drafting → nine checks → approval enforcement. Demo-mode results show that the deterministic system and its guardrails meet the targets. They do **not** show LLM extraction quality (AS6), which is why live mode is reported separately.

## 2. Datasets

| Set | Size | Purpose | Authoring |
|---|---|---|---|
| `eval/seed.labels.json` | 25 threads / 50 invoices (the shipped seed) | regression on the demo data | labels written by hand **from the scenario spec**, not from extractor output |
| `eval/heldout/` | 30 extra fictional threads plus their invoices | catch overfitting of the rule-based extractor to the seed wording | written **before** extractor rules are tuned and frozen; extractor authors don't edit it to make tests pass |
| `eval/drafts.cases.json` | ≥ 20 draft cases, including adversarial edits (FS12) | unsupported-claim detection, approval enforcement | hand-authored |
| allocation labels (`eval/allocation.ts`, TKT-75.08) | 5 seed bank lines (P-012, FS14–FS17 = P-013…P-016) + 10 held-out inline ledgers | allocation-recommendation accuracy: an unapplied bank line is auto-picked only when exactly one invoice is safe | labels hand-written from the scenario (which invoice is right, or that none is); the held-out ledgers share no fixture with the seed |
| short-payment patterns (`eval/shortPaymentPattern.ts`, TKT-75.05) | 2 seed customers (C-001: INV-001…003 each ₹1,000 short within 54 days, FS18/FS19; C-002: INV-004/005 ₹500 short, no pattern) + 7 held-out inline ledgers (₹1,000 invoices closed at ₹900) | short-payment detection: an instance per paid-but-under-paid invoice, and a `short_payment_pattern` only for ≥ 3 short payments within an inclusive 90-day span | labels hand-written from the scenario; the held-out ledgers probe the window edges (2 in window, 3 over 120 days, exactly 90 days, 91 days, a 4th outlier outside the window, paid in full, a single short payment) and share no fixture with the seed |
| fault-injection | generated per run | malformed JSON, missing fields, out-of-enum class, hallucinated amount, wrong invoice ref, refusal | `ai/faulty.ts` mutates valid outputs deterministically |

**Label schema per thread:** expected customer_id or `null`, expected invoice_id or `null`, match outcome, email class, dispute type?, amounts[] in paise, invoice_refs[], commitment_date?, and `ambiguous: boolean`.

**Independence rule:** labels never come from Verilane's own output. If a label is found to be wrong, the change is reviewed and noted in the eval changelog (`eval/CHANGELOG.md`) with the reason. Labels are never edited quietly to turn a test green.

## 3. Metrics and gates (demo mode = gate, S5)

| Metric | Definition | Gate |
|---|---|---|
| Invoice amount exact-match | extracted amounts == labelled amounts (paise, set equality) / threads with a labelled amount | **100%** |
| Invoice number exact-match | extracted refs == labelled refs / threads with a labelled ref | **100%** |
| Unsupported financial claims | count of approvable drafts whose body contains a number, date, ref or name not covered by a verified claim | **0** |
| Unambiguous matching | correct `matched` outcome / threads labelled unambiguous | **100%** |
| Dispute recall | TP / (TP + FN) over threads labelled dispute or duplicate | **≥ 95%** |
| Approval enforcement | blocked approvals / approval attempts that *should* be blocked (failing check, wrong role, unresolved dispute, payment claim, > ₹5L as Analyst) | **100%** |
| Policy conflict executed (TKT-75.04, TC-75.25) | allocations the Execute agent wrote where the persisted PolicyDecision was not a fresh `auto_permitted` — every seeded exception × every forced verdict (and none), plus a stale-decision and a reversed-allocation trap; `eval/policy-conflict.eval.ts`, with a positive control that a fresh `auto_permitted` executes once | **0** |
| Allocation: unambiguous correct (TKT-75.08) | bank lines labelled unambiguous whose Recommend → Policy outcome equals the label (auto-picked the labelled invoice, or a unique match over ₹5L named but sent to the Manager) / unambiguous lines | **100%** |
| Allocation: ambiguous escalated (TKT-75.08) | ambiguous bank lines (tie, overpayment, mistyped or unknown reference, untraceable) that are **not** `auto_permitted` and get the labelled verdict / ambiguous lines | **100%** |
| Short-payment pattern recall (TKT-75.05, TC-75.31) | customers labelled as a pattern that get a `short_payment_pattern` row whose `linked_review_ids` equal the labelled instances / labelled patterns | **100%** |
| Short-payment pattern precision (TKT-75.05, TC-75.31) | customers with a `short_payment_pattern` row that are labelled as a pattern / customers with a pattern row (any false positive fails) | **100%** |
| Short-payment instance recall (TKT-75.05, TC-75.31) | cases whose set of `short_payment` instance invoice_ids equals the labelled set / cases | **100%** |

The two allocation gates run in `eval/allocation.eval.ts` (TC-75.40), part of `pnpm eval`, and print TP/FP/TN/FN to the console, with positive = Policy `auto_permitted`. An auto-pick of the wrong invoice counts as FP. Measured on 2026-11-07: seed 1/1 and 4/4, TP 1 · FP 0 · TN 4 · FN 0; held-out 4/4 and 6/6, TP 3 · FP 0 · TN 7 · FN 0. Against the pre-TASK-79.8 Recommend, the gate is red: FS16 and the held-out mistyped reference are auto-picked (FP 1 per set), and FS15 and the held-out overpayment are `blocked` rather than proposed. They are kept out of `report.json`, so the v1 report schema is unchanged (EXE163).

The three short-payment gates run in `eval/short-payment-pattern.eval.ts` (TC-75.31), part of `pnpm eval`, and print TP/FP/TN/FN to the console, with positive = a `short_payment_pattern` row for the customer. Self-checks mislabel a case in each direction and assert the gate goes red, so a gate that always passes is caught. Measured on 2026-11-09: seed pattern recall 1/1, precision 1/1, instance recall 2/2, TP 1 · FP 0 · TN 1 · FN 0; held-out recall 2/2, precision 2/2, instance recall 7/7, TP 2 · FP 0 · TN 5 · FN 0. The eval measures detection only: the write-off itself is never auto-executed (Manager-only `approve_write_off`, TC-75.29) and is not scored here. Like the allocation gates, these are kept out of `report.json`.

Also reported, not gated: TP/FP/TN/FN, precision, recall and F1 per email class and per dispute type; ambiguous-case escalation rate (should be 100%: an ambiguous email must never auto-match); fault-injection rejection rate (must be 100%, reported as a guardrail test); exact-match accuracy per extracted field; unsupported-claim rate.

## 4. Harness

- **Runner:** Vitest project `eval` (`pnpm eval`). It is pure Node, runs the domain engine and providers directly with no browser, no network in demo mode, and the frozen `AS_OF_DATE`.
- **Output:** a console table, `eval/report.json` (machine-readable) and `eval/report.md` (human-readable, linked from the app's Settings → "Evaluation results" page, which is static and rebuilt at build time).
- **Exit code:** non-zero if any gate misses (SR10). It runs in the Stage 8 test pass and pre-deploy.
- **Determinism:** two runs produce byte-identical `report.json` and `report.md`; the run's timestamp and duration are printed to the console only (Solution-PRD success criterion 4).
- **Live mode (optional):** `pnpm eval:live` runs only if `ANTHROPIC_API_KEY` is set. It shows the cost estimate (thread count × model) and asks for an explicit `--yes` before calling the API. Results go to `eval/report.live.json`, labelled "Live LLM — reported, not gated". The deployed demo never runs it.

## 5. Regression policy

Every critical failure found in any stage becomes a named test case (`TC-###`) in `eval/` or the domain unit tests before it is closed. This includes FS1–FS13 and every guardrail escape. The held-out set grows; it never shrinks.

## 6. Honest limits

- A rule-based extractor scoring 100% on hand-written fictional emails says little about real inboxes. The held-out set reduces overfitting but does not remove it.
- Dispute recall ≥ 95% on 30–55 threads is a small-sample figure. The report prints the raw counts so readers can judge.
- Live-LLM numbers depend on model and prompt version, and both are recorded in the live report.
