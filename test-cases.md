# Verilane — Test Cases

> Stage 5 · Technical Planning · Campfire TASK-5 · 2026-10-30
> Source of truth for `TC-###`. IDs are stable and never renumbered; a retired case is marked `Retired`, not deleted. Plan: [`technical-plan.md`](technical-plan.md) (A13 test architecture, Part B tasks). ACs: [`tickets.md`](tickets.md).
> **Run everything:** `pnpm test:all`. Layers: `unit` = `pnpm test`, `eval` = `pnpm eval`, `e2e` = `pnpm e2e` (production build with `NEXT_PUBLIC_E2E=1`), `static` = typecheck / lint / build / `check:secrets`.
> **Traceability rule:** each automated case carries its ID in the test title (`test('TC-015 …')`). `grep -rn "TC-0" src eval tests scripts` lists coverage.
> **Field legend.** *Rel* = milestone / Campfire ticket / plan task. *Type* = unit · eval · e2e · a11y · perf · static · manual. *Pri* = P0 (release-blocking) … P2. *Auto* = automation candidate (Y/N). *Status* = Not run until Stage 6/8 executes it. *Finding* = `CR-`/`DES-`/`SEC-` ref once one exists.
> **Shared preconditions.** Unit cases use `src/domain/__fixtures__/` and frozen `AS_OF_DATE = 2026-10-30` unless stated otherwise. E2E cases use a fresh browser context (empty IndexedDB), the committed `public/seed/*` and role Analyst, on `pnpm build:e2e && pnpm start -p 3100`.

---

## M-001 · Tracer bullet (TASK-6 … TASK-10)

### TC-001 · Build succeeds with an empty environment
- **Rel:** M-001 / TASK-6 / 6.8 · **Type:** static · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** NFR7/S10: production needs no env vars.
- **Preconditions:** clean `.next`.
- **Steps:** `env -i PATH="$PATH" HOME="$HOME" pnpm build`.
- **Data:** none.
- **Expected:** exit 0, every route except `/api/llm/*` is static, and no warnings about missing env.

### TC-002 · Domain purity lint rule rejects framework imports
- **Rel:** M-001 / TASK-6 / 6.3 · **Type:** static · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** SR2: `src/domain/**` cannot import React/Next/Dexie/store/components or touch browser globals.
- **Steps:** run `pnpm lint:domain-fixture` against `src/domain/__lint__/forbidden.fixture.ts` (imports `react`, reads `window`); run `pnpm lint`.
- **Expected:** the fixture run fails with `no-restricted-imports` and `no-restricted-globals`. `pnpm lint` (fixture ignored) passes.

### TC-003 · Logo asset is unmodified
- **Rel:** M-001 / TASK-6 / 6.8 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** D-rule: the supplied logo is never altered.
- **Steps:** compute the sha256 of `public/brand/verilane-logo.png`.
- **Expected:** it equals the recorded constant. The rendered `<img>` sits on a white `--r-md` card with max width 150px (104px mobile).

### TC-004 · priority.v1 worked examples A, B, E
- **Rel:** M-001 / TASK-7 / 7.5 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** ledger-only gates and scoring match the Solution-PRD worked examples exactly.
- **Data:** `worked-examples.ts` A, B, E.
- **Steps:** call `prioritise(inv, ctx)` for each.
- **Expected:** band, score, gate and `reason` string equal the PRD values; `config_version === 'priority.v1'`.

### TC-005 · Gate order and score boundaries
- **Rel:** M-001 / TASK-7 / 7.5 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** gates G1→G7, first hit wins. Band thresholds High ≥55, Medium 30–54, Low <30. Factor bucket edges.
- **Data:** table of boundary invoices (score 29/30/54/55; outstanding at ₹50,000/₹2,00,000/₹5,00,000 ±1 paise; days overdue at each bucket edge; no payment history → 5).
- **Expected:** each row matches the expected band/score. An invoice hitting two gates reports the first.

### TC-006 · Deterministic tie-break
- **Rel:** M-001 / TASK-7 / 7.5 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** `rank()` over invoices with equal score; shuffle input 20× (fixed seed).
- **Expected:** order is always score → days overdue → outstanding → invoice number ascending.

