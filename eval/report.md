# Evaluation report

Generated 2026-11-01T04:25:25.226Z · as-of 2026-10-30 · provider `simulated` · 1982 ms · network calls 0

**One or more gates missed — the run fails.**

## Gates

| Gate | Threshold | Seed (25 threads) | Held-out (30 threads) |
| --- | --- | --- | --- |
| Amount exact match | ≥ 100.0% | PASS 100.0% (17/17) | PASS 100.0% (16/16) |
| Invoice number exact match | ≥ 100.0% | PASS 100.0% (24/24) | PASS 100.0% (25/25) |
| Unsupported financial claims | = 0 | PASS 0 (0 of 28 drafts) | PASS 0 (0 of 30 drafts) |
| Unambiguous matching | ≥ 100.0% | PASS 100.0% (23/23) | FAIL 91.3% (21/23) |
| Dispute recall | ≥ 95.0% | PASS 100.0% (10/10) | FAIL 22.2% (2/9) |
| Approval enforcement | ≥ 100.0% | PASS 100.0% (40/40) | FAIL 70.4% (38/54) |

### Misses

- Unambiguous matching (heldout): H-011, H-012
- Dispute recall (heldout): H-005, H-007, H-008, H-009, H-010, H-011, H-012
- Approval enforcement (heldout): HO-2012/analyst/approve, HO-2012/manager/approve, HO-2021/analyst/approve, HO-2021/manager/approve, HO-2023/analyst/approve, HO-2023/manager/approve, HO-2031/analyst/approve, HO-2031/manager/approve, HO-2032/analyst/approve, HO-2032/manager/approve, HO-2042/analyst/approve, HO-2042/manager/approve, HO-2051/manager/approve, HO-2052/manager/approve, HO-2061/manager/approve, HO-2062/manager/approve

## Reported, not gated

| Metric | Seed | Held-out |
| --- | --- | --- |
| Ambiguous threads escalated | 100.0% (2/2) | 100.0% (7/7) |
| Allowed approvals blocked (false blocks) | 0.0% (0/8) | 0.0% (0/10) |
| Email class exact match | 100.0% (25/25) | 40.0% (12/30) |
| Dispute type exact match | 100.0% (25/25) | 76.7% (23/30) |
| Commitment date exact match | 100.0% (25/25) | 76.7% (23/30) |
| Customer exact match | 100.0% (25/25) | 100.0% (30/30) |

## Per email class

| Class | Set | TP | FP | FN | TN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| commitment | seed | 6 | 0 | 0 | 19 | 100.0% | 100.0% | 100.0% |
| commitment | heldout | 4 | 0 | 4 | 22 | 100.0% | 50.0% | 66.7% |
| confirmation | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| confirmation | heldout | 2 | 1 | 3 | 24 | 66.7% | 40.0% | 50.0% |
| dispute | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| dispute | heldout | 1 | 0 | 5 | 24 | 100.0% | 16.7% | 28.6% |
| duplicate | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| duplicate | heldout | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| delay | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| delay | heldout | 0 | 0 | 3 | 27 | 0.0% | 0.0% | 0.0% |
| enquiry | seed | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| enquiry | heldout | 2 | 2 | 1 | 25 | 50.0% | 66.7% | 57.1% |
| unknown | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| unknown | heldout | 2 | 15 | 0 | 13 | 11.8% | 100.0% | 21.1% |

## Per dispute type

| Class | Set | TP | FP | FN | TN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| incorrect_amount | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| incorrect_amount | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| incorrect_billing_period | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| incorrect_billing_period | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| missing_po | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| missing_po | heldout | 1 | 0 | 0 | 29 | 100.0% | 100.0% | 100.0% |
| not_received | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| not_received | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| duplicate_invoice | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| duplicate_invoice | heldout | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| payment_already_completed | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| payment_already_completed | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| unknown | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |

## Fault injection (TASK-22)

Each seed email, corrupted one way at a time, must be rejected, sent to review and leave no approvable reminder. Rejection rate 100.0%; approvable drafts 0.

| Fault | Rejected | Needs review | Audited | Approvals tried | Approvable |
| --- | --- | --- | --- | --- | --- |
| malformed_json | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |
| missing_fields | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |
| bad_enum | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |
| hallucinated_amount | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |
| wrong_ref | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |
| refusal | 100.0% (25/25) | 25/25 | 25/25 | 218 | 0 |

## Method

- Simulated provider, frozen clock, `fetch` stubbed to throw: the run is offline and deterministic.
- Amount and invoice-number match use set equality in paise over threads whose label states one.
- Approval enforcement drives `approve_draft` through the real command code. A blocked approval is retried with a forged `validated` row, so the block must come from re-validation and the role check.
- Fault injection wraps the simulated provider; each corrupted output goes through the same validator and cross-check as a live one.
- Live-provider quality (`eval/report.live.json`) is reported separately.
