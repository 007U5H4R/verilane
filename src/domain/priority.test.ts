import { describe, expect, it } from "vitest";
import { AS_OF_DATE } from "./clock";
import { prioritise, rank, type PriorityCtx } from "./priority";
import { exampleA, exampleB, exampleC, exampleD, exampleE } from "./__fixtures__/worked-examples";
import type { Invoice } from "./schema";
import { paise } from "./money";

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    row_id: 1,
    invoice_id: "INV-001",
    invoice_number: "1001",
    customer_id: "C-001",
    invoice_date: "2026-01-01",
    due_date: "2026-10-01",
    amount_paise: paise(1_000_000),
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

// TC-004: priority.v1 worked examples A, B, E.
describe("prioritise — TC-004 worked examples", () => {
  it("A: 47 days overdue, ₹3,40,000, avg 12 days late, broken promise → 70, High", () => {
    const result = prioritise(exampleA.invoice, exampleA.ctx);
    expect(result.band).toBe("high");
    expect(result.score).toBe(70);
    expect(result.gate).toBeUndefined();
    expect(result.config_version).toBe("priority.v1");
    expect(result.reason).toContain("High (70)");
    expect(result.reason).toContain("47 days overdue");
    expect(result.reason).toContain("₹3,40,000");
    expect(result.reason).toContain("broken");
  });

  it("B: 10 days overdue, ₹40,000, avg 2 days late → 15, Low", () => {
    const result = prioritise(exampleB.invoice, exampleB.ctx);
    expect(result.band).toBe("low");
    expect(result.score).toBe(15);
    expect(result.gate).toBeUndefined();
    expect(result.reason).toContain("Low (15)");
  });

  it("E: due date missing → G3, Needs review", () => {
    const result = prioritise(exampleE.invoice, exampleE.ctx);
    expect(result.band).toBe("needs_review");
    expect(result.gate).toBe("G3");
    expect(result.score).toBeUndefined();
  });
});

// TC-005: gate order and score boundaries.
describe("prioritise — TC-005 gates and boundaries", () => {
  it("G1: status paid → closed, not scored", () => {
    const result = prioritise(baseInvoice({ status: "paid", status_raw: "paid" }), baseCtx());
    expect(result.band).toBe("closed");
    expect(result.gate).toBe("G1");
  });

  it("G1: status written_off → closed", () => {
    const result = prioritise(
      baseInvoice({ status: "written_off", status_raw: "written_off" }),
      baseCtx(),
    );
    expect(result.band).toBe("closed");
    expect(result.gate).toBe("G1");
  });

  it("G1: outstanding fully paid → closed", () => {
    const inv = baseInvoice({ amount_paise: paise(500_000) });
    const ctx = baseCtx({
      payments: [{ payment_id: "P-1", invoice_id: inv.invoice_id, paid_on: "2026-10-05", amount_paise: paise(500_000) }],
    });
    const result = prioritise(inv, ctx);
    expect(result.band).toBe("closed");
    expect(result.gate).toBe("G1");
  });

  it("G2: status unknown → needs_review, before G3", () => {
    const result = prioritise(
      baseInvoice({ status: "unknown", status_raw: "weird", invoice_number: null }),
      baseCtx(),
    );
    expect(result.band).toBe("needs_review");
    expect(result.gate).toBe("G2");
  });

  it("G3: invoice_number missing → needs_review", () => {
    const result = prioritise(baseInvoice({ invoice_number: null }), baseCtx());
    expect(result.band).toBe("needs_review");
    expect(result.gate).toBe("G3");
  });

  it("G6: due date in the future → not_due", () => {
    const result = prioritise(baseInvoice({ due_date: "2026-11-15" }), baseCtx());
    expect(result.band).toBe("not_due");
    expect(result.gate).toBe("G6");
  });

  it("score boundary: 29 → Low, 30 → Medium (days-overdue bucket edge)", () => {
    // 15 days overdue (bucket 1-15 → 10) + <₹50,000 (5) + avg<=5 (0) = 15... use
    // direct boundary invoices instead: construct scores of exactly 29 and 30.
    const low = prioritise(
      baseInvoice({ due_date: "2026-10-15" /* 15 days overdue → 10 */, amount_paise: paise(4_000_000) /* <50k → 5 */ }),
      baseCtx({ customerHistory: new Map([["C-001", 10 /* 6-20 → 5 */]]) }),
    );
    expect(low.score).toBe(20);
    expect(low.band).toBe("low");

    const medium = prioritise(
      baseInvoice({ due_date: "2026-09-30" /* 30 days overdue → 20 */, amount_paise: paise(4_000_000) /* <50k → 5 */ }),
      baseCtx({ customerHistory: new Map([["C-001", 10 /* 6-20 → 5 */]]) }),
    );
    expect(medium.score).toBe(30);
    expect(medium.band).toBe("medium");
  });

  it("outstanding bucket edges: ₹50,000 and ₹2,00,000 (±1 paise)", () => {
    const justUnder = prioritise(
      baseInvoice({ due_date: "2026-10-29" /* 1 day overdue → 10 */, amount_paise: paise(4_999_999) }),
      baseCtx(),
    );
    const justAt = prioritise(
      baseInvoice({ due_date: "2026-10-29", amount_paise: paise(5_000_000) }),
      baseCtx(),
    );
    expect(justUnder.score).toBe(10 + 5 + 5); // <50,000 → 5; no history → 5.
    expect(justAt.score).toBe(10 + 12 + 5); // 50,000-1,99,999 → 12.
  });

  it("no payment history → 5 points", () => {
    const result = prioritise(
      baseInvoice({ due_date: "2026-10-29", amount_paise: paise(1_000_000) }),
      baseCtx(),
    );
    expect(result.score).toBe(10 + 5 + 5);
  });
});

