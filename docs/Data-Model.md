# Verilane — Data Model

> Stage 2 artifact. Requirements: [`../Discovery-PRD.md`](../Discovery-PRD.md). Architecture: [`Architecture.md`](Architecture.md). Storage decision S9, invariants S14.

## 1. Principles

- **One source of truth for types:** Zod schemas in `src/domain/schema.ts`; TS types are inferred from them.
- **Money is integer paise** (`bigint`-safe `number` ≤ 2^53; max demo value is far below this). The model never does floating-point arithmetic on money. Display uses `en-IN` grouping (`₹3,40,000.00`).
- **Dates are ISO `YYYY-MM-DD` strings** (business dates with no time zone); timestamps are ISO-8601 UTC.
- **Missing is explicit:** a missing field is `null` plus a `DataIssue`, never `0` or `""`.
- **Source-shaped vs derived:** seed or imported records are immutable *source* rows. Derived state (priority, match, extraction, validation) is recomputed from source and versioned. Human decisions are separate records.

## 2. Source entities (seeded from `public/seed/`, all fictional, T5)

### Customer (`customers.csv`, 10 rows)
| Field | Type | Notes |
|---|---|---|
| customer_id | string `C-###` | PK |
| name | string | fictional company |
| contact_emails | string[] (`;`-separated in CSV) | used for identity match (§6.2 Architecture) |
| payment_terms_days | int | |
| segment | string | display only |

### Invoice (`invoices.csv`, 50 rows)
| Field | Type | Notes |
|---|---|---|
| row_id | int | CSV row number, used in provenance |
| invoice_id | string | internal PK, always present |
| invoice_number | string \| null | FS1 when null; **unique when present** |
| customer_id | FK → Customer | |
| invoice_date | date | |
| due_date | date \| null | FS2 when null |
| amount_paise | int | gross |
| currency | `"INR"` \| string \| null | null → check 4 fails |
| status_raw | string | as supplied |
| status | `open` \| `partially_paid` \| `paid` \| `written_off` \| `unknown` | normalised; FS10 → `unknown` |
| billing_period | string \| null | for "incorrect billing period" disputes |
| po_number | string \| null | for "missing PO" disputes |

### Payment (`payments.csv`)
| Field | Type | Notes |
|---|---|---|
| payment_id | string | PK |
| invoice_id | FK \| null | null = unapplied cash (received, not yet allocated to an invoice; TASK-79.1). A blank CSV cell imports as null (EXE123, TKT-75.02); `allocate_payment` sets it to the chosen invoice (EXE125) |
| paid_on | date | |
| amount_paise | int | partial payments allowed (FS8) |

**Derived:** `outstanding_paise = amount_paise − Σ payments applied to this invoice`. This is computed and never stored as a source fact. If the CSV also supplies `outstanding_amount`, a mismatch becomes a `DataIssue` (conflict) and the invoice goes to `needs_review`. An unapplied payment (`invoice_id = null`) never reduces any invoice's outstanding; it is totalled separately as "unapplied cash" (`unappliedCashPaise()`, TC-003) so it is never silently dropped.

### EmailThread / EmailMessage (`emails.json`, 25 threads)
| Field | Type | Notes |
|---|---|---|
| thread_id | string `E-###` | |
| message_id | string | provenance target |
| from_address | string | identity match input |
| sent_at | timestamp | anchor for relative dates |
| subject, body | string | |

## 3. Derived entities (recomputed; each carries `computedWith` version)

