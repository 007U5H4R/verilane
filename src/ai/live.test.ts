/**
 * TASK-23 fix round 1 (T23-3): the live provider's client half. `fetch` is
 * stubbed — no real network call — and the route's JSON is never trusted:
 * every response is re-validated before it is returned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EmailMessage } from "@/domain/schema";
import { liveProvider } from "./live";

const msg: EmailMessage = {
  thread_id: "E-900",
  message_id: "E-900-1",
  from_address: "ap@example.com",
  sent_at: "2026-10-28T09:00:00Z",
  subject: "INV-9001",
  body: "We will pay INV-9001 on 2026-11-05.",
};

const validRow = {
  message_id: "E-900-1",
  thread_id: "E-900",
  mode: "live",
  provider: "live",
  model: "claude-opus-5-5",
  schemaVersion: "extraction.v1",
  email_class: "commitment",
  signals: [],
  invoice_refs: ["INV-9001"],
  amounts: [],
  dates: ["2026-11-05"],
  commitment_date: "2026-11-05",
  payment_claim: null,
  missing_info: [],
  status: "valid",
};

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liveProvider (T23-3)", () => {
  it("a valid route payload is accepted", async () => {
    const fetchMock = stubFetch(200, validRow);
    const result = await liveProvider.extract(msg);
    expect(result).toEqual({ ok: true, value: validRow });
    expect(fetchMock).toHaveBeenCalledWith("/api/llm/extract", expect.objectContaining({ method: "POST" }));
  });

  it("a tampered payload (schema-invalid field) is rejected", async () => {
    stubFetch(200, { ...validRow, invoice_refs: ["'; DROP TABLE invoices; --"] });
    const result = await liveProvider.extract(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message_id).toBe("E-900-1");
  });

  it("a tampered payload for a different message is rejected", async () => {
    stubFetch(200, { ...validRow, message_id: "E-999-1", thread_id: "E-999" });
    const result = await liveProvider.extract(msg);
    expect(result.ok).toBe(false);
  });

  it("a 503 (live mode disabled / upstream down) is rejected, not thrown", async () => {
    stubFetch(503, { error: "live_mode_disabled" });
    const result = await liveProvider.extract(msg);
    expect(result.ok).toBe(false);
  });

  it("a network failure is rejected, not thrown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await liveProvider.extract(msg);
    expect(result.ok).toBe(false);
  });
});
