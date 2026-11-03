import { describe, expect, it } from "vitest";
import { extractTokens } from "./extract";

function msg(body: string, sent_at = "2026-10-28T09:00:00Z") {
  return { body, sent_at };
}

// TC-021: token extraction — refs, amounts, absolute and relative dates.
describe("extractTokens (TC-021)", () => {
  it("normalises a lower-case ref to INV-<digits>", () => {
    expect(extractTokens(msg("about inv-1042, please")).refs).toEqual(["INV-1042"]);
  });

  it("dedupes refs in order of first appearance", () => {
    const t = extractTokens(msg("INV-1020 duplicates INV-1019. Cancel INV-1020."));
    expect(t.refs).toEqual(["INV-1020", "INV-1019"]);
  });

  it("parses lakh amounts into paise", () => {
    expect(extractTokens(msg("we will pay ₹3.4 lakh soon")).amounts).toEqual([34_000_000]);
  });

  it("parses grouped rupee amounts with ₹ / Rs. / INR prefixes, deduped, in order", () => {
    const t = extractTokens(msg("₹3,40,000 now, Rs. 95,000 later, INR 1,20,000 and ₹3,40,000 again"));
    expect(t.amounts).toEqual([34_000_000, 9_500_000, 12_000_000]);
  });

  it("does not read UTRs, PO numbers or invoice numbers as amounts", () => {
    const t = extractTokens(msg("INV-1042 paid, UTR GSW2610270042, PO 4500012345"));
    expect(t.amounts).toEqual([]);
  });

  it("reads `30 Oct 2026` and full month names", () => {
    expect(extractTokens(msg("due 30 Oct 2026")).dates.map((d) => d.iso)).toEqual(["2026-10-30"]);
    expect(extractTokens(msg("by 6 November 2026")).dates.map((d) => d.iso)).toEqual(["2026-11-06"]);
  });

  it("reads ISO dates", () => {
    expect(extractTokens(msg("Payment date is 2026-11-12.")).dates.map((d) => d.iso)).toEqual([
      "2026-11-12",
    ]);
  });

  it("reads numeric dates as DD/MM, never MM/DD", () => {
    expect(extractTokens(msg("on 05/11/2026")).dates.map((d) => d.iso)).toEqual(["2026-11-05"]);
  });

  it("defaults a missing year to the sent year", () => {
    expect(extractTokens(msg("on 05/11")).dates.map((d) => d.iso)).toEqual(["2026-11-05"]);
  });

  it("rejects impossible dates", () => {
    expect(extractTokens(msg("on 31/02/2026")).dates).toEqual([]);
  });

  it("resolves `next Friday` against sent_at (Wed 2026-10-28 → 2026-11-06)", () => {
    const t = extractTokens(msg("we will pay by next Friday", "2026-10-28T09:00:00Z"));
    expect(t.relativeDates.map((d) => [d.text.toLowerCase(), d.resolved])).toEqual([
      ["next friday", "2026-11-06"],
    ]);
  });

  it("resolves today / yesterday / tomorrow from the sent date", () => {
    const sent = "2026-10-29T08:20:00Z";
    expect(extractTokens(msg("paid yesterday", sent)).relativeDates[0]?.resolved).toBe("2026-10-28");
    expect(extractTokens(msg("processed today", sent)).relativeDates[0]?.resolved).toBe("2026-10-29");
    expect(extractTokens(msg("pay tomorrow", sent)).relativeDates[0]?.resolved).toBe("2026-10-30");
  });

  it("resolves `last <weekday>` / `on <weekday>` to the most recent such day before sent", () => {
    const sent = "2026-10-28T09:00:00Z"; // Wednesday
    expect(extractTokens(msg("paid last Monday", sent)).relativeDates[0]?.resolved).toBe("2026-10-26");
    expect(extractTokens(msg("we paid on Wednesday", sent)).relativeDates[0]?.resolved).toBe(
      "2026-10-21",
    );
  });

  it("resolves `in two weeks` and `end of this month`", () => {
    const sent = "2026-10-28T09:00:00Z";
    expect(extractTokens(msg("in two weeks", sent)).relativeDates[0]?.resolved).toBe("2026-11-11");
    expect(extractTokens(msg("by end of this month", sent)).relativeDates[0]?.resolved).toBe(
      "2026-10-31",
    );
  });

  it("returns every date (absolute + relative) with its position, in text order", () => {
    const t = extractTokens(msg("paid yesterday; balance by 15/11/2026", "2026-10-29T08:20:00Z"));
    expect(t.allDates.map((d) => d.iso)).toEqual(["2026-10-28", "2026-11-15"]);
  });
});