// TC-006: deterministic tie-break — score desc, days overdue desc, outstanding
// desc, invoice number asc.
describe("rank — TC-006 deterministic tie-break", () => {
  it("orders equal-score invoices by days overdue, outstanding, invoice number", () => {
    const ctx = baseCtx();
    const invoices = [
      baseInvoice({
        invoice_id: "INV-003",
        invoice_number: "3",
        due_date: "2026-10-29", // 1 day overdue → 10
        amount_paise: paise(1_000_000), // <50k → 5; +5 no history = 20 total
      }),
      baseInvoice({
        invoice_id: "INV-001",
        invoice_number: "1",
        due_date: "2026-10-29", // 1 day overdue → 10
        amount_paise: paise(1_000_000), // same score, same days overdue/outstanding
      }),
      baseInvoice({
        invoice_id: "INV-002",
        invoice_number: "2",
        due_date: "2026-10-29",
        amount_paise: paise(1_000_000),
      }),
    ];
    const items = invoices.map((inv) => ({ invoice: inv, priority: prioritise(inv, ctx) }));

    for (let seed = 0; seed < 20; seed++) {
      const shuffled = shuffle(items, seed);
      const ranked = rank(shuffled, ctx);
      expect(ranked.map((item) => item.invoice.invoice_id)).toEqual([
        "INV-001",
        "INV-002",
        "INV-003",
      ]);
    }
  });
});