### TC-007 · Money parsing and formatting
- **Rel:** M-001 / TASK-7 / 7.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `₹3,40,000`, `Rs. 340000`, `INR 3.4 lakh`, `3.4 lakhs`, `1.2 crore`, `340,000.50`, `abc`, `₹-5`.
- **Expected:** integer paise (`3.4 lakh` → 34,000,000), `null` for invalid. `formatInr(34_000_000) === '₹3,40,000.00'`. `paise(1.5)` throws.

### TC-008 · Ingest: missing fields → null + DataIssue (FS1, FS2)
- **Rel:** M-001 / TASK-7 / 7.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** invoice row missing `due_date` (FS1); row missing contact email (FS2).
- **Expected:** the field is `null` (never defaulted) and a `DataIssue{kind:'missing', record_id, field}` exists. Priority applies the PRD gate for missing data, and the UI shows "Missing" instead of a value.

### TC-009 · Ingest: outstanding conflict and unknown status (FS8, FS10)
- **Rel:** M-001 / TASK-7 / 7.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** supplied outstanding ≠ amount − Σpayments (FS8); `status_raw:'pending-ish'` (FS10).
- **Expected:** outstanding equals the derived value, with `DataIssue{kind:'conflict'}` carrying both values; `status:'unknown'` with a DataIssue; neither throws.

### TC-010 · Tracer: seed → Queue → Investigation provenance
- **Rel:** M-001 / TASK-7 / 7.9 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** the milestone exit on a production build.
- **Steps:** open `/queue` → wait for rows → click the first row → read Invoice facts.
- **Expected:** rows in rank order with a priority chip (dot + text). Every Invoice-facts value has a provenance line `invoices.csv · Row N · field`, and the row number matches the CSV. No console errors.

### TC-011 · Seed coverage
- **Rel:** M-001 / TASK-8 / 8.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** 50 invoices, 10 customers and 25 threads; ≥5 each of duplicate / commitment / confirmation / dispute / missing-data; FS1–FS10 each present; worked examples A–E present by ID.

### TC-012 · Seed generator is deterministic
- **Rel:** M-001 / TASK-8 / 8.2 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** run `scripts/seed.ts` twice into `/Volumes/E Drive/Dev/.scratch/verilane-seed-{a,b}`; compare with the committed `public/seed/`.
- **Expected:** all three are byte-identical.

### TC-013 · Invoice number uniqueness
- **Rel:** M-001 / TASK-8 / 8.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `ingest` flags a duplicate `invoice_number` with a DataIssue, and Dexie `bulkAdd` of a duplicate throws `ConstraintError` (the `&invoice_number` index).

### TC-014 · Seed version mismatch never auto-wipes
- **Rel:** M-001 / TASK-8 / 8.5 · **Type:** unit + e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Preconditions:** DB seeded at `2026-10-30.0` with one user note added.
- **Steps:** serve manifest `2026-10-30.1`; reload.
- **Expected:** the "New demo data available" prompt appears and the note still exists. Data changes only after the user clicks Reset (from TASK-19).

### TC-015 · Queue search, filter, sort, paging
- **Rel:** M-001 / TASK-9 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** search a customer name; filter band High; sort by outstanding descending; go to page 2.
- **Expected:** counts match the seed, 25 rows per page, and the active-filter count is shown. Excluded rows (disputed / hold_reconcile / on_hold_promised) are muted with a badge, not hidden.

### TC-016 · Queue four states
- **Rel:** M-001 / TASK-9 / 9.4 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** `?__state=loading|empty|error`; a filter with no matches; a seed fetch that returns 500 (route intercept).
- **Expected:**
  - row skeleton
  - "No invoices yet" with Load demo data
  - "No invoices match these filters" with Clear filters
  - error state with Retry, which recovers once the intercept is removed

### TC-017 · Queue state lives in the URL
- **Rel:** M-001 / TASK-9 / 9.2 · **Type:** unit + e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `parse(serialize(f))` deep-equals `f`. Reloading or sharing `/queue?band=high&sort=outstanding&page=2` restores the same view. Back restores the previous filters.

### TC-018 · Storage fallback (SR9)
- **Rel:** M-001 / TASK-10 · **Type:** unit + e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** `addInitScript` makes `indexedDB.open` throw `SecurityError`; open `/queue`.
- **Expected:** the banner reads "Changes won't survive reload — storage unavailable". The Queue works on in-memory data, `console.error` has the `[verilane]` prefix and there is no blank screen.

