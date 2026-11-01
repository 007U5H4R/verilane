import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { draftLive, isLiveLlmEnabled } from "@/server/llm";

import { readBoundedJson } from "../read-bounded-json";

// `runtime`/`dynamic` route-segment config is rejected under `cacheComponents`
// (next.config's `cacheComponents: true`) — a POST handler is never
// prerendered regardless, so this route runs at request time without it.
/**
 * Minimal request shape for the live draft route — see `src/server/llm.ts`
 * for why this doesn't reproduce the full `DraftSchema` pipeline (TASK-16
 * territory). TASK-36 (T23-6): both fields are bounded so an oversized
 * request is a 400 before it reaches the paid model call.
 */
const DraftRequestSchema = z.object({
  invoice_id: z.string().min(1).max(200),
  context: z.string().min(1).max(20_000),
});

export async function POST(request: Request): Promise<Response> {
  if (!isLiveLlmEnabled()) {
    return NextResponse.json({ error: "live_mode_disabled" }, { status: 503 });
  }

  const read = await readBoundedJson(request);
  if (!read.ok) return read.response;
  const parsed = DraftRequestSchema.safeParse(read.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await draftLive(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ status: "rejected", reason: result.error.reason, issues: result.error.issues });
  }
  return NextResponse.json({ status: "valid", ...result.value });
}
