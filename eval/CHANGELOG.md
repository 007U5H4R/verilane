# Eval label changelog

Every change to a file under `eval/` that holds ground truth (`seed.labels.json`,
`heldout/**`, `drafts.cases.json`) gets an entry here with a reason. Labels are
never regenerated from Verilane's own extractor or classifier output
(AI-Evaluation.md §2).

## 2026-10-31: initial label set (TASK-11 / TKT-06)

Written before any extractor exists.

- `seed.labels.json` has 25 labels for E-001 to E-025. They were transcribed from the
  scenario spec in `scripts/seed.ts` (`THREADS`) and checked by hand against the
  thread text in `public/seed/emails.json`.
- `heldout/` holds 30 new fictional threads (H-001 to H-030), 8 customers and 30
  invoices, with labels. The wording is deliberately unlike the seed and includes
  lower-case or spaced refs, transposed near-miss refs, negation, hedging, lakh
  amounts, unit rates, relative dates, DD/MM dates, an out-of-office reply, an
  automated notice and a spoofed sender. Every name and domain is invented and uses
  `.test` domains.
- `drafts.cases.json` has 28 draft-approval cases: clean, one blocked case for each
  of checks 5–8, FS12 adversarial edits (amount, added date, new ref, customer
  swap, days overdue), benign edits, and role cases.

### Labelling conventions

- **Money:** every INR amount stated in the thread, in paise, in order of first
  appearance, with repeats removed. Unit rates count. UTRs, PO numbers and
  invoice numbers are not amounts. "1.2 lakh" is ₹1,20,000.
- **`invoice_refs`:** each ref as cited, normalised to `INV-<digits>`. This
  includes refs that do not exist and refs that belong to another customer.
- **`commitment_date`:**
  - for a commitment, the promised date;
  - for a confirmation or a `payment_already_completed` dispute, the claimed
    payment date;
  - `null` when the date is hedged, retracted or absent.
- **Relative dates:**
  - "today", "yesterday" and "tomorrow" are taken from the date of `sent_at`.
  - "next <weekday>" is that weekday in the following Monday-start week. For
    example, "next Friday" sent on Wed 2026-10-21 is 2026-10-30.
  - "on <weekday>" (past tense) and "last <weekday>" mean the most recent such day
    before `sent_at`.
  - "in two weeks" is `sent_at` + 14 days.
  - "end of this month" is the last day of that month.
- **Numeric dates:** always read as DD/MM. A missing year is 2026.
- **Identity:** `customer_id` is set only when the sender's address is in that
  customer's contacts. A name mentioned in the body never establishes identity.
- **`match_outcome`:**
  - `matched`: exactly one invoice.
  - `ambiguous`: more than one candidate, or a near-miss found only by
    transposition (FS3).
  - `customer_only`: a known customer with no usable ref (FS4).
  - `unresolved`: anything else.
- **`invoice_id`:**
  - Set only when `matched`.
  - For a duplicate claim, it is the invoice the customer asks to cancel. If none
    is named, it is the later re-issue.
- **`invoice_ids`:** every ledger invoice the thread concerns. For an ambiguous
  match, these are the candidates. It is empty for `customer_only` and
  `unresolved`.
- **`ambiguous`:** `true` when more than one ledger invoice is a plausible target.
  That covers every `ambiguous` outcome, and `customer_only` when the customer has
  several open invoices.
- **Class precedence:** dispute and duplicate first, then confirmation, then
  commitment, then delay, then enquiry. A claim that an invoice is already paid,
  sent in reply to a reminder, is a `payment_already_completed` dispute.
- **Draft check numbers** follow Architecture.md §7, where 1 is "invoice exists"
  and 9 is "every factual token is footnoted". An edit that replaces a fact's span
  removes that span's footnote.

## 2026-11-01: heldout-v2 (TASK-31)

`heldout/` was inspected while diagnosing classifier misses, so it is no longer a
blind test. `heldout-v2/` replaces it as the blind set; `heldout/` stays in the
report, marked "inspected 2026-11-01, no longer blind".

- `heldout-v2/` holds 30 new fictional threads (H2-001 to H2-030), 8 new customers
  (H2C-01 to H2C-08) and 30 invoices (INV-3101 to INV-3804). None of them collide
  with the seed or `heldout/`. Every name and domain is invented and uses `.test`
  domains.
- The class and outcome mix matches `heldout/`: commitment 8, dispute 6,
  confirmation 5, delay 3, duplicate 3, enquiry 3, unknown 2; matched 20,
  customer_only 4, ambiguous 3, unresolved 3. There is one dispute of each type.
- The threads include indirect disputes, a partial payment net of TDS, an
  instalment plan, a multi-invoice remittance, Hinglish, forwarded threads,
  typos, a retracted refusal, a negated promise, and a mailer-daemon bounce.
- Labels were written by hand from the thread text. They were not derived from,
  or tuned against, Verilane's extractor or classifier rules. They were frozen
  after the first `pnpm eval` run. Any later labelling mistake is reported, not
  silently fixed.

### Conventions added

- "this <weekday>" and "is <weekday>" (Hinglish "is Friday ko") mean that weekday
  in the same Monday-start week as `sent_at`.
- Hindi "kal" is resolved by tense: with a completed verb ("kar diya") it is
  yesterday; otherwise it is tomorrow.
- A remittance that pays several invoices in one message is `ambiguous`, and every
  paid invoice is a candidate, because no single invoice is the match.
- For an instalment plan, `commitment_date` is the first promised payment date.
- A bounce from a customer's mail server is not a contact, so its `customer_id`
  is null. The refs and amounts in the quoted reminder still count as stated in
  the thread.
