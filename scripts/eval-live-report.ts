/**
 * Pure helpers for `scripts/eval-live.ts` (TASK-23), kept separate so they
 * are unit-testable without importing the `server-only` live client.
 */
import type { Rejected, Result } from "@/ai/provider";
import { validateExtraction } from "@/ai/validateExtraction";
import type { EmailMessage, Extraction } from "@/domain/schema";

// Rough per-call cost estimate for the console notice; not a bill — the real
// cost comes from Anthropic's API.
const EST_INPUT_TOKENS_PER_CALL = 400;
const EST_OUTPUT_TOKENS_PER_CALL = 200;

/**
 * TASK-36 (T23-R3): list prices in USD per million tokens [input, output],
 * keyed by model id, so a `VERILANE_LLM_MODEL` override is priced at its own
 * rate. A model not listed here gets `null` ("unknown"), never a guess.
 */
const USD_PER_MTOK: Readonly<Record<string, readonly [number, number]>> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
  "claude-fable-5": [10, 50],
};

export function estimateCostUsd(callCount: number, modelId: string): number | null {
  const rates = USD_PER_MTOK[modelId];
  if (!rates) return null;
  const [inputRate, outputRate] = rates;
  const inputCost = (callCount * EST_INPUT_TOKENS_PER_CALL * inputRate) / 1_000_000;
  const outputCost = (callCount * EST_OUTPUT_TOKENS_PER_CALL * outputRate) / 1_000_000;
  return inputCost + outputCost;
}

export interface ReportRow {
  message_id: string;
  thread_id: string;
  ok: boolean;
  value?: Extraction;
  error?: Rejected;
}

/** Re-validates a live result exactly as the app path does (SR5). */
export function toReportRow(
  msg: Pick<EmailMessage, "message_id" | "thread_id">,
  result: Result<unknown, Rejected>,
): ReportRow {
  const checked = result.ok ? validateExtraction(result.value, msg) : result;
  const base = { message_id: msg.message_id, thread_id: msg.thread_id };
  return checked.ok ? { ...base, ok: true, value: checked.value } : { ...base, ok: false, error: checked.error };
}