## M-002 · Email intelligence (TASK-11 … TASK-13)

### TC-019 · Eval label files are valid
- **Rel:** M-002 / TASK-11 / 11.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `seed.labels.json` (25), `heldout/labels.json` (30) and `drafts.cases.json` (≥20, incl. FS12 edits) pass the Zod schemas. Every label references an existing thread, and `eval/CHANGELOG.md` exists.

### TC-020 · Held-out set predates the extractor
- **Rel:** M-002 / TASK-11 / 11.5 · **Type:** manual (Stage 8) · **Pri:** P0 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Steps:** `git log --format=%H --diff-filter=A -- eval/heldout/labels.json src/domain/extract.ts`.
- **Expected:** the label commit is an ancestor of the first extractor commit. Any later label change has a matching `eval/CHANGELOG.md` entry with a reason.

### TC-021 · Token extraction
- **Rel:** M-002 / TASK-12 / 12.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `inv-1042`, `₹3.4 lakh`, `30 Oct 2026`, `05/11/2026`, "by next Friday" sent 2026-10-28.
- **Expected:** refs are uppercase. Amounts are in paise. `05/11/2026` → 2026-11-05 (DD/MM, never MM/DD). "next Friday" resolves to 2026-11-06 from `sent_at`.

### TC-022 · Negation and hedging do not count
- **Rel:** M-002 / TASK-12 / 12.2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** "we have **not** paid", "we **might** pay by Friday", "no dispute from our side".
- **Expected:** no confirmation, commitment or dispute signal fires.

### TC-023 · Classification needs signal + supporting token
- **Rel:** M-002 / TASK-12 / 12.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** "payment done" with no amount or ref; "we will pay" with no date.
- **Expected:** neither is classed as confirmation or commitment; it falls back to enquiry or other per the precedence rules. With a ref or amount, or a date, it is classed correctly.

### TC-024 · Class precedence and secondary signals
- **Rel:** M-002 / TASK-12 / 12.3 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** an email with both a dispute and a commitment.
- **Expected:** `email_class:'dispute'` and `signals` still contain commitment. Precedence is dispute/duplicate > confirmation > commitment > delay > enquiry.

### TC-025 · Communication evidence table
- **Rel:** M-002 / TASK-12 / 12.6 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** for an invoice with threads: class chip, key facts, provenance `emails.json · E-007 · amounts[0]` and a `Simulated` label. Every fact traces to a source token.

### TC-026 · No communication state (FS9)
- **Rel:** M-002 / TASK-12 / 12.6 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** an invoice without threads shows "No prior communication", not an empty table, and the priority reason does not claim contact.

### TC-027 · Strict matcher outcomes
- **Rel:** M-002 / TASK-13 / 13.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** a known sender with an owned ref; a known sender with a ref owned by another customer; a known sender with no ref; an unknown sender; uppercase or whitespace variants of the address.
- **Expected:** `matched`, `ambiguous`, `customer_only`, `unresolved`, and a normalised match, in that order.

### TC-028 · No fuzzy matching
- **Rel:** M-002 / TASK-13 / 13.1 · **Type:** unit + static · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `INV-1024` vs ledger `INV-1042`; `INV-1043` (one digit off).
- **Expected:** the transposition is `ambiguous` with "possible transposition of INV-1042". The one-digit-off ref is `customer_only`/`unresolved`, never `matched`. Static check: `grep -rniE "levenshtein|edit.?distance|fuzzy|similarity" src/` returns nothing.

### TC-029 · G4 dispute gate
- **Rel:** M-002 / TASK-13 / 13.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** a dispute signal or an open Dispute excludes the invoice from the active queue via G4, with a reason that cites the email evidence id.

### TC-030 · G5 payment-claim / reconciliation gate
- **Rel:** M-002 / TASK-13 / 13.2–13.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** "paid ₹3,00,000 against INV-1042" where the ledger outstanding is ₹3,40,000.
- **Expected:** G5 hold-reconcile, plus a `reconciliation` review item with both amounts. The ledger outstanding is unchanged (never overridden by email).

### TC-031 · G7 commitment and broken promise
- **Rel:** M-002 / TASK-13 / 13.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** a commitment dated 2026-10-28 with as-of 2026-10-30, 2026-10-31 and 2026-11-01, invoice unpaid.
- **Expected:** G7 on hold while as-of ≤ commitment + 3 days (to 2026-10-31). From 2026-11-01 it returns to the queue with +10 broken promise and a reason that says so.

