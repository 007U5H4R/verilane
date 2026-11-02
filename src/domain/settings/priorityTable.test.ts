import { describe, expect, it } from "vitest";
import {
  bandForScore,
  bandRangeLabel,
  buildPriorityTable,
  factorPoints,
  PRIORITY_BANDS,
  PRIORITY_FACTOR_SPECS,
  scoreProbe,
} from "./priorityTable";

describe("buildPriorityTable", () => {
  const table = buildPriorityTable();

  it("reads the config version from the engine", () => {
    expect(table.version).toBe("priority.v1");
  });

  it("renders the engine's points for every bracket", () => {
    expect(table.rows.map((r) => [r.key, r.when, r.pointsLabel])).toEqual([
      ["days", "61 or more", "45"],
      ["days", "31 to 60", "35"],
      ["days", "16 to 30", "20"],
      ["days", "1 to 15", "10"],
      ["days", "Not overdue", "0"],
      ["outstanding", "₹5,00,000 or more", "30"],
      ["outstanding", "₹2,00,000 to ₹4,99,999", "20"],
      ["outstanding", "₹50,000 to ₹1,99,999", "12"],
      ["outstanding", "Under ₹50,000", "5"],
      ["behavior", "No payment history", "5"],
      ["behavior", "5 or fewer", "0"],
      ["behavior", "More than 5, up to 20", "5"],
      ["behavior", "More than 20, up to 45", "10"],
      ["behavior", "More than 45", "15"],
      ["promise", "Promise date passed unpaid", "+10"],
    ]);
  });

  it("marks the first row of each factor group", () => {
    expect(table.rows.filter((r) => r.first).map((r) => r.factor)).toEqual(
      PRIORITY_FACTOR_SPECS.map((s) => s.factor),
    );
  });

  it("scores both edges of every bracket the same as the row shows", () => {
    for (const spec of PRIORITY_FACTOR_SPECS) {
      for (const row of spec.rows) {
        const shown = factorPoints(spec.key, row.probe);
        for (const edge of row.edges) {
          expect(factorPoints(spec.key, edge), `${spec.factor} ${row.when}`).toBe(shown);
        }
      }
    }
  });

  it("moves to the next bracket just past each boundary", () => {
    expect(factorPoints("days", { days: 60 })).not.toBe(factorPoints("days", { days: 61 }));
    expect(factorPoints("days", { days: 0 })).not.toBe(factorPoints("days", { days: 1 }));
    expect(factorPoints("outstanding", { outstandingPaise: 49_999_999 })).not.toBe(
      factorPoints("outstanding", { outstandingPaise: 50_000_000 }),
    );
    expect(factorPoints("behavior", { avgDaysLate: 5 })).not.toBe(
      factorPoints("behavior", { avgDaysLate: 5.01 }),
    );
    expect(factorPoints("behavior", { avgDaysLate: 45 })).not.toBe(
      factorPoints("behavior", { avgDaysLate: 45.01 }),
    );
    expect(factorPoints("promise", {})).toBe(0);
  });
});

describe("bands", () => {
  it("labels the ranges", () => {
    expect(PRIORITY_BANDS.map((b) => `${b.label} ${bandRangeLabel(b)}`)).toEqual([
      "High 55+",
      "Medium 30–54",
      "Low <30",
    ]);
  });

  it("matches the engine's band for every factor combination", () => {
    const days = [0, 1, 16, 31, 61];
    const outstanding = [1, 5_000_000, 20_000_000, 50_000_000];
    const behaviour: (number | null)[] = [null, 0, 20, 45, 46];
    const scores = new Set<number>();
    for (const d of days)
      for (const o of outstanding)
        for (const b of behaviour)
          for (const p of [false, true]) {
            const r = scoreProbe({ days: d, outstandingPaise: o, avgDaysLate: b, brokenPromise: p });
            expect(r.gate).toBeUndefined();
            expect(r.band).toBe(bandForScore(r.score ?? -1));
            scores.add(r.score ?? -1);
          }
    // The combinations land exactly on both thresholds.
    expect(scores.has(55)).toBe(true);
    expect(scores.has(30)).toBe(true);
  });

  it("puts the thresholds exactly where the descriptor says", () => {
    expect(bandForScore(55)).toBe("high");
    expect(bandForScore(54)).toBe("medium");
    expect(bandForScore(30)).toBe("medium");
    expect(bandForScore(29)).toBe("low");
  });
});
