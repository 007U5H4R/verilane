/**
 * TASK-23 (TKT-18): the live LLM routes.
 * - TC-072: no env (or key alone, no flag) -> 503 `{error:'live_mode_disabled'}`.
 * - TC-074: mocked SDK: a refusal and a schema-invalid parse both come back
 *   `status:'rejected'`. No real network call is ever made here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws unconditionally outside Next's RSC build pipeline —
// mocking it here only bypasses that build-time guard for this test run;
// the guard itself is verified for real in the build (TC-073).
vi.mock("server-only", () => ({}));

// `connection()` (status route) requires Next's request-scope async storage,
// which only exists inside a real request — unavailable under plain vitest.
// Stub it as a no-op resolved promise; the route still runs end-to-end, and
// the real per-request behavior (no static prerender) is verified for real
// via `pnpm build`'s route-type output (`ƒ` = Dynamic for all three routes).
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

const parseMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { parse: parseMock };
    static APIError = class extends Error {};
  }
  return { default: MockAnthropic };
});

const msg = {
  thread_id: "E-900",
  message_id: "E-900-1",
  from_address: "ap@example.com",
  sent_at: "2026-10-28T09:00:00Z",
  subject: "INV-9001",
  body: "We will pay INV-9001 on 2026-11-05.",
};

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/llm/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("TC-072: live mode off by default", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFlag = process.env.VERILANE_LIVE_LLM;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.VERILANE_LIVE_LLM;
    else process.env.VERILANE_LIVE_LLM = originalFlag;
  });

  it("no env: POST /api/llm/extract returns 503 live_mode_disabled", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERILANE_LIVE_LLM;
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "live_mode_disabled" });
  });

  it("no env: POST /api/llm/draft returns 503 live_mode_disabled", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERILANE_LIVE_LLM;
    const { POST } = await import("./draft/route");
    const res = await POST(jsonRequest({ invoice_id: "INV-9001", context: "overdue" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "live_mode_disabled" });
  });

  it("key alone, no flag: still 503", async () => {
    process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
    delete process.env.VERILANE_LIVE_LLM;
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "live_mode_disabled" });
  });

  it("flag alone, no key: still 503", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.VERILANE_LIVE_LLM = "1";
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "live_mode_disabled" });
  });

  it("status route reports disabled by default", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERILANE_LIVE_LLM;
    const { GET } = await import("./status/route");
    const res = await GET();
    expect(await res.json()).toEqual({ enabled: false });
  });
});

describe("TC-074: live provider rejects refusal or invalid output", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFlag = process.env.VERILANE_LIVE_LLM;

  beforeEach(() => {
    // Test-only dummy value — never a real credential — purely to pass the
    // gate before exercising the mocked SDK call.
    process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
    process.env.VERILANE_LIVE_LLM = "1";
    parseMock.mockReset();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.VERILANE_LIVE_LLM;
    else process.env.VERILANE_LIVE_LLM = originalFlag;
  });

  it("a model refusal is rejected, not thrown", async () => {
    parseMock.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejected");
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it("a schema-invalid parsed_output is rejected by re-validation", async () => {
    parseMock.mockResolvedValueOnce({
      stop_reason: "end_turn",
      parsed_output: { email_class: "not-a-real-class", signals: [], invoice_refs: [], amounts: [], dates: [], commitment_date: null, payment_claim: null, missing_info: [] },
    });
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejected");
  });

  it("no real network call is made — the mock is the only thing invoked", async () => {
    parseMock.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    const { POST } = await import("./extract/route");
    await POST(jsonRequest(msg));
    expect(parseMock).toHaveBeenCalled();
  });
});
