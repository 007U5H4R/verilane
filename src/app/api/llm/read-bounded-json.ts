import "server-only";

import { NextResponse } from "next/server";

/**
 * TASK-36 (T23-6): hard cap on a live-route request body, checked before any
 * JSON parsing. Sized so every request that passes the per-field `.max()`
 * limits fits even when JSON-escaped at 6 bytes per character (20k body +
 * 1k subject + bounded ids < 256 KiB), so the 413 only ever fires on input
 * the schema would reject anyway — it just fires before we buffer it.
 */
export const MAX_BODY_BYTES = 256 * 1024;

export type BoundedJson = { ok: true; value: unknown } | { ok: false; response: Response };

const tooLarge = (): BoundedJson => ({
  ok: false,
  response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }),
});

/**
 * Reads the request body as JSON with a byte limit:
 * - a declared `Content-Length` over the limit is refused without reading;
 * - otherwise the stream is read with a running count and cancelled as soon
 *   as it crosses the limit (a missing or lying `Content-Length` can't make
 *   us buffer more than ~one chunk past the cap);
 * - unparseable JSON yields `value: null`, which the caller's schema turns
 *   into the existing 400 `invalid_request`.
 */
export async function readBoundedJson(request: Request, limit = MAX_BODY_BYTES): Promise<BoundedJson> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return tooLarge();
  if (!request.body) return { ok: true, value: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return tooLarge();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: true, value: null };
  }
}