| Entity | Key fields |
|---|---|
| **Extraction** | message_id, mode (`simulated`\|`live`), provider, model?, schemaVersion, email_class (7), signals[], invoice_refs[], amounts[], dates[], commitment_date?, payment_claim?, dispute_type? (7), missing_info[], status (`valid`\|`rejected`), rejection_reason? |
| **Match** | message_id, outcome (`matched`\|`ambiguous`\|`customer_only`\|`unresolved`), customer_id?, invoice_id?, candidates[], reason |
| **Priority** | invoice_id, config_version, band (`high`\|`medium`\|`low`\|`needs_review`\|`disputed`\|`hold_reconcile`\|`not_due`\|`on_hold_promised`\|`closed`), score?, factors[{name, points, evidenceId}], gate?, reason, recommended_action, days_overdue \| null |
| **Evidence** | evidence_id, claim_id, claim_text, source_type (`invoice`\|`customer`\|`payment`\|`email`), source_record_id, source_row_or_email_id, source_field, original_value, validation_status (`verified`\|`conflict`\|`missing`\|`unsupported`) (A3, brief §8) |
| **DataIssue** | issue_id, record ref, field, kind (`missing`\|`conflict`\|`unparseable`), message, suggested_action |

## 4. Workflow entities (human-driven; mutate only via `commands.ts`)

### Dispute
dispute_id, invoice_id?, customer_id, type (duplicate_invoice · incorrect_amount · incorrect_billing_period · missing_po · not_received · payment_already_completed · unknown), source_message_id, claim_text, ai_recommendation, assigned_reviewer, status.

State machine: `new → under_review → awaiting_customer ⇄ under_review → resolved | rejected`. Only **Manager** may enter `resolved` or `rejected` (S4). Only `resolved` or `rejected` releases the invoice back to the reminder path (G4).

### Draft
draft_id, invoice_id, version, mode, body, claims[claim_id], checks[9 × {id, passed, reason}], status, edited_by?, decided_by?, decided_at?.

State machine: `generated → (edited →)* validated | blocked → approved → sent_simulated`; `→ rejected` from any pre-approved state. Any edit returns the draft to validation (FS12). `approved` requires all 9 checks passing **and** `can(role, "approve", draft)`.

### Exception (renamed from ReviewItem, TASK-79.1)
item_id, kind (`draft` · `uncertain_match` · `dispute` · `missing_info` · `reconciliation` · `unallocated_payment` · `short_payment_pattern`), subject ref, recommendation, evidence_ids[], validation_status, escalation_reason, requires_role, status (`open` · `actioned` · `dismissed`).

`message_id` is optional on the type: required (Zod `superRefine`) for every kind except the two payment kinds above, which can arise with no source email. Entity key, `RV-` ids, `linked_review_ids`, the Dexie table name (`exceptions`) and all user-visible copy/labels are unchanged (EXE119) — only the type and its file names moved from `ReviewItem` to `Exception`.

**Transitions** (`transitions.ts`, machine `review`): `open → actioned` (`action`), `open → dismissed` (`dismiss`), and `actioned → open` (`reopen`, TKT-75.06). Any other event throws `IllegalTransition`; `dismissed` is terminal.

**Reversal** (`reverse_allocation`, Manager only, EXE140–EXE142): the inverse of `allocate_payment`, in one rw transaction. The payment's `invoice_id` goes back to null; the derived tables are recomputed, so the invoice's outstanding and status return (invoice rows are never written). The exception reopens via `reopen`, with `reopen_reason: "reversed"` and `reversed: true`, and its `invoice_id` is cleared so the recompute re-derives it from the candidates. One `reverse_allocation` audit event records `reverses_event_id`, the `event_id` of the `allocate_payment` event it undoes. An Analyst's attempt is refused and audited as one `permission_denied` event (FS21), written in its own transaction after the refused one rolls back.

**Reversed marker:** `reversed: true` is sticky. A later re-allocation does not clear it, and neither does `reopen_reason`. The North Star Metric (TKT-75.07) reads it as "not correctly resolved".

### AuditEvent (append-only)
event_id (monotonic), at, actor_role, actor_label, action, subject ref, summary (finance-manager-readable), before?, after?, evidence_ids[], mode?. No update or delete API exists; Reset clears the whole database and writes a `demo_reset` event as the new first entry.

## 5. Invariants and where they are enforced (S14)

