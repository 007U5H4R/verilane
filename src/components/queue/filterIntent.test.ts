import { describe, expect, it } from "vitest";
import { applyUpdate, initIntent, onUrl } from "./filterIntent";
import { DEFAULT_FILTERS, parse, type QueueFilters } from "./queueParams";

const toggleBand = (band: QueueFilters["band"][number]) => (f: QueueFilters): QueueFilters => ({
  ...f,
  band: f.band.includes(band) ? f.band.filter((b) => b !== band) : [...f.band, band],
  page: 1,
});

describe("filter intent (rapid facet toggles)", () => {
  it("keeps both toggles when the second lands before the URL updates", () => {
    // Two clicks, no URL update in between (router.push still in flight).
    let s = initIntent(DEFAULT_FILTERS);
    const first = applyUpdate(s, toggleBand("disputed"));
    s = first.state;
    const second = applyUpdate(s, toggleBand("on_hold_promised"));
    expect(second.qs).toBe("band=disputed,on_hold_promised");
  });

  it("does not regress to an intermediate URL while a later push is pending", () => {
    let s = initIntent(DEFAULT_FILTERS);
    const a = applyUpdate(s, toggleBand("disputed"));
    const b = applyUpdate(a.state, toggleBand("on_hold_promised"));
    // The URL catches up to the first push only; a third click must still build on both.
    s = onUrl(b.state, parse(new URLSearchParams(a.qs)));
    const c = applyUpdate(s, toggleBand("high"));
    expect(parse(new URLSearchParams(c.qs)).band).toEqual(["disputed", "on_hold_promised", "high"]);
    // Once the URL reaches the last push, nothing is pending.
    s = onUrl(c.state, parse(new URLSearchParams(c.qs)));
    expect(s.pending).toEqual([]);
  });

  it("follows the URL when it changes for another reason (Back, shared link)", () => {
    const a = applyUpdate(initIntent(DEFAULT_FILTERS), toggleBand("disputed"));
    const back = { ...DEFAULT_FILTERS, band: ["high" as const] };
    const s = onUrl(a.state, back);
    expect(s.latest).toEqual(back);
    expect(s.pending).toEqual([]);
  });
});
