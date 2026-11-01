/**
 * The Solution-PRD / Architecture.md §5.4 worked examples, as `Invoice` +
 * `PriorityCtx` pairs. TC-004 asserts `prioritise()` reproduces their band,
 * score, gate and reason exactly.
 */
import { AS_OF_DATE } from "../clock";
import type { Invoice } from "../schema";
import type { PriorityCtx } from "../priority";
import { paise } from "../money";

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    row_id: 1,
    invoice_id: "INV-A",
    invoice_number: "1001",
    customer_id: "C-001",
    invoice_date: "2026-01-01",
    due_date: "2026-09-13",
    amount_paise: paise(0),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<PriorityCtx> = {}): PriorityCtx {
  return {
    asOf: AS_OF_DATE,
    payments: [],
    customerHistory: new Map(),
    ...overrides,
  };
}

// A — 47 days overdue, ₹3,40,000, avg 12 days late, broken promise.
// 35 (31-60 bucket) + 20 (₹2,00,000-4,99,999 bucket) + 5 (6-20 avg late) + 10 (broken promise) = 70 → High.
export const exampleA = {
  invoice: baseInvoice({
    row_id: 12,
    invoice_id: "INV-A",
    due_date: "2026-09-13", // 47 days before AS_OF_DATE (2026-10-30).
    amount_paise: paise(34_000_000), // ₹3,40,000.
  }),
  ctx: baseCtx({
    customerHistory: new Map([["C-001", 12]]),
    signals: { brokenPromise: new Map([["INV-A", "E-001-1:emails.json:commitment_date"]]) },
  }),
};

// C — 90 days overdue, ₹6,00,000, open "incorrect amount" dispute → G4 Disputed, not scored.
export const exampleC = {
  invoice: baseInvoice({
    row_id: 15,
    invoice_id: "INV-C",
    customer_id: "C-003",
    due_date: "2026-08-01", // 90 days before AS_OF_DATE.
    amount_paise: paise(60_000_000), // ₹6,00,000.
  }),
  ctx: baseCtx({
    signals: { disputed: new Map([["INV-C", "E-011-1:emails.json:email_class"]]) },
  }),
};

// D — 20 days overdue, email says "paid yesterday", ledger unpaid → G5 Hold – reconcile.
export const exampleD = {
  invoice: baseInvoice({
    row_id: 16,
    invoice_id: "INV-D",
    customer_id: "C-004",
    due_date: "2026-10-10", // 20 days before AS_OF_DATE.
    amount_paise: paise(15_000_000),
  }),
  ctx: baseCtx({
    signals: { holdReconcile: new Map([["INV-D", "E-006-1:emails.json:email_class"]]) },
  }),
};

// B — 10 days overdue, ₹40,000, avg 2 days late. 10 + 5 + 0 = 15 → Low.
export const exampleB = {
  invoice: baseInvoice({
    row_id: 13,
    invoice_id: "INV-B",
    due_date: "2026-10-20", // 10 days before AS_OF_DATE.
    amount_paise: paise(4_000_000), // ₹40,000.
  }),
  ctx: baseCtx({
    customerHistory: new Map([["C-001", 2]]),
  }),
};

// E — due date missing. G3 → Needs review.
export const exampleE = {
  invoice: baseInvoice({
    row_id: 14,
    invoice_id: "INV-E",
    due_date: null,
    amount_paise: paise(1_000_000),
  }),
  ctx: baseCtx(),
};
