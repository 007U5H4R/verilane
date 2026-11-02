import { describe, expect, it } from "vitest";
import { crumbsFor, navHrefFor } from "./breadcrumb";

// TASK-34 (ledger follow-up): detail routes showed "Home" in the top bar.
describe("crumbsFor", () => {
  it("names a nav route by its label", () => {
    expect(crumbsFor("/")).toEqual([{ label: "Home" }]);
    expect(crumbsFor("/queue")).toEqual([{ label: "Collection Queue" }]);
    expect(crumbsFor("/payments")).toEqual([{ label: "Payments" }]);
  });

  // T34-1: the label is the id until the rendering component resolves it to
  // what the page shows (invoice number / customer); crumbsFor stays pure.
  it("puts an invoice under the Queue, resolved by invoice id", () => {
    expect(crumbsFor("/invoices/INV-042")).toEqual([
      { label: "Collection Queue", href: "/queue" },
      { label: "INV-042", resolve: { kind: "invoice", id: "INV-042" } },
    ]);
  });

  it("puts a dispute under Disputes, resolved by dispute id", () => {
    expect(crumbsFor("/disputes/D-003")).toEqual([
      { label: "Disputes", href: "/disputes" },
      { label: "D-003", resolve: { kind: "dispute", id: "D-003" } },
    ]);
  });

  it("puts the eval report under Settings", () => {
    expect(crumbsFor("/settings/eval")).toEqual([
      { label: "Settings", href: "/settings" },
      { label: "Evaluation report" },
    ]);
  });

  it("ignores a trailing slash and decodes the id", () => {
    expect(crumbsFor("/invoices/INV%20042/")).toEqual([
      { label: "Collection Queue", href: "/queue" },
      { label: "INV 042", resolve: { kind: "invoice", id: "INV 042" } },
    ]);
  });

  // T34-5: an unknown route must not announce "Home, current page".
  it("claims no current page for an unknown route", () => {
    expect(crumbsFor("/nope/deeper/still")).toEqual([]);
    expect(crumbsFor("/e2e-harness")).toEqual([]);
    expect(crumbsFor("/invoices/x/y")).toEqual([]);
  });
});

// T34-6: the sidebar highlighted Home on detail pages; it must follow the trail.
describe("navHrefFor", () => {
  it("highlights a nav route itself", () => {
    expect(navHrefFor("/")).toBe("/");
    expect(navHrefFor("/drafts/")).toBe("/drafts");
  });

  it("highlights the parent section of a detail or sub page", () => {
    expect(navHrefFor("/invoices/INV-042")).toBe("/queue");
    expect(navHrefFor("/disputes/D-003")).toBe("/disputes");
    expect(navHrefFor("/settings/eval")).toBe("/settings");
  });

  it("highlights nothing for an unknown route", () => {
    expect(navHrefFor("/nope")).toBeUndefined();
    expect(navHrefFor("/invoices/x/y")).toBeUndefined();
  });
});
