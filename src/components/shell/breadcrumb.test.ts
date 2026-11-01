import { describe, expect, it } from "vitest";
import { crumbsFor } from "./breadcrumb";

// TASK-34 (ledger follow-up): detail routes showed "Home" in the top bar.
describe("crumbsFor", () => {
  it("names a nav route by its label", () => {
    expect(crumbsFor("/")).toEqual([{ label: "Home" }]);
    expect(crumbsFor("/queue")).toEqual([{ label: "Queue" }]);
    expect(crumbsFor("/payments")).toEqual([{ label: "Payments" }]);
  });

  it("puts an invoice under the Queue (Design.md mockup: Queue › invoice)", () => {
    expect(crumbsFor("/invoices/INV-042")).toEqual([{ label: "Queue", href: "/queue" }, { label: "INV-042" }]);
  });

  it("puts a dispute under Disputes", () => {
    expect(crumbsFor("/disputes/D-003")).toEqual([{ label: "Disputes", href: "/disputes" }, { label: "D-003" }]);
  });

  it("puts the eval report under Settings", () => {
    expect(crumbsFor("/settings/eval")).toEqual([
      { label: "Settings", href: "/settings" },
      { label: "Evaluation report" },
    ]);
  });

  it("ignores a trailing slash and decodes the id", () => {
    expect(crumbsFor("/invoices/INV%20042/")).toEqual([{ label: "Queue", href: "/queue" }, { label: "INV 042" }]);
  });

  it("falls back to Home for an unknown route", () => {
    expect(crumbsFor("/nope/deeper/still")).toEqual([{ label: "Home" }]);
  });
});
