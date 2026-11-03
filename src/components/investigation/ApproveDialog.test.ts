import { describe, expect, it } from "vitest";
import { approveCopy } from "./ApproveDialog";

// DES-004: the approve dialog and toast name the invoice by the number the
// user sees everywhere else (INV-1012), never the internal key (INV-A).
describe("approveCopy", () => {
  const copy = approveCopy({ invoiceNumber: "INV-1012", invoiceId: "INV-A", customerName: "Acme" });

  it("uses the invoice number in the dialog description", () => {
    expect(copy.description).toContain("INV-1012");
    expect(copy.description).not.toContain("INV-A");
  });

  it("uses the invoice number in the success and failure toasts", () => {
    expect(copy.success).toBe("Reminder for INV-1012 (Acme) approved and sent (simulated).");
    expect(copy.failure).toBe("Reminder for INV-1012 (Acme) failed re-validation and was not sent.");
  });

  it("falls back to the internal key when the invoice has no number (FS1)", () => {
    const fallback = approveCopy({ invoiceNumber: null, invoiceId: "INV-A", customerName: "Acme" });
    expect(fallback.success).toContain("INV-A");
  });
});
