/**
 * TASK-23 (TKT-18): the live Claude provider. Server-only — never import
 * this from a client component (the `server-only` import below fails the
 * build if that happens, per NFR8 / TC-073).
 *
 * Gate (TC-072): both `ANTHROPIC_API_KEY` and `VERILANE_LIVE_LLM=1` must be
 * set. A key alone is not enough — this is the default-off path in
 * dev/test/CI.
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  DisputeTypeSchema,
  EmailClassSchema,
  PaymentClaimSchema,
  SignalFamilySchema,
  type EmailMessage,
} from "@/domain/schema";
import type { Rejected, Result } from "@/ai/provider";

export function liveModelId(): string {
  return process.env.VERILANE_LLM_MODEL ?? "claude-opus-5-5";
}

/** Both conditions must hold — a key alone never enables the live path. */
export function isLiveLlmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.VERILANE_LIVE_LLM === "1";
}

/**
 * Only the fields the model actually determines. `message_id`, `thread_id`,
 * `mode`, `provider`, `schemaVersion` are deterministic context data that we
 * stamp on server-side (schema.ts's `ExtractionSchema` also carries a
 * `.superRefine` cross-field check that `zodOutputFormat`'s JSON-Schema
 * conversion can't represent, so the full schema can't be passed directly —
 * see TASK-23 report for this deviation).
 */
const LiveExtractionFieldsSchema = z.object({
  email_class: EmailClassSchema,
  signals: z.array(SignalFamilySchema),
  invoice_refs: z.array(z.string()),
  amounts: z.array(z.number().int().nonnegative()),
  dates: z.array(z.string()),
  commitment_date: z.string().nullable(),
  payment_claim: PaymentClaimSchema.nullable(),
  dispute_type: DisputeTypeSchema.optional(),
  missing_info: z.array(z.string()),
});

/**
 * Explicit client budget (TASK-23 fix round 1, T23-5). The SDK default is a
 * 10-minute timeout with 2 retries — and timeouts are retried — so one
 * request could hold a route open for ~30 min. 60 s × (1 + 1 retry) caps the
 * worst case near 2 min, well above a normal structured-output call.
 */
export const LIVE_CLIENT_OPTIONS = { timeout: 60_000, maxRetries: 1 } as const;

function liveClient(): Anthropic {
  return new Anthropic(LIVE_CLIENT_OPTIONS);
}

/**
 * Maps any SDK failure to a generic issue code (T23-2/T23-4). `APIError`
 * covers HTTP/connection/timeout failures; a bare `AnthropicError` is what
 * `messages.parse` throws when structured output fails JSON/Zod parsing.
 * The upstream message never leaves the server: only the error class and
 * HTTP status are logged — never the key, request headers or body.
 * Returns `null` for anything that is not an SDK error (re-thrown: a bug).
 */
function sdkFailureCode(op: string, err: unknown): "upstream_error" | "invalid_output" | null {
  if (!(err instanceof Anthropic.AnthropicError)) return null;
  const status = err instanceof Anthropic.APIError ? err.status : undefined;
  console.error(`live LLM ${op} failed: ${err.constructor.name}${status === undefined ? "" : ` (status ${status})`}`);
  return err instanceof Anthropic.APIError ? "upstream_error" : "invalid_output";
}

function reject(msg: Pick<EmailMessage, "message_id">, reason: string, issues: string[] = []): Result<unknown, Rejected> {
  return { ok: false, error: { message_id: msg.message_id, reason, issues } };
}

/**
 * Calls the live model and returns an unknown-shaped object: callers must
 * re-validate it (here via `validateExtraction`) before trusting it, same as
 * the simulated provider's raw output.
 */
export async function extractLive(msg: EmailMessage): Promise<Result<unknown, Rejected>> {
  let response;
  try {
    response = await liveClient().messages.parse({
      model: liveModelId(),
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            "Extract structured invoice-reminder signals from this email.",
            `Subject: ${msg.subject}`,
            "",
            msg.body,
          ].join("\n"),
        },
      ],
      output_config: { format: zodOutputFormat(LiveExtractionFieldsSchema) },
    });
  } catch (err) {
    const code = sdkFailureCode("extract", err);
    if (code) return reject(msg, "live LLM request failed", [code]);
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return reject(msg, "model refused the request");
  }
  if (response.stop_reason === "max_tokens") {
    return reject(msg, "model output was truncated", ["max_tokens"]);
  }
  if (!response.parsed_output) {
    return reject(msg, "model output did not match the extraction schema");
  }

  return {
    ok: true,
    value: {
      ...response.parsed_output,
      message_id: msg.message_id,
      thread_id: msg.thread_id,
      mode: "live",
      provider: "live",
      model: liveModelId(),
      schemaVersion: "extraction.v1",
      status: "valid",
    },
  };
}

/**
 * Minimal live draft generation: subject + body only. The full `DraftSchema`
 * (facts/footnotes/checks/failed_checks) is produced by the pre-approval
 * checks pipeline, which is TASK-16-owned domain logic (`src/domain/draft.ts`,
 * `src/domain/validate.ts`) — not reproduced here. See TASK-23 report.
 */
const LiveDraftFieldsSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type LiveDraftFields = z.infer<typeof LiveDraftFieldsSchema>;

export interface LiveDraftInput {
  invoice_id: string;
  context: string;
}

export async function draftLive(input: LiveDraftInput): Promise<Result<LiveDraftFields, Rejected>> {
  const rejectDraft = (reason: string, issues: string[] = []): Result<LiveDraftFields, Rejected> => ({
    ok: false,
    error: { message_id: input.invoice_id, reason, issues },
  });

  let response;
  try {
    response = await liveClient().messages.parse({
      model: liveModelId(),
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            `Draft a polite payment-reminder email for invoice ${input.invoice_id}.`,
            "",
            input.context,
          ].join("\n"),
        },
      ],
      output_config: { format: zodOutputFormat(LiveDraftFieldsSchema) },
    });
  } catch (err) {
    const code = sdkFailureCode("draft", err);
    if (code) return rejectDraft("live LLM request failed", [code]);
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return rejectDraft("model refused the request");
  }
  if (response.stop_reason === "max_tokens") {
    return rejectDraft("model output was truncated", ["max_tokens"]);
  }
  if (!response.parsed_output) {
    return rejectDraft("model output did not match the draft schema");
  }
  return { ok: true, value: response.parsed_output };
}