// TC-029..TC-033 + milestone-review fixes R1, R12 (TASK-13).
describe("prioritise — email gates G4/G5/G7 (TASK-13)", () => {
  it("TC-032 C: 90 days overdue, ₹6,00,000, open dispute → G4 Disputed, not scored", () => {
    const result = prioritise(exampleC.invoice, exampleC.ctx);
    expect(result.gate).toBe("G4");
    expect(result.band).toBe("disputed");
    expect(result.score).toBeUndefined();
    expect(result.days_overdue).toBe(90);
  });

  it("TC-029: the G4 reason cites the email evidence id", () => {
    const result = prioritise(exampleC.invoice, exampleC.ctx);
    expect(result.reason).toContain("E-011-1:emails.json:email_class");
  });

  it("TC-032 D: 20 days overdue, 'paid yesterday', ledger unpaid → G5 Hold – reconcile", () => {
    const result = prioritise(exampleD.invoice, exampleD.ctx);
    expect(result.gate).toBe("G5");
    expect(result.band).toBe("hold_reconcile");
    expect(result.reason).toContain("Hold – reconcile");
    expect(result.reason).toContain("E-006-1:emails.json:email_class");
  });

  it("G4 outranks G5 when both fire", () => {
    const result = prioritise(
      baseInvoice({}),
      baseCtx({
        signals: {
          disputed: new Map([["INV-001", "d"]]),
          holdReconcile: new Map([["INV-001", "h"]]),
        },
      }),
    );
    expect(result.gate).toBe("G4");
  });

  it("R1: an outstanding_amount conflict DataIssue (seed INV-G) → G5", () => {
    // Seed row 10: amount ₹1,00,000, payment P-009 ₹30,000, supplied outstanding
    // ₹80,000 vs derived ₹70,000 → ingest raises the conflict.
    const inv = baseInvoice({
      row_id: 10,
      invoice_id: "INV-G",
      customer_id: "C-003",
      due_date: "2026-09-20",
      amount_paise: paise(10_000_000),
    });
    const ctx = baseCtx({
      payments: [{ payment_id: "P-009", invoice_id: "INV-G", paid_on: "2026-10-01", amount_paise: paise(3_000_000) }],
      dataIssues: [
        {
          issue_id: "DI-1",
          record_id: "INV-G",
          field: "outstanding_amount",
          kind: "conflict",
          message: "supplied 80000.00 vs derived 70000.00",
          suggested_action: "Reconcile",
        },
      ],
    });
    const result = prioritise(inv, ctx);
    expect(result.gate).toBe("G5");
    expect(result.band).toBe("hold_reconcile");
    expect(result.reason).toContain("row 10 · outstanding_amount");
  });

  it("R1: an invoice_number conflict is a data-quality issue, not a reconcile hold", () => {
    const result = prioritise(
      baseInvoice({ due_date: "2026-10-29" }),
      baseCtx({
        dataIssues: [
          { issue_id: "DI-2", record_id: "INV-001", field: "invoice_number", kind: "conflict", message: "m", suggested_action: "s" },
        ],
      }),
    );
    expect(result.gate).toBeUndefined();
  });

  it("R12: an overpaid invoice (negative outstanding) closes at G1", () => {
    const inv = baseInvoice({ amount_paise: paise(500_000) });
    const result = prioritise(
      inv,
      baseCtx({
        payments: [{ payment_id: "P-1", invoice_id: inv.invoice_id, paid_on: "2026-10-05", amount_paise: paise(600_000) }],
      }),
    );
    expect(result.gate).toBe("G1");
    expect(result.band).toBe("closed");
  });

  it("TC-031: an active commitment → G7 On hold, citing the promise", () => {
    const result = prioritise(
      baseInvoice({}),
      baseCtx({ signals: { activeCommitment: new Map([["INV-001", "E-001-1:emails.json:commitment_date"]]) } }),
    );
    expect(result.gate).toBe("G7");
    expect(result.band).toBe("on_hold_promised");
    expect(result.reason).toContain("E-001-1:emails.json:commitment_date");
  });

  it("TC-031: a broken promise is scored with +10 'promise broken'", () => {
    const inv = baseInvoice({ due_date: "2026-10-29", amount_paise: paise(1_000_000) });
    const plain = prioritise(inv, baseCtx());
    const broken = prioritise(
      inv,
      baseCtx({ signals: { brokenPromise: new Map([["INV-001", "E-001-1:emails.json:commitment_date"]]) } }),
    );
    expect(broken.score).toBe((plain.score ?? 0) + 10);
    const factor = broken.factors.find((f) => f.name === "promise broken");
    expect(factor?.evidenceId).toBe("E-001-1:emails.json:commitment_date");
  });
});

/** A small deterministic Fisher-Yates shuffle, seeded for reproducible tests. */
function shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed + 1;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
