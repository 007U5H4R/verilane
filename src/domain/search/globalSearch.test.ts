import { describe, expect, it } from "vitest";
import type { Customer, EmailMessage, Invoice } from "@/domain/schema";
import { buildSearchIndex, searchIndex } from "./globalSearch";

const customers = [
  { customer_id: "C-1", name: "Acme Traders", contact_emails: ["ap@acme.test"], payment_terms_days: 30, segment: "smb" },
  { customer_id: "C-2", name: "Blue Fern Ltd", contact_emails: ["pay@bluefern.test"], payment_terms_days: 45, segment: "mid" },
] as Customer[];
const invoices = [
  { invoice_id: "INV-001", invoice_number: "INV-001", customer_id: "C-1", po_number: "PO-9" },
  { invoice_id: "INV-002", invoice_number: null, customer_id: "C-2", po_number: null },
] as unknown as Invoice[];
const emails = [
  { message_id: "M-1", thread_id: "T-1", from_address: "ap@acme.test", sent_at: "2026-10-01T10:00:00Z", subject: "Re: INV-001 payment", body: "" },
] as EmailMessage[];

const index = buildSearchIndex({ invoices, customers, emails });

describe("global search", () => {
  it("indexes one entry per invoice, customer and email", () => {
    expect(index.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "invoice:INV-001",
      "invoice:INV-002",
      "customer:C-1",
      "customer:C-2",
      "email:M-1",
    ]);
  });

  it("finds an invoice by its customer's name and links to the invoice", () => {
    const hits = searchIndex(index, "blue fern");
    expect(hits.map((h) => h.id)).toEqual(["INV-002", "C-2"]);
    expect(hits[0]!.href).toBe("/invoices/INV-002");
  });

  it("matches every word, case-insensitively, across kinds in kind order", () => {
    expect(searchIndex(index, "INV-001").map((h) => `${h.kind}:${h.id}`)).toEqual(["invoice:INV-001", "email:M-1"]);
    expect(searchIndex(index, "acme payment").map((h) => h.id)).toEqual(["M-1"]);
  });

  it("returns nothing for a blank query and caps each kind", () => {
    expect(searchIndex(index, "   ")).toEqual([]);
    expect(searchIndex(index, "inv", 1).filter((h) => h.kind === "invoice")).toHaveLength(1);
  });

  it("links customers to their invoices and emails to their thread", () => {
    const byId = Object.fromEntries(index.map((e) => [e.id, e.href]));
    expect(byId["C-1"]).toBe("/invoices?customer=C-1");
    expect(byId["M-1"]).toBe("/emails?thread=T-1");
  });
});
