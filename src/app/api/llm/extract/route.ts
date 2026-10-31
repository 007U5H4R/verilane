import "server-only";

import { NextResponse } from "next/server";

import { rejectedExtraction, validateExtraction } from "@/ai/validateExtraction";
import { EmailMessageSchema } from "@/domain/schema";
import { extractLive, isLiveLlmEnabled } from "@/server/llm";

// `runtime`/`dynamic` route-segment config is rejected under `cacheComponents`
// (next.config's `cacheComponents: true`) — a POST handler is never
// prerendered regardless, so this route runs at request time without it.
export async function POST(request: Request): Promise<Response> {
  if (!isLiveLlmEnabled()) {
    return NextResponse.json({ error: "live_mode_disabled" }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsedMsg = EmailMessageSchema.safeParse(body);
  if (!parsedMsg.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const msg = parsedMsg.data;

  const result = await extractLive(msg);
  if (!result.ok) {
    return NextResponse.json(rejectedExtraction(msg, "live", "live", result.error));
  }

  const validated = validateExtraction(result.value, msg);
  const row = validated.ok ? validated.value : rejectedExtraction(msg, "live", "live", validated.error);
  return NextResponse.json(row);
}
