/**
 * TC-75.11 — the `/exceptions` row model: one row per exception, every kind
 * listed, subject/amount/status/priority read from stored rows only, and the
 * v1 Queue filters (search, priority, status, customer, ageing) applied.
 */
import { describe, expect, it } from "vitest";

import { paise } from "../money";
import type { RankItem } from "../priority";
import { ExceptionKindSchema, type Customer, type Exception, type Invoice, type Payment, type PriorityBand } from "../schema";
import {
  NO_EXCEPTION_FILTERS,
  buildExceptionRows,
  exceptionHref,
  exceptionStatusLabel,
  filterExceptionRows,
  type ExceptionSources,
} from "./list";

function item(id: string, band: PriorityBand, days: number | null, amount: number, customer: string): RankItem {
  const invoice: Invoice = {
    row_id: 1,
    invoice_id: id,
    invoice_number: `N-${id}`,
    customer_id: customer,
    invoice_date: "2026-01-01",
    due_date: "2026-09-01",
    amount_paise: paise(amount),
    currency: "INR",
    status_raw: "open",
    status: "open",
    billing_period: null,
    po_number: null,
  };
  return {
    invoice,
    priority: { invoice_id: id, config_version: "v1", band, factors: [], reason: "", recommended_action: "", days_overdue: days },
  };
}

const base = {
  linked_review_ids: [],
  recommendation: "",
  evidence_ids: [],
  validation_status: "validated",
  escalation_reason: "",
  requires_role: "analyst",
  status: "open",
} as const;

function exc(over: Partial<Exception> & Pick<Exception, "review_id" | "kind">): Exception {
  return { ...base, ...over } as Exception;
}

const customers = new Map<string, Customer>([
  ["C-1", { customer_id: "C-1", name: "Acme", contact_emails: [], payment_terms_days: 30, segment: "x" }],
  ["C-2", { customer_id: "C-2", name: "Globex", contact_emails: [], payment_terms_days: 30, segment: "x" }],
]);

const payments: Payment[] = [
  { payment_id: "P-1", invoice_id: null, paid_on: "2026-10-01", amount_paise: paise(2500) },
  { payment_id: "P-2", invoice_id: null, paid_on: "2026-10-02", amount_paise: paise(900) },
];

const items = [item("I-1", "high", 40, 10_000, "C-1"), item("I-2", "disputed", 10, 2500, "C-2")];

// One exception per kind (the seed has no short_payment_pattern until 79.5).
const sevenKinds: Exception[] = [
  exc({ review_id: "RV-D", kind: "draft", message_id: "M1", invoice_id: "I-1" }),
  exc({ review_id: "RV-U", kind: "uncertain_match", message_id: "M2", invoice_id: "I-1" }),
  exc({ review_id: "RV-S", kind: "dispute", message_id: "M3", invoice_id: "I-2" }),
  exc({ review_id: "RV-M", kind: "missing_info", message_id: "M4" }),
  exc({
    review_id: "RV-R",
    kind: "reconciliation",
    message_id: "M5",
    invoice_id: "I-1",
    email_amount_paise: 4200 as Exception["email_amount_paise"],
  }),
  exc({ review_id: "RV-PAY-P-1", kind: "unallocated_payment", payment_id: "P-1", candidate_invoice_ids: ["I-2"] }),
  exc({ review_id: "RV-SP", kind: "short_payment_pattern", payment_id: "P-2", candidate_invoice_ids: [], requires_role: "manager" }),
];

const src = (exceptions: Exception[]): ExceptionSources => ({ exceptions, items, customers, payments });

describe("buildExceptionRows — TC-75.11", () => {
  it("lists all 7 kinds, one row each", () => {
    const rows = buildExceptionRows(src(sevenKinds));
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(ExceptionKindSchema.options));
    expect(rows).toHaveLength(7);
  });

  it("is deterministic: same input, same order (open first, then by id)", () => {
    const shuffled = [...sevenKinds].reverse();
    expect(buildExceptionRows(src(shuffled)).map((r) => r.id)).toEqual(buildExceptionRows(src(sevenKinds)).map((r) => r.id));
  });

  it("a payment exception reads payment id + candidate customer, the payment amount and the candidate's band", () => {
    const row = buildExceptionRows(src(sevenKinds)).find((r) => r.id === "RV-PAY-P-1")!;
    expect(row).toMatchObject({
      subject: "P-1 · Globex",
      amountPaise: 2500,
      band: "disputed",
      invoiceId: "I-2",
      customerId: "C-2",
      statusLabel: "Open",
      href: "/exceptions/RV-PAY-P-1",
      muted: true,
    });
  });

  it("a payment exception with no single candidate says so", () => {
    const row = buildExceptionRows(src(sevenKinds)).find((r) => r.id === "RV-SP")!;
    expect(row).toMatchObject({ subject: "P-2 · Unapplied bank line", amountPaise: 900, band: null, invoiceId: null });
  });

  it("an email exception reads customer · invoice no.; reconciliation shows the email's amount", () => {
    const rows = buildExceptionRows(src(sevenKinds));
    expect(rows.find((r) => r.id === "RV-R")).toMatchObject({ subject: "Acme · N-I-1", amountPaise: 4200, band: "high" });
    expect(rows.find((r) => r.id === "RV-U")).toMatchObject({ subject: "Acme · N-I-1", amountPaise: 10_000 });
    expect(rows.find((r) => r.id === "RV-M")).toMatchObject({ subject: "No invoice linked", amountPaise: null, band: null });
  });

  it("status labels: Open / Pending Manager / Resolved / Dismissed", () => {
    expect(exceptionStatusLabel(exc({ review_id: "a", kind: "draft" }))).toBe("Open");
    expect(exceptionStatusLabel(exc({ review_id: "a", kind: "draft", requires_role: "manager" }))).toBe("Pending Manager");
    expect(exceptionStatusLabel(exc({ review_id: "a", kind: "draft", status: "actioned" }))).toBe("Resolved");
    expect(exceptionStatusLabel(exc({ review_id: "a", kind: "draft", status: "dismissed" }))).toBe("Dismissed");
  });

  it("encodes ids in the href", () => {
    expect(exceptionHref("RV/1 x")).toBe("/exceptions/RV%2F1%20x");
  });
});

describe("filterExceptionRows — the reused Queue filters", () => {
  const rows = buildExceptionRows(src(sevenKinds));
  const ids = (f: Partial<typeof NO_EXCEPTION_FILTERS>) =>
    filterExceptionRows(rows, { ...NO_EXCEPTION_FILTERS, ...f }).map((r) => r.id);

  it("no filters keeps every row", () => {
    expect(ids({})).toHaveLength(7);
  });

  it("search matches subject, kind label and ids, case-insensitively", () => {
    expect(ids({ q: "globex" })).toEqual(["RV-PAY-P-1", "RV-S"]);
    expect(ids({ q: "unallocated" })).toEqual(["RV-PAY-P-1"]);
    expect(ids({ q: "p-2" })).toEqual(["RV-SP"]);
  });

  it("priority, customer, status and ageing filter by the related invoice; rows without one drop out", () => {
    expect(ids({ band: ["high"] })).toEqual(["RV-D", "RV-R", "RV-U"]);
    expect(ids({ customer: ["C-2"] })).toEqual(["RV-PAY-P-1", "RV-S"]);
    expect(ids({ status: ["open"] })).toHaveLength(5);
    expect(ids({ ageing: ["31-60"] })).toEqual(["RV-D", "RV-R", "RV-U"]);
  });
});
