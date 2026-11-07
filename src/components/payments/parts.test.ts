/**
 * M3 (79.1 review) — `InvoiceRef`: a null invoice renders plain "Unapplied"
 * text, never a link to `/invoices/null`; an id renders a link to the invoice.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceRef } from "./parts";

describe("InvoiceRef", () => {
  it("null invoice_id renders “Unapplied” with no anchor", () => {
    const out = renderToStaticMarkup(createElement(InvoiceRef, { invoiceId: null, label: "ignored" }));
    expect(out).toContain("Unapplied");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("/invoices/");
  });

  it("an invoice id renders an anchor to /invoices/<id> with its label", () => {
    const out = renderToStaticMarkup(createElement(InvoiceRef, { invoiceId: "INV-F", label: "VL-1006" }));
    expect(out).toMatch(/<a[^>]*href="\/invoices\/INV-F"[^>]*>VL-1006<\/a>/);
  });

  it("falls back to the id when there is no label", () => {
    const out = renderToStaticMarkup(createElement(InvoiceRef, { invoiceId: "INV-F" }));
    expect(out).toMatch(/>INV-F<\/a>/);
  });
});
