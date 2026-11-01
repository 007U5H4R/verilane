/**
 * TASK-36 (T23-11): TC-073's "importing `src/server/llm.ts` outside the
 * server fails" claim, checked for real. `route.test.ts` mocks `server-only`
 * to exercise the routes; this file deliberately does NOT, so the package's
 * default (non `react-server`) export runs and must throw on import — the
 * same thing that fails a client-component build.
 */
import { describe, expect, it } from "vitest";

describe("TC-073: server-only guard on the live client", () => {
  it("importing @/server/llm without the react-server condition throws", async () => {
    await expect(import("@/server/llm")).rejects.toThrow(/cannot be imported from a Client Component/);
  });

  it("the live route modules are guarded the same way", async () => {
    await expect(import("./status/route")).rejects.toThrow(/cannot be imported from a Client Component/);
  });
});
