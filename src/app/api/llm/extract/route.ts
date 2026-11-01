import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { rejectedExtraction, validateExtraction } from "@/ai/validateExtraction";
import { EmailMessageSchema } from "@/domain/schema";
import { extractLive, isLiveLlmEnabled } from "@/server/llm";

import { readBoundedJson } from "../read-bounded-json";

/**
 * TASK-36 (T23-6): the domain `EmailMessageSchema` has unbounded strings, so
 * the live route narrows it before anything reaches the paid model call.
 * 20k characters covers a long real email; anything bigger is refused
 * (400 `invalid_request`) instead of being sent upstream.
 */
const ID_MAX = 200;
const LiveExtractRequestSchema = EmailMessageSchema.extend({
  thread_id: z.string().max(ID_MAX),
  message_id: z.string().max(ID_MAX),
  from_address: z.string().max(320),
  subject: z.string().max(1_000),
  body: z.string().max(20_000),
});

// `runtime`/`dynamic` route-segment config is rejected under `cacheComponents`
// (next.config's `cacheComponents: true`) — a POST handler is never
// prerendered regardless, so this route runs at request time without it.
export async function POST(request: Request): Promise<Response> {
  if (!isLiveLlmEnabled()) {
    return NextResponse.json({ error: "live_mode_disabled" }, { status: 503 });
  }

  const read = await readBoundedJson(request);
  if (!read.ok) return read.response;
  const parsedMsg = LiveExtractRequestSchema.safeParse(read.value);
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
