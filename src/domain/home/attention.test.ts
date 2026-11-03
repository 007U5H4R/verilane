import { describe, expect, it } from "vitest";

import { paise } from "../money";
import type { RankItem } from "../priority";
import type { Invoice, PriorityBand } from "../schema";
import { attentionGroups, ENTRY_LIMIT, summaryFor, type AttentionInput } from "./attention";

function item(id: string, band: PriorityBand, days: number | null, amount = 1000, customer = "C-1"): RankItem {
  const invoice: Invoice = {
    row_id: 1,
    invoice_id: id,
    invoice_number: `INV-${id}`,
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
    priority: {
      invoice_id: id,
      config_version: "v1",
      band,
      factors: [],
      reason: "",
      recommended_action: "",
      days_overdue: days,
    },
  };
}

function input(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return { items: [], payments: [], customerNames: new Map([["C-1", "Acme"]]), drafts: [], reviews: [], ...overrides };
}

describe("summaryFor", () => {
  it("keeps the count + verb sentences Home has always used", () => {
    expect(summaryFor("high", 1)).toBe("1 high-priority invoice needs a decision");
    expect(summaryFor("high", 3)).toBe("3 high-priority invoices need a decision");
    expect(summaryFor("disputed", 1)).toBe("1 disputed invoice needs dispute resolution");
    expect(summaryFor("drafts", 2)).toBe("2 reminder drafts await approval");
    expect(summaryFor("payments", 1)).toBe("1 payment email needs review");
  });
});

describe("attentionGroups", () => {
  it("returns no groups when nothing needs attention (the feed's empty state)", () => {
    expect(attentionGroups(input({ items: [item("1", "low", 3), item("2", "closed", null)] }))).toEqual([]);
  });

  it("orders groups high → disputed → drafts → payments and drops empty ones", () => {
    const groups = attentionGroups(
      input({
        items: [item("1", "disputed", 10), item("2", "high", 40)],
        reviews: [{ review_id: "R1", kind: "reconciliation", invoice_id: "1", email_amount_paise: 500 }],
      }),
    );
    expect(groups.map((g) => g.key)).toEqual(["high", "disputed", "payments"]);
  });

  it("builds invoice entries from real outstanding, customer and days overdue", () => {
    const [high] = attentionGroups(
      input({
        items: [item("1", "high", 40, 10_000)],
        payments: [{ payment_id: "P1", invoice_id: "1", paid_on: "2026-09-10", amount_paise: paise(2_500) }],
      }),
    );
    expect(high!.entries[0]).toEqual({
      id: "1",
      title: "Acme",
      detail: "INV-1",
      amountPaise: 7_500,
      daysOverdue: 40,
      href: "/invoices/1",
    });
  });

  it("never invents values: unknown customer, no days, no amount", () => {
    const groups = attentionGroups(
      input({
        items: [item("1", "high", 0, 100, "C-404")],
        reviews: [{ review_id: "R1", kind: "uncertain_match" }],
      }),
    );
    expect(groups[0]!.entries[0]!.title).toBe("Customer not available.");
    expect(groups[0]!.entries[0]!.daysOverdue).toBeNull();
    const review = groups[1]!.entries[0]!;
    expect(review).toMatchObject({ title: "Uncertain payment match", detail: "No invoice linked", amountPaise: null, href: "/payments" });
  });

  it("labels drafts with the customer and invoice number and caps entries at the limit", () => {
    const drafts = Array.from({ length: ENTRY_LIMIT + 2 }, (_, i) => ({
      draft_id: `DR-${i}`,
      invoice_id: "1",
      customer_id: "C-1",
      amount_paise: 900,
    }));
    const [group] = attentionGroups(input({ items: [item("1", "low", 3)], drafts }));
    expect(group!.key).toBe("drafts");
    expect(group!.total).toBe(ENTRY_LIMIT + 2);
    expect(group!.entries).toHaveLength(ENTRY_LIMIT);
    expect(group!.entries[0]).toMatchObject({ title: "Acme", detail: "INV-1", amountPaise: 900, href: "/invoices/1" });
  });
});
