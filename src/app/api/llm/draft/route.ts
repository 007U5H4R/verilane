import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { draftLive, isLiveLlmEnabled } from "@/server/llm";

// `runtime`/`dynamic` route-segment config is rejected under `cacheComponents`
// (next.config's `cacheComponents: true`) — a POST handler is never
// prerendered regardless, so this route runs at request time without it.
/**
 * Minimal request shape for the live draft route — see `src/server/llm.ts`
 * for why this doesn't reproduce the full `DraftSchema` pipeline (TASK-16
 * territory).
 */
const DraftRequestSchema = z.object({
  invoice_id: z.string().min(1),
  context: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  if (!isLiveLlmEnabled()) {
    return NextResponse.json({ error: "live_mode_disabled" }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = DraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await draftLive(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ status: "rejected", reason: result.error.reason, issues: result.error.issues });
  }
  return NextResponse.json({ status: "valid", ...result.value });
}
