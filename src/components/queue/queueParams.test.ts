import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  ageingBucketOf,
  parse,
  serialize,
  type QueueFilters,
} from "./queueParams";

const full: QueueFilters = {
  q: "Aravalli & Sons, 60+",
  band: ["high", "disputed"],
  status: ["open", "partially_paid"],
  customer: ["CUST-001", "CUST-002"],
  ageing: ["16-30", "60+"],
  sort: { column: "outstanding", desc: true },
  page: 2,
};

describe("queueParams (TC-017)", () => {
  it("TC-017: parse(serialize(f)) deep-equals f", () => {
    const cases: QueueFilters[] = [
      DEFAULT_FILTERS,
      full,
      { ...DEFAULT_FILTERS, sort: { column: "outstanding", desc: false } },
      { ...DEFAULT_FILTERS, sort: { column: "customer", desc: true } },
      { ...DEFAULT_FILTERS, sort: { column: "invoice_number", desc: false } },
      { ...DEFAULT_FILTERS, page: 7 },
      { ...DEFAULT_FILTERS, sort: { column: "due_date", desc: false } },
      { ...DEFAULT_FILTERS, sort: { column: "due_date", desc: true } },
    ];
    for (const f of cases) {
      expect(parse(new URLSearchParams(serialize(f)))).toEqual(f);
    }
  });

  it("serializes defaults to an empty string and keeps the key order", () => {
    expect(serialize(DEFAULT_FILTERS)).toBe("");
    const keys = [...new URLSearchParams(serialize(full)).keys()];
    expect(keys).toEqual(["q", "band", "status", "customer", "ageing", "sort", "page"]);
  });

  it("reads the shared TC-017 URL: sort=outstanding means descending", () => {
    expect(parse(new URLSearchParams("band=high&sort=outstanding&page=2"))).toEqual({
      ...DEFAULT_FILTERS,
      band: ["high"],
      sort: { column: "outstanding", desc: true },
      page: 2,
    });
    expect(serialize({ ...DEFAULT_FILTERS, band: ["high"], sort: { column: "outstanding", desc: true }, page: 2 })).toBe(
      "band=high&sort=outstanding&page=2",
    );
  });

  it("drops unknown values and malformed pages instead of throwing", () => {
    expect(
      parse(new URLSearchParams("band=high,bogus&status=nope&ageing=99&sort=wat&page=-3&__state=empty")),
    ).toEqual({ ...DEFAULT_FILTERS, band: ["high"] });
    expect(parse(new URLSearchParams("page=abc")).page).toBe(1);
    expect(parse(new URLSearchParams("sort=customer.sideways")).sort).toBeNull();
  });

  it("counts active filters (search + each facet with a value; not sort/page)", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount(full)).toBe(5);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: "   " })).toBe(0);
  });

  it("buckets days overdue as 1–15 / 16–30 / 31–60 / 60+", () => {
    expect(ageingBucketOf(null)).toBeNull();
    expect(ageingBucketOf(0)).toBeNull();
    expect(ageingBucketOf(1)).toBe("1-15");
    expect(ageingBucketOf(15)).toBe("1-15");
    expect(ageingBucketOf(16)).toBe("16-30");
    expect(ageingBucketOf(30)).toBe("16-30");
    expect(ageingBucketOf(31)).toBe("31-60");
    expect(ageingBucketOf(60)).toBe("31-60");
    expect(ageingBucketOf(61)).toBe("60+");
  });
});
