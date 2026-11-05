# Verdict — TKT-75.02 tracer (unallocated payment, end to end)

**GO.** An unapplied bank line flows end to end through the existing v1 machinery:

> seed → loader recompute → stored exception → `/exceptions` → `/exceptions/[id]` → `execute()` → one read-write transaction → audit

There is no second code path and no non-atomic write. Nothing in the slice needed a workaround, so the NO-GO rule never triggered.

## The question the tracer had to answer

Can a payment exception, a new kind of subject that is not email-derived, reuse the existing paths?

- detection: the loader recompute;
- storage: the `exceptions` table and the review state machine;
- permissions: `can()`;
- commands: `run()` / `execute()` and its audit event;
- reminder gating: priority signals and draft check 7;
- UI: Queue filters, row cards and the four screen states.

It must reuse all of these without a parallel pipeline, and its one write must be atomic.

## Evidence

**Single code path**

The only write the UI makes is `execute({ type: "allocate_payment", subject: { kind: "review", id }, payload: { invoice_id } })` (`src/components/exceptions/ExceptionDetailView.tsx`). That goes through the same `run()` used by every v1 command. `run()`:

1. checks `can()` against the stored row's `requires_role`;
2. runs the handler;
3. writes exactly one audit event.

The handler lives in `src/domain/review.ts`. The decision is EXE125.

**Single transaction**

`allocate_payment` is in `WHOLE_DB` (`src/store/tx.ts`). The handler's recompute therefore shares the command's one rw transaction. The payment, the exception, the derived priorities and the audit event commit or roll back together.

| Proof | Test |
|---|---|
| Allocation commits in one transaction with exactly one audit event | TC-75.08, `src/store/allocatePayment.test.ts` |
| Refusals write nothing: a non-candidate invoice, an already-actioned item, a non-payment kind, an Analyst on a Manager-escalated item | TC-75.08 |
| A throw injected after every write, before commit, leaves no partial state | TC-75.09 |

**Detection reuses recompute**

The loader raises `RV-PAY-P-012` deterministically and idempotently. There is one exception per unapplied bank line, with the same id and the same row on every reload (TC-75.07, EXE124).

**Reminder gating reuses existing gates**

An invoice that is a candidate for related unapplied cash is held at G5 by `deriveSignals`. Its drafts are blocked by check 7 (TC-75.10, EXE126).

**UI reuses v1 parts**

`/exceptions` uses the Queue's `filterIntent`, `queueParams` and `FiltersPanel`. Both routes reuse `EmptyState`, `ErrorState` and `RowSkeleton` (TC-75.12, EXE128).

**End to end in a real browser**

`tests/e2e/exceptions.spec.ts` (TC-75.13) runs the whole flow:

1. seed;
2. the row appears on `/exceptions`;
3. open it;
4. INV-F is preselected;
5. Submit;
6. the toast shows "Allocated payment P-012 (₹25,000.00) to INV-F";
7. the status reads Resolved and the audit trail shows the event;
8. IndexedDB holds `payment.invoice_id = INV-F` and the exception is `actioned`;
9. back on the list, the row is gone.

The spec also covers both routes' loading, empty or not-found, error with Retry, working and offline states, and checks there is no horizontal scroll at 375 and 768. The result is under "Gates" below.

## Gates

See the TASK-79.2 report for the full gate tables:

- typecheck: clean;
- lint: 0 errors, plus the one warning that predates this ticket;
- unit: 113 files / 1909 tests passed;
- perf: 1/1;
- eval: 8 failed / 35 passed, the same 8 names as the 79.1 baseline;
- e2e: 510 passed / 24 skipped / 0 failed. The first run caught a real bug (below), fixed in-tree and reconfirmed green.

**One real bug surfaced by the e2e gate.** `ExceptionCards.tsx`'s row-card grid switched to its wide-screen layout at the `md:` (768px) breakpoint, but the shell shows only the 72px icon rail at that width (the labeled sidebar needs `lg:`, 1024px+); the grid's fixed columns needed more width than that leaves, so `/exceptions` scrolled horizontally at 768px. Fixed by gating the grid at `lg:` instead, matching the convention every sibling grid (`DisputesView`, `LedgerTab`, `ReconciliationTab`) already follows. A second full e2e run confirmed the fix and found no other failures; a lone rerun of the one unrelated flake it also turned up (`TC-131`, a self-invalidating timing assertion in `splash.spec.ts`, chromium-dark only) passed all 8 cases outside the long run, confirming it as environmental, not a regression.

## Known limits (not blockers)

- **INV-F already ranks at G3 on the seed**, so the G5 hold is invisible there. It is proven by a fixture instead (EXE126).
- **The seed has no remittance email for P-012.** Evidence reads "None on file — matched on amount".
- **Balance and status are derived, not written.** Invoices stay immutable source rows (EXE125).
- **Allocate stays enabled offline.** It is a local IndexedDB write, like every v1 command. **Mark disputed** is shown disabled with a reason.
- **Out of scope:** short payments (79.5), reversal (79.6), the agent blocks and the Policy card (79.3/79.4), and A1 (§25).
