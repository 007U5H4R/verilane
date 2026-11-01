import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approvalState, buildDraft, DRAFT_TEMPLATE, factsFor, formatLongDate, locateFootnotes } from "./draft";
import { paise } from "./money";
import type { Customer, Invoice, VerifiedFact } from "./schema";

const invoice: Invoice = {
  row_id: 12,
  invoice_id: "INV-A",
  invoice_number: "INV-1012",
  customer_id: "C-001",
  invoice_date: "2026-08-14",
  due_date: "2026-09-13",
  amount_paise: paise(34_000_000),
  currency: "INR",
  status_raw: "Open",
  status: "open",
  billing_period: null,
  po_number: null,
};
const customer: Customer = {
  customer_id: "C-001",
  name: "Aravalli Textiles Pvt Ltd",
  contact_emails: ["ap@aravalli.example"],
  payment_terms_days: 30,
  segment: "SME",
};

describe("factsFor", () => {
  it("derives each fact from the ledger with its evidence id", () => {
    const facts = factsFor(invoice, customer, paise(34_000_000), "2026-10-30");
    const byKind = Object.fromEntries(facts.map((f) => [f.kind, f]));
    expect(byKind.invoice_number?.value).toBe("INV-1012");
    expect(byKind.invoice_number?.evidenceId).toBe("INV-A:invoices.csv:invoice_number");
    expect(byKind.customer_name?.value).toBe("Aravalli Textiles Pvt Ltd");
    expect(byKind.customer_name?.evidenceId).toBe("C-001:customers.csv:name");
    expect(byKind.amount?.value).toBe("₹3,40,000.00");
    expect(byKind.due_date?.value).toBe("13 September 2026");
    expect(byKind.days_overdue?.value).toBe("47");
    expect(byKind.contact?.value).toBe("ap@aravalli.example");
  });

  it("omits facts the ledger can't verify", () => {
    const facts = factsFor({ ...invoice, due_date: null }, undefined, paise(1), "2026-10-30");
    const kinds = facts.map((f) => f.kind);
    expect(kinds).not.toContain("due_date");
    expect(kinds).not.toContain("days_overdue");
    expect(kinds).not.toContain("customer_name");
  });

  it("omits days overdue when the invoice is not yet due", () => {
    const facts = factsFor({ ...invoice, due_date: "2026-11-30" }, customer, paise(1), "2026-10-30");
    expect(facts.map((f) => f.kind)).not.toContain("days_overdue");
  });
});

describe("buildDraft (TC-044)", () => {
  const facts = factsFor(invoice, customer, paise(34_000_000), "2026-10-30");

  it("places every body fact in a footnote span that covers its exact text", () => {
    const d = buildDraft(facts);
    const byId = new Map(facts.map((f) => [f.claimId, f]));
    expect(d.footnotes.length).toBeGreaterThanOrEqual(5);
    for (const fn of d.footnotes) {
      expect(d.body.slice(fn.span[0], fn.span[1])).toBe(byId.get(fn.claimId)?.value);
    }
    expect(d.body).toContain("INV-1012");
    expect(d.body).toContain("₹3,40,000.00");
    expect(d.body).toContain("13 September 2026");
    expect(d.subject).toContain("INV-1012");
  });

  it("the template itself holds no literal numbers or dates", () => {
    expect(JSON.stringify(DRAFT_TEMPLATE)).not.toMatch(/\d/);
    const src = readFileSync(join(process.cwd(), "src/domain/draft.ts"), "utf-8");
    const templateSrc = src.slice(src.indexOf("export const DRAFT_TEMPLATE"), src.indexOf("} as const;"));
    expect(templateSrc).not.toMatch(/\d/);
  });

  it("with no facts, the body has no digits at all", () => {
    expect(buildDraft([]).body).not.toMatch(/\d/);
  });

  it("drops a clause whose fact is missing", () => {
    const noDue = facts.filter((f) => f.kind !== "due_date" && f.kind !== "days_overdue");
    const d = buildDraft(noDue);
    expect(d.body).not.toContain("was due on");
    expect(d.body).not.toContain("days overdue");
  });
});

describe("locateFootnotes", () => {
  const facts: VerifiedFact[] = [
    { claimId: "c1", kind: "days_overdue", value: "47", evidenceId: "e1" },
    { claimId: "c2", kind: "amount", value: "₹3,40,000.00", evidenceId: "e2" },
  ];

  it("finds every occurrence at token boundaries only", () => {
    const body = "47 days, ₹3,40,000.00, not 147 or 470, again 47.";
    const spans = locateFootnotes(body, facts).map((f) => body.slice(f.span[0], f.span[1]));
    expect(spans).toEqual(["47", "₹3,40,000.00", "47"]);
  });

  it("finds nothing when the fact was edited away", () => {
    expect(locateFootnotes("₹3,00,000 is due", facts)).toEqual([]);
  });
});

describe("formatLongDate", () => {
  it("formats an ISO day", () => {
    expect(formatLongDate("2026-09-03")).toBe("3 September 2026");
  });
});

// T16-4 (TASK-33): a validated draft whose last validation left failed
// checks (e.g. approve_draft's re-check) is blocked, not awaiting approval.
describe("approvalState (T16-4)", () => {
  it("a validated draft with no failed checks is awaiting approval", () => {
    expect(approvalState({ status: "validated", failed_checks: [] })).toBe("awaiting");
  });
  it("a validated draft with failed checks is blocked", () => {
    expect(approvalState({ status: "validated", failed_checks: [3] })).toBe("blocked");
  });
  it("a draft in any other status is neither", () => {
    expect(approvalState({ status: "generated", failed_checks: [] })).toBeNull();
    expect(approvalState({ status: "sent_simulated", failed_checks: [3] })).toBeNull();
  });
  it("tolerates a row with no failed_checks field", () => {
    expect(approvalState({ status: "validated" })).toBe("awaiting");
  });
});
