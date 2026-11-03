import "server-only";

import { connection, NextResponse } from "next/server";

import { isLiveLlmEnabled } from "@/server/llm";

/**
 * Under `cacheComponents` the `runtime`/`dynamic` route-segment config
 * exports are rejected outright — `connection()` is the replacement that
 * forces this GET to run at request time instead of being prerendered with
 * build-time env baked into a static response (Next.js docs: route-handlers
 * -> "With Cache Components").
 */
export async function GET(): Promise<Response> {
  await connection();
  return NextResponse.json({ enabled: isLiveLlmEnabled() });
}