### TC-032 · Worked examples C and D
- **Rel:** M-002 / TASK-13 / 13.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** band, score, gate and reason equal the PRD values exactly.

### TC-033 · Duplicate payment claim across invoices (FS6)
- **Rel:** M-002 / TASK-13 / 13.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** one email claiming one payment for two invoices puts both on G5 with linked review items. Neither is marked paid.

### TC-034 · Payments page
- **Rel:** M-002 / TASK-13 / 13.4 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** the ledger table plus unmatched / ambiguous / reconciliation items, each linking to its email and invoice. Four states render.

## M-003 · Approval path (TASK-14 … TASK-17)

### TC-035 · Permission matrix is exhaustive
- **Rel:** M-003 / TASK-14 / 14.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** a table-driven test over every `Role × Action` (and the subject conditions > ₹5,00,000, ambiguous, conflict).
- **Expected:** it matches S4 exactly. Every denial has a human-readable `reason`. The test fails if a new Action is added without a matrix row.

### TC-036 · State machines reject illegal transitions
- **Rel:** M-003 / TASK-14 / 14.2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** every legal (from, event) gives the documented next state for invoice / dispute / draft / review. Every other pair throws `IllegalTransition` (exhaustive).

### TC-037 · Exactly one audit event per command
- **Rel:** M-003 / TASK-14 / 14.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** execute each command type once on fake-indexeddb.
- **Expected:** the audit count rises by exactly 1 each time, with actor, action, subject, before/after and timestamp.

### TC-038 · Atomic rollback
- **Rel:** M-003 / TASK-14 / 14.4 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** inject a throw after the state write and before commit.
- **Expected:** neither the state change nor the audit event persists, and the error reaches the caller.

### TC-039 · Forced manager-only action as Analyst (FS13)
- **Rel:** M-003 / TASK-14 / 14.7 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** as Analyst, view a > ₹5,00,000 draft that passes 9/9; call `window.__verilane.execute({type:'approve_draft',…})` (E2E build only).
- **Expected:** Approve is disabled with the reason visible. The forced call throws `PermissionDenied` and the toast shows the reason. Draft status and audit count are unchanged.

### TC-040 · Audit log page
- **Rel:** M-003 / TASK-14 / 14.6 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** reverse-chronological order, filters by action/subject, a role switch appears as an event, no edit/delete controls, and four states.

### TC-041 · Nine checks: pass and individual fails
- **Rel:** M-003 / TASK-15 / 15.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** one valid draft, plus one variant per check failing.
- **Expected:** the valid draft passes 9/9. Each variant fails exactly its check, with a reason, and the others still evaluate.

### TC-042 · Edits re-run all checks (FS12)
- **Rel:** M-003 / TASK-15 / 15.4 · **Type:** unit + eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `eval/drafts.cases.json` adversarial edits (amount change, added date, new ref, customer swap).
- **Expected:** each edit fails check 9 (or the relevant check), and the draft cannot be submitted.

### TC-043 · Check 9 — no unverified tokens
- **Rel:** M-003 / TASK-15 / 15.3 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** a number, date, `INV-` ref or customer name outside a footnote span fails. Ordinary words and the greeting pass.

### TC-044 · Draft template uses only verified facts
- **Rel:** M-003 / TASK-15 / 15.2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** every interpolated span maps to a `VerifiedFact` with an `evidenceId`, and the template source has no literal numbers or dates.

### TC-045 · Checks panel and action bar
- **Rel:** M-003 / TASK-15 / 15.5 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** "N of 9 passed", with failures first and expanded and each carrying a fix link. Exactly one primary button. A disabled button shows its reason inline.

### TC-046 · Approve re-validates against live data
- **Rel:** M-003 / TASK-16 / 16.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** submit a 9/9 draft, record a payment that changes outstanding, then approve.
- **Expected:** approval fails inside the transaction with the failing check. The status stays `awaiting_approval`, and a `validation_failure` audit event is written.

### TC-047 · Manager-required conditions
- **Rel:** M-003 / TASK-16 / 16.1 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** outstanding ₹5,00,000 exactly and ₹5,00,000.01; ambiguous match; conflicting payment info.
- **Expected:** ₹5,00,000 exactly is Analyst-approvable. The other three need Manager.

