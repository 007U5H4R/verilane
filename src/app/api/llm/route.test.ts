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
const ctorMock = vi.fn();

// Only the client class is faked; the SDK's real error classes are kept so
// the catch paths are exercised with the exact types `messages.parse` throws.
vi.mock("@anthropic-ai/sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
  class MockAnthropic {
    messages = { parse: parseMock };
    static AnthropicError = actual.AnthropicError;
    static APIError = actual.APIError;
    constructor(opts?: unknown) {
      ctorMock(opts);
    }
  }
  return { ...actual, default: MockAnthropic };
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

describe("TASK-23 fix round 1: SDK failures never escape as a 500 or leak upstream text", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFlag = process.env.VERILANE_LIVE_LLM;
  const UPSTREAM_DETAIL = "upstream-secret-detail-xyz";

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-not-a-key";
    process.env.VERILANE_LIVE_LLM = "1";
    parseMock.mockReset();
    ctorMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.VERILANE_LIVE_LLM;
    else process.env.VERILANE_LIVE_LLM = originalFlag;
  });

  it("extract: a structured-output parse failure (base AnthropicError) is rejected, not a 500", async () => {
    const { AnthropicError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(new AnthropicError(`Failed to parse structured output: ${UPSTREAM_DETAIL}`));
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).status).toBe("rejected");
    expect(text).not.toContain(UPSTREAM_DETAIL);
  });

  it("draft: a structured-output parse failure (base AnthropicError) is rejected, not a 500", async () => {
    const { AnthropicError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(new AnthropicError(`Failed to parse structured output as JSON: ${UPSTREAM_DETAIL}`));
    const { POST } = await import("./draft/route");
    const res = await POST(jsonRequest({ invoice_id: "INV-9001", context: "overdue" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).status).toBe("rejected");
    expect(text).not.toContain(UPSTREAM_DETAIL);
  });

  it("extract: an upstream 503 APIError is rejected with a generic code, upstream message not sent to the browser", async () => {
    const { APIError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(new APIError(503, undefined, UPSTREAM_DETAIL, new Headers()));
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).status).toBe("rejected");
    expect(text).not.toContain(UPSTREAM_DETAIL);
  });

  it("draft: an upstream 503 APIError returns generic issues only", async () => {
    const { APIError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(new APIError(503, undefined, UPSTREAM_DETAIL, new Headers()));
    const { POST } = await import("./draft/route");
    const res = await POST(jsonRequest({ invoice_id: "INV-9001", context: "overdue" }));
    const body = await res.json();
    expect(body).toEqual({ status: "rejected", reason: "live LLM request failed", issues: ["upstream_error"] });
  });

  it("failure is logged server-side without the API key", async () => {
    const { APIError } = await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk");
    parseMock.mockRejectedValueOnce(new APIError(503, undefined, UPSTREAM_DETAIL, new Headers()));
    const { POST } = await import("./extract/route");
    await POST(jsonRequest(msg));
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("503");
    expect(logged).not.toContain("test-not-a-key");
  });

  it("extract: output truncated at max_tokens is rejected", async () => {
    parseMock.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      parsed_output: { email_class: "unknown", signals: [], invoice_refs: [], amounts: [], dates: [], commitment_date: null, payment_claim: null, missing_info: [] },
    });
    const { POST } = await import("./extract/route");
    const res = await POST(jsonRequest(msg));
    expect((await res.json()).status).toBe("rejected");
  });

  it("draft: output truncated at max_tokens is rejected", async () => {
    parseMock.mockResolvedValueOnce({ stop_reason: "max_tokens", parsed_output: { subject: "Re", body: "Dear" } });
    const { POST } = await import("./draft/route");
    const res = await POST(jsonRequest({ invoice_id: "INV-9001", context: "overdue" }));
    expect((await res.json()).status).toBe("rejected");
  });

});
