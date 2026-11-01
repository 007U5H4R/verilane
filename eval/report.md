# Evaluation report

Generated 2026-11-01T04:31:11.130Z · as-of 2026-10-30 · provider `simulated` · 203 ms · network calls 0

**One or more gates missed — the run fails.**

## Gates

| Gate | Threshold | Seed (25 threads) | Held-out (30 threads; inspected 2026-11-01, no longer blind) | Held-out v2 (30 threads) |
| --- | --- | --- | --- | --- |
| Amount exact match | ≥ 100.0% | PASS 100.0% (17/17) | PASS 100.0% (16/16) | FAIL 88.9% (16/18) |
| Invoice number exact match | ≥ 100.0% | PASS 100.0% (24/24) | PASS 100.0% (25/25) | FAIL 96.2% (25/26) |
| Unsupported financial claims | = 0 | PASS 0 (0 of 28 drafts) | PASS 0 (0 of 30 drafts) | PASS 0 (0 of 30 drafts) |
| Unambiguous matching | ≥ 100.0% | PASS 100.0% (23/23) | FAIL 91.3% (21/23) | FAIL 87.0% (20/23) |
| Dispute recall | ≥ 95.0% | PASS 100.0% (10/10) | FAIL 44.4% (4/9) | FAIL 44.4% (4/9) |
| Approval enforcement | ≥ 100.0% | PASS 100.0% (40/40) | FAIL 87.1% (54/62) | FAIL 72.4% (42/58) |

### Misses

- Unambiguous matching (heldout): H-011, H-012
- Dispute recall (heldout): H-007, H-008, H-009, H-011, H-012
- Approval enforcement (heldout): HO-2031/analyst/approve, HO-2031/manager/approve, HO-2032/analyst/approve, HO-2032/manager/approve, HO-2051/manager/approve, HO-2052/manager/approve, HO-2061/manager/approve, HO-2062/manager/approve
- Amount exact match (heldout-v2): H2-003, H2-012
- Invoice number exact match (heldout-v2): H2-010
- Unambiguous matching (heldout-v2): H2-010, H2-021, H2-022
- Dispute recall (heldout-v2): H2-016, H2-017, H2-019, H2-021, H2-022
- Approval enforcement (heldout-v2): H2-3102/analyst/approve, H2-3102/manager/approve, H2-3103/analyst/approve, H2-3103/manager/approve, H2-3301/analyst/approve, H2-3301/manager/approve, H2-3302/analyst/approve, H2-3302/manager/approve, H2-3501/manager/approve, H2-3502/analyst/approve, H2-3502/manager/approve, H2-3503/manager/approve, H2-3801/analyst/approve, H2-3801/manager/approve, H2-3803/manager/approve, H2-3804/manager/approve

## Reported, not gated

| Metric | Seed | Held-out (no longer blind) | Held-out v2 |
| --- | --- | --- | --- |
| Ambiguous threads escalated | 100.0% (2/2) | 100.0% (7/7) | 100.0% (7/7) |
| Allowed approvals blocked (false blocks) | 0.0% (0/8) | 0.0% (0/10) | 0.0% (0/8) |
| Email class exact match | 100.0% (25/25) | 53.3% (16/30) | 50.0% (15/30) |
| Dispute type exact match | 100.0% (25/25) | 80.0% (24/30) | 76.7% (23/30) |
| Commitment date exact match | 100.0% (25/25) | 83.3% (25/30) | 70.0% (21/30) |
| Customer exact match | 100.0% (25/25) | 100.0% (30/30) | 100.0% (30/30) |

## Per email class

| Class | Set | TP | FP | FN | TN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| commitment | seed | 6 | 0 | 0 | 19 | 100.0% | 100.0% | 100.0% |
| commitment | heldout | 4 | 0 | 4 | 22 | 100.0% | 50.0% | 66.7% |
| commitment | heldout-v2 | 3 | 0 | 5 | 22 | 100.0% | 37.5% | 54.5% |
| confirmation | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| confirmation | heldout | 4 | 1 | 1 | 24 | 80.0% | 80.0% | 80.0% |
| confirmation | heldout-v2 | 3 | 0 | 2 | 25 | 100.0% | 60.0% | 75.0% |
| dispute | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| dispute | heldout | 3 | 0 | 3 | 24 | 100.0% | 50.0% | 66.7% |
| dispute | heldout-v2 | 3 | 1 | 3 | 23 | 75.0% | 50.0% | 60.0% |
| duplicate | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| duplicate | heldout | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| duplicate | heldout-v2 | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| delay | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| delay | heldout | 0 | 0 | 3 | 27 | 0.0% | 0.0% | 0.0% |
| delay | heldout-v2 | 0 | 1 | 3 | 26 | 0.0% | 0.0% | 0.0% |
| enquiry | seed | 2 | 0 | 0 | 23 | 100.0% | 100.0% | 100.0% |
| enquiry | heldout | 2 | 1 | 1 | 26 | 66.7% | 66.7% | 66.7% |
| enquiry | heldout-v2 | 3 | 0 | 0 | 27 | 100.0% | 100.0% | 100.0% |
| unknown | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| unknown | heldout | 2 | 12 | 0 | 16 | 14.3% | 100.0% | 25.0% |
| unknown | heldout-v2 | 2 | 13 | 0 | 15 | 13.3% | 100.0% | 23.5% |

## Per dispute type

| Class | Set | TP | FP | FN | TN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| incorrect_amount | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| incorrect_amount | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| incorrect_amount | heldout-v2 | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| incorrect_billing_period | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| incorrect_billing_period | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| incorrect_billing_period | heldout-v2 | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| missing_po | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| missing_po | heldout | 1 | 0 | 0 | 29 | 100.0% | 100.0% | 100.0% |
| missing_po | heldout-v2 | 1 | 0 | 0 | 29 | 100.0% | 100.0% | 100.0% |
| not_received | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| not_received | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| not_received | heldout-v2 | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| duplicate_invoice | seed | 5 | 0 | 0 | 20 | 100.0% | 100.0% | 100.0% |
| duplicate_invoice | heldout | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| duplicate_invoice | heldout-v2 | 1 | 0 | 2 | 27 | 100.0% | 33.3% | 50.0% |
| payment_already_completed | seed | 1 | 0 | 0 | 24 | 100.0% | 100.0% | 100.0% |
| payment_already_completed | heldout | 0 | 0 | 1 | 29 | 0.0% | 0.0% | 0.0% |
| payment_already_completed | heldout-v2 | 1 | 0 | 0 | 29 | 100.0% | 100.0% | 100.0% |
| unknown | heldout | 1 | 1 | 0 | 28 | 50.0% | 100.0% | 66.7% |
| unknown | heldout-v2 | 0 | 2 | 1 | 27 | 0.0% | 0.0% | 0.0% |

## Method

- Simulated provider, frozen clock, `fetch` stubbed to throw: the run is offline and deterministic.
- Amount and invoice-number match use set equality in paise over threads whose label states one.
- Approval enforcement drives `approve_draft` through the real command code. A blocked approval is retried with a forged `validated` row, so the block must come from re-validation and the role check.
- Fault-injection rate (TASK-22) and live-provider quality (`eval/report.live.json`) are reported separately.
