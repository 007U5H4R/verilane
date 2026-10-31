/**
 * The live provider's client-side half (TASK-23 / TKT-18). Mirrors
 * `simulated.ts`'s shape: fetch the server route, then re-validate the
 * result with the same `validateExtraction` the simulated provider uses —
 * the route's output is never trusted blindly.
 */
import type { EmailMessage } from "@/domain/schema";
import type { Provider } from "./provider";
import { validateExtraction } from "./validateExtraction";

async function extractRaw(msg: EmailMessage): Promise<unknown> {
  try {
    const res = await fetch("/api/llm/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export const liveProvider: Provider = {
  name: "live",
  extract: async (msg) => validateExtraction(await extractRaw(msg), msg),
};