### TC-048 · Simulated send makes no network request
- **Rel:** M-003 / TASK-16 / 16.4 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** log `page.on('request')` from opening the dialog to the toast.
- **Expected:** no request outside the asset/RSC baseline and none to a non-`127.0.0.1:3100` origin. The toast reads "… approved and sent (simulated)" and the status is `sent_simulated`.

### TC-049 · Drafts page
- **Rel:** M-003 / TASK-16 / 16.3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** lists awaiting-approval drafts, the sidebar badge count matches, and four states render.

### TC-050 · Dispute state machine
- **Rel:** M-003 / TASK-17 / 17.2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** disputes are created idempotently per source `message_id` (recompute twice → one dispute). Legal transitions pass and the rest throw.

### TC-051 · Only Manager resolves; only resolution releases G4
- **Rel:** M-003 / TASK-17 / 17.2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** Analyst → resolved is denied. Manager → resolved/rejected releases G4, and the invoice re-enters the queue on the next recompute.

### TC-052 · Disputed invoice cannot be approved
- **Rel:** M-003 / TASK-17 / 17.4 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** the muted Queue row reads "Disputed — excluded from queue" with a link. In its draft, check 6 fails and Approve is disabled with that reason.

### TC-053 · Disputes pages
- **Rel:** M-003 / TASK-17 / 17.3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** list and detail show the claim text, email provenance and recommendation. The sidebar badge matches and four states render.

## M-004 · Complete workspace (TASK-18 … TASK-20)

### TC-054 · Home aggregates
- **Rel:** M-004 / TASK-18 / 18.1 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** KPIs (outstanding, High count, open disputes, average days overdue), ageing buckets and priority mix equal hand-computed values on the fixture. Buckets sum to the total.

### TC-055 · Charts drill through to the Queue
- **Rel:** M-004 / TASK-18 / 18.2 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** clicking a bar or legend opens `/queue` with the matching filter and count. The keyboard link-list fallback does the same.

### TC-056 · Home four states and per-block errors
- **Rel:** M-004 / TASK-18 / 18.3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** one failing block shows an inline error while the others render. The empty state reads "Nothing needs your attention", with no celebration.

### TC-057 · CSV import rejects a bad file with row errors
- **Rel:** M-004 / TASK-19 · **Type:** unit + e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `tests/e2e/fixtures/bad-invoices.csv` (bad date row 3, negative amount row 7, missing header).
- **Expected:** the whole file is rejected with no partial write. The list shows row / field / reason, and an audit event `import_rejected` is written.

### TC-058 · CSV import accepts a good file
- **Rel:** M-004 / TASK-19 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** `good-invoices.csv`.
- **Expected:** data is replaced, then recompute runs and the Queue reflects the new rows. An audit event `import_csv` is written.

### TC-059 · Export round-trip
- **Rel:** M-004 / TASK-19 / 19.1 · **Type:** unit · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `parseImport(toCsv(rows))` equals `rows`, and amounts stay integer paise.

### TC-060 · Reset Demo Data
- **Rel:** M-004 / TASK-19 / 19.2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** add a note and approve a draft, then Settings → Reset → confirm.
- **Expected:** the state equals a fresh seed, and the first audit event after the reset is `demo_reset`. The seed-update prompt Reset (TC-014) uses the same path.

### TC-061 · As-of date re-ranks
- **Rel:** M-004 / TASK-19 / 19.2 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** setting as-of to 2026-11-15 changes days overdue and order, the sidebar footer shows the new date, and the change is audited.

### TC-062 · No horizontal scroll at four widths
- **Rel:** M-004 / TASK-20 / 20.5 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** every route × [1440, 1280, 768, 390].
- **Expected:** `document.documentElement.scrollWidth <= innerWidth` for all of them. The layout is the sidebar, icon rail or bottom tabs, as appropriate for the width.

### TC-063 · Mobile navigation reaches every destination
- **Rel:** M-004 / TASK-20 / 20.1 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** at 390, the bottom tabs plus the More sheet reach all seven routes. Targets are ≥48px and the icon rail has tooltips and aria-labels at 768.

### TC-064 · Tab order follows visual order
- **Rel:** M-004 / TASK-20 / 20.4 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** no positive `tabindex` and focus order equals DOM/visual order on Queue and Investigation at 1440 and 390. Focus is always visible.