| Invariant | Enforced by |
|---|---|
| invoice_number unique when present | Zod refine at ingest + Dexie unique index `&invoice_number` (nulls excluded via a separate table key) |
| outstanding is derived, never edited | no command writes it; `money.ts` computes |
| state changes only via allowed transitions | `transitions.ts` (unit-tested exhaustively) |
| a reversal restores the ledger, the derived balance and the exception together | `reverse_allocation`: one Dexie `rw` transaction over every table (TC-75.32) |
| permission per action | `permissions.can` in UI **and** in `commands.ts` |
| state change and audit event are atomic | one Dexie `rw` transaction per command (SR8) |
| approved draft has 9/9 checks passing at approval time | `commands.approve` re-runs `validate` inside the transaction |
| provider output used only after schema validation | `ai/provider.ts` returns `Result<Valid, Rejected>`; no other type escapes |

## 6. Storage layout (Dexie, database `verilane`, schema v2, TASK-79.1)

`customers`, `invoices`, `payments`, `emails`, `extractions`, `matches`, `priorities`, `evidence`, `dataIssues`, `disputes`, `drafts`, `exceptions`, `audit`, `meta` (seed version, as-of date override, theme, role), plus two new, empty-at-v2 tables:

- **creditNotes** (`credit_note_id, invoice_id, created_at`) — primary key `credit_note_id`, indexed on `invoice_id` and `created_at` (technical-plan §1.4).
- **policyDecisions** (`decision_id, exception_id, evaluated_at`) — primary key `decision_id`, indexed on `exception_id` and `evaluated_at` (technical-plan §1.3).

**v1 → v2 upgrade** (`version(2).stores(...).upgrade(...)`, `src/store/db.ts`): `exceptions` replaces `reviewItems` (the old table is dropped, `reviewItems: null`); the upgrade copies every v1 `reviewItems` row into `exceptions` unchanged before the drop, so no row is lost. `creditNotes` and `policyDecisions` open empty. Every other v1 table is untouched. Reset (`resetToSeed`) clears `db.tables`, which already covers the new tables.

- **Seed version** in `meta`. If the shipped seed version differs from the stored one, the app offers Reset and does not auto-wipe.
- **Reset Demo Data** clears every table, reloads the seed, recomputes derived state and logs `demo_reset`.
- **Export:** invoices, emails' extracted results, disputes, drafts and audit as CSV. **Import:** invoices, customers and payments CSV (replace mode, validated, audited).

## 7. Seed dataset spec (generated once by a seeded script, committed)

50 invoices / 10 customers / 25 threads, INR, as-of 2026-10-30. Coverage required by the brief and Discovery §9: ≥5 each of duplicate, commitment, confirmation, dispute and missing-data scenarios, plus all ten edge cases (FS1–FS10). A generator script (`scripts/seed.ts`, fixed PRNG seed) produces the CSVs. The output is committed, so the shipped data never depends on re-running the script. A coverage test asserts every required scenario is present.

**Seed coverage added for TKT-75.02 (unapplied cash).** The coverage test is `scripts/seed.test.ts` (TC-75.06).

| Scenario | Seed rows | What it proves |
|---|---|---|
| Unapplied bank line | `P-012`: `invoice_id` blank, paid 2026-10-29, ₹25,000 | A blank `invoice_id` imports as null and never reduces any invoice's outstanding. It is counted in unapplied cash (₹25,000 across 1 bank line). |
| Unique amount match | `INV-F` (C-005) is the only open invoice whose outstanding is ₹25,000 | Recompute raises exactly one `unallocated_payment` exception, `RV-PAY-P-012`, with `candidate_invoice_ids = ["INV-F"]`. It is deterministic and idempotent across reloads (TC-75.07). |
| Reminder hold | `INV-F` | The invoice is a candidate of an open unallocated item, so its drafts are blocked (check 7). On the seed it already ranks at G3, so the G5 hold is proven by a fixture (TC-75.10, EXE126). |

The seed has no remittance email for P-012, so the detail page shows "None on file — matched on amount". There are no `short_payment_pattern` rows until TKT-75.05.
