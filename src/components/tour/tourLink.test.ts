import { describe, expect, it } from "vitest";

import { readTourLink } from "./tourLink";

describe("readTourLink", () => {
  it("finds tour=1 and strips only that param", () => {
    expect(readTourLink("?tour=1&__session=none")).toEqual({ tour: true, rest: "?__session=none" });
  });
  it("leaves an empty query when tour=1 was the only param", () => {
    expect(readTourLink("?tour=1")).toEqual({ tour: true, rest: "" });
  });
  it("ignores other tour values and missing params", () => {
    expect(readTourLink("?tour=0").tour).toBe(false);
    expect(readTourLink("").tour).toBe(false);
  });
});