## M-005 · Eval gate and AI modes (TASK-21 … TASK-23)

### TC-065 · Eval gates on the seed set
- **Rel:** M-005 / TASK-21 · **Type:** eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** all six gated metrics meet the Discovery §8.2 thresholds, and `eval/report.json` lists value / threshold / passed for each.

### TC-066 · Eval gates on the held-out set
- **Rel:** M-005 / TASK-21 · **Type:** eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** the same six gates pass on the 30 held-out threads, and the report shows seed and held-out side by side.

### TC-067 · Eval is deterministic
- **Rel:** M-005 / TASK-21 / 21.4 · **Type:** eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** two runs produce identical `report.json` apart from `generatedAt`.

### TC-068 · A gate miss fails the run
- **Rel:** M-005 / TASK-21 / 21.4 · **Type:** eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** run a child process with `VERILANE_EVAL_FORCE_MISS=1`.
- **Expected:** non-zero exit, and the report marks the missed gate `passed:false`.

### TC-069 · Eval runtime budget
- **Rel:** M-005 / TASK-21 / 21.4 · **Type:** eval · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** wall-clock ≤30 s, recorded in the report. No network access (the fetch stub throws if called).

### TC-070 · Fault injection: every fault is rejected (FS11)
- **Rel:** M-005 / TASK-22 · **Type:** unit + eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Data:** each `FaultKind`: malformed_json, missing_fields, bad_enum, hallucinated_amount, wrong_ref, refusal.
- **Expected:** `Result.ok === false`, a `validation_failure` audit event, and the item lands in `needs_review`. The rejection rate is 100%.

### TC-071 · A rejected extraction never yields an approvable draft
- **Rel:** M-005 / TASK-22 / 22.3 · **Type:** eval · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** for every faulted message, `generate_draft` is unavailable or the draft fails a check, and `approve_draft` cannot succeed.

### TC-072 · Live mode off by default
- **Rel:** M-005 / TASK-23 / 23.5 · **Type:** unit + e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** with no env, `POST /api/llm/extract` and `/draft` return 503 `{error:'live_mode_disabled'}`. The key alone without `VERILANE_LIVE_LLM=1` also gives 503. The UI keeps the `Simulated` label.

### TC-073 · No secret in the client bundle
- **Rel:** M-005 / TASK-23 / 23.5 · **Type:** static · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** `pnpm build && pnpm check:secrets`. Also build with a dummy `ANTHROPIC_API_KEY=test-not-a-key` set and re-run.
- **Expected:** neither `ANTHROPIC` nor `sk-ant-` nor the dummy value appears under `.next/static`. Importing `src/server/llm.ts` from a client component fails the build (`server-only`).

### TC-074 · Live provider rejects refusal or invalid output
- **Rel:** M-005 / TASK-23 / 23.5 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** mock the SDK to return `stop_reason:'refusal'`, then a schema-invalid parse.
- **Expected:** the route returns `{status:'rejected'}`, and client Zod re-validation also rejects the payload if it is tampered with. No real API call is made in tests.

## M-006 · Ship readiness (TASK-24 … TASK-28)

### TC-075 · PWA manifest and service worker
- **Rel:** M-006 / TASK-24 · **Type:** e2e + manual · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** the manifest has `display:standalone`, theme/background colours and 192/512/maskable icons, and the SW registers on the production build. The Lighthouse installable check is run once and recorded (manual).

### TC-076 · Offline behaviour
- **Rel:** M-006 / TASK-24 / 24.4 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** load once, then `context.setOffline(true)` and reload `/queue`.
- **Expected:** the app loads from cache with the offline banner (which wins over the storage banner). Import, Reset and live calls are disabled with "Unavailable offline".

### TC-077 · Cache key follows the seed version
- **Rel:** M-006 / TASK-24 / 24.3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** after a seed version bump, `caches.keys()` contains only `verilane-<new>`, and no stale seed is served.

### TC-078 · Install chip is dismissible and non-modal
- **Rel:** M-006 / TASK-24 / 24.5 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** a dispatched `beforeinstallprompt` shows the chip. Dismissing it hides the chip for the session, and Settings → Install app remains.

