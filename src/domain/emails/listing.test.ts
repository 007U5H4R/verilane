import { describe, expect, it } from "vitest";
import type { Dispute, Exception } from "@/domain/schema";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filterThreads,
  kpisFor,
  paginate,
  parseFilters,
  serializeFilters,
  sortThreads,
} from "./listing";
import type { EmailThread } from "./threads";

function thread(id: string, over: Partial<EmailThread> = {}): EmailThread {
  const msg = {
    email: { thread_id: id, message_id: `${id}-1`, from_address: `${id.toLowerCase()}@x.test`, sent_at: "2026-10-01T00:00:00Z", subject: `About ${id}`, body: "" },
    reviews: [],
    disputes: [],
  };
  return {
    thread_id: id,
    subject: `About ${id}`,
    messages: [msg],
    latest: msg,
    firstSentAt: "2026-10-01T00:00:00Z",
    lastSentAt: "2026-10-01T00:00:00Z",
    intents: [],
    outcomes: [],
    invoices: [],
    refs: [],
    candidates: [],
    disputes: [],
    openReviews: [],
    rejected: 0,
    ...over,
  };
}

describe("parseFilters / serializeFilters", () => {
  it("omits defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips every key", () => {
    const f = { q: "acme", customer: "C-1", intent: "dispute", outcome: "ambiguous", linked: "review", sort: "oldest", page: 2, thread: "E-001" } as const;
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f);
  });

  it("drops unknown values and bad pages", () => {
    const f = parseFilters(new URLSearchParams("intent=nope&outcome=x&linked=y&sort=z&page=-3"));
    expect(f).toEqual(DEFAULT_FILTERS);
    expect(parseFilters(new URLSearchParams("page=1.5")).page).toBe(1);
    expect(parseFilters(new URLSearchParams("intent=rejected")).intent).toBe("rejected");
  });

  it("counts only the facet filters as active", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: "oldest", page: 3, thread: "x" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: " a ", customer: "C", linked: "dispute" })).toBe(3);
  });
});

describe("filterThreads", () => {
  const dispute = { dispute_id: "D-1" } as Dispute;
  const openReview = { review_id: "R-1" } as Exception;
  const threads = [
    thread("T-1", { customer_id: "C-1", customerName: "Acme Ltd", intents: ["dispute"], outcomes: ["matched"], invoices: [{ invoice_id: "INV-A", label: "INV-1012" }], disputes: [dispute] }),
    thread("T-2", { customer_id: "C-2", customerName: "Beta", intents: ["commitment"], outcomes: ["ambiguous"], refs: ["INV-2000"], openReviews: [openReview], rejected: 1 }),
    thread("T-3", { intents: ["unknown"] }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterThreads(threads, { ...DEFAULT_FILTERS, ...f }).map((t) => t.thread_id);

  it("searches customer, subject, invoice numbers and refs", () => {
    expect(ids({ q: "acme" })).toEqual(["T-1"]);
    expect(ids({ q: "about t-3" })).toEqual(["T-3"]);
    expect(ids({ q: "inv-1012" })).toEqual(["T-1"]);
    expect(ids({ q: "INV-2000" })).toEqual(["T-2"]);
    expect(ids({ q: "  " })).toEqual(["T-1", "T-2", "T-3"]);
  });

  it("filters by customer, intent, rejected and outcome", () => {
    expect(ids({ customer: "C-2" })).toEqual(["T-2"]);
    expect(ids({ intent: "unknown" })).toEqual(["T-3"]);
    expect(ids({ intent: "rejected" })).toEqual(["T-2"]);
    expect(ids({ outcome: "matched" })).toEqual(["T-1"]);
  });

  it("filters by linked status", () => {
    expect(ids({ linked: "invoice" })).toEqual(["T-1"]);
    expect(ids({ linked: "dispute" })).toEqual(["T-1"]);
    expect(ids({ linked: "review" })).toEqual(["T-2"]);
    expect(ids({ linked: "unlinked" })).toEqual(["T-2", "T-3"]);
  });
});

describe("sortThreads", () => {
  const a = thread("A", { lastSentAt: "2026-10-01T00:00:00Z" });
  const b = thread("B", { lastSentAt: "2026-10-03T00:00:00Z" });
  const c = thread("C", { lastSentAt: "2026-10-03T00:00:00Z" });
  it("orders latest or oldest first with a stable tie-break", () => {
    expect(sortThreads([a, c, b], "latest").map((t) => t.thread_id)).toEqual(["B", "C", "A"]);
    expect(sortThreads([c, b, a], "oldest").map((t) => t.thread_id)).toEqual(["A", "B", "C"]);
  });
});

describe("kpisFor", () => {
  it("counts threads, messages, customers, review, dispute and rejected", () => {
    const k = kpisFor([
      thread("T-1", { customer_id: "C-1", disputes: [{} as Dispute] }),
      thread("T-2", { customer_id: "C-1", openReviews: [{} as Exception], rejected: 2 }),
      thread("T-3"),
    ]);
    expect(k).toEqual({ threads: 3, messages: 3, customers: 1, needsReview: 1, linkedToDispute: 1, rejected: 2 });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  it("slices pages and clamps out-of-range pages", () => {
    expect(paginate(items, 1)).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 10, total: 23 });
    expect(paginate(items, 3).items).toEqual([20, 21, 22]);
    expect(paginate(items, 9)).toMatchObject({ page: 3, from: 21, to: 23 });
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});
