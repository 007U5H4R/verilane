/** TASK-25.5 · TC-083: the route budget sums gzip sizes per route and flags any over the limit. */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { measureRoutes } from "./route-budget";

const chunks: Record<string, Buffer> = {
  shared: Buffer.from("a".repeat(5000)),
  big: Buffer.from(Array.from({ length: 4000 }, (_, i) => String((i * 7919) % 10007)).join(",")),
};
const read = (p: string) => chunks[p]!;
const gz = (p: string) => gzipSync(chunks[p]!, { level: 9 }).length;

describe("measureRoutes", () => {
  it("sums each route's gzip chunk sizes and flags routes over budget", () => {
    const budget = gz("shared") + 1;
    const res = measureRoutes(
      [
        { route: "/small", firstLoadChunkPaths: ["shared"] },
        { route: "/large", firstLoadChunkPaths: ["shared", "big"] },
      ],
      read,
      budget,
    );
    expect(res).toEqual([
      { route: "/small", gzipBytes: gz("shared"), chunks: 1, over: false },
      { route: "/large", gzipBytes: gz("shared") + gz("big"), chunks: 2, over: true },
    ]);
  });
});