### TC-079 · Every data view has all four states
- **Rel:** M-006 / TASK-25 / 25.1 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** each data route × loading / empty / error / working.
- **Expected:** each state renders per Design §18. Error states offer Retry, and nothing renders a blank screen.

### TC-080 · Accessibility: axe in both themes
- **Rel:** M-006 / TASK-25 / 25.2 · **Type:** a11y · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** zero serious or critical violations on every route in the light and dark projects. Text contrast is ≥4.5:1 (cross-checked by the token test).

### TC-081 · No dead controls
- **Rel:** M-006 / TASK-25 / 25.3 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** every button and link on every route either has an observable effect (navigation, DOM change, toast) or is `aria-disabled` with a visible reason. No `ComingSoon` placeholder remains.

### TC-082 · Keyboard-only trust walk
- **Rel:** M-006 / TASK-25 / 25.4 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** Queue → row → Investigation → draft → submit → (switch to Manager) → approve → confirm is completable with Tab, Enter, Space and Esc only. Dialog focus is trapped and restored.

### TC-083 · Page performance budgets (NFR1, NFR3)
- **Rel:** M-006 / TASK-25 / 25.5 · **Type:** perf · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** LCP ≤2.5 s on `/` and `/queue` (production build, local), and every route is ≤300 KB gzip First Load JS (`scripts/route-budget.ts`).

### TC-084 · Recompute budget (NFR2)
- **Rel:** M-006 / TASK-25 / 25.5 · **Type:** perf · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `recompute()` over 50 invoices + 25 threads takes ≤200 ms median of 5 runs (fake-indexeddb, node).

### TC-085 · Interaction latency
- **Rel:** M-006 / TASK-25 / 25.5 · **Type:** perf · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** Queue filter and sort event-to-paint is ≤200 ms (Event Timing API).

### TC-086 · S6 trust walk end-to-end
- **Rel:** M-006 / TASK-26 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Steps:** fresh context: Queue → top High → evidence → provenance → generate draft → 9/9 → submit → Manager approves → toast → open a disputed invoice → `/audit`.
- **Expected:** every step succeeds. The disputed invoice is blocked with a reason, and the audit log shows each step in order with the correct actors.

### TC-087 · Same-origin only during the trust walk
- **Rel:** M-006 / TASK-26 / 26.2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** every request during TC-086 has origin `http://127.0.0.1:3100`: no analytics, no fonts CDN and no LLM call.

### TC-088 · Link-preview meta tags
- **Rel:** M-006 / TASK-27 / 27.4 · **Type:** e2e + manual · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `og:title`, `og:description`, `og:image` (absolute `https://`), `og:url`, `twitter:card=summary_large_image` and `twitter:image` are present on the built page. LinkedIn Post Inspector and opengraph.xyz are checked manually at Stage 10 on the deployed URL.

### TC-089 · OG image spec and approval
- **Rel:** M-006 / TASK-27 / 27.1–27.2 · **Type:** unit + manual · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Expected:** `public/og.png` is exactly 1200×630 and <5 MB, uses an unmodified logo, and has user approval recorded as `D7` in `decisions.md` before the file lands in `public/`.

### TC-090 · README runs verbatim from a fresh clone
- **Rel:** M-006 / TASK-28 / 28.2 · **Type:** manual · **Pri:** P1 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Steps:** clone into `/Volumes/E Drive/Dev/.scratch/verilane-fresh` and run the README commands exactly as written.
- **Expected:** the app runs with zero env and `pnpm test:all` passes. Demo vs live mode, the trust boundary and the per-browser audit log are all explained.

---

## Coverage summary

| Area | Cases | P0 |
|---|---|---|
| M-001 tracer | TC-001–018 | 14 |
| M-002 email intelligence | TC-019–034 | 13 |
| M-003 approval path | TC-035–053 | 15 |
| M-004 workspace | TC-054–064 | 5 |
| M-005 eval + AI modes | TC-065–074 | 8 |
| M-006 ship readiness | TC-075–090 | 8 |
| **Total** | **90** | **63** |

FS1–FS13 coverage: FS1/FS2 TC-008 · FS3–FS5 TC-027/028/030 · FS6 TC-033 · FS7 TC-031 · FS8/FS10 TC-009 · FS9 TC-026 · FS11 TC-070 · FS12 TC-042 · FS13 TC-039. NFR1–3 TC-083–085 · NFR7 TC-001 · NFR8 TC-073.
