/**
 * Pure helpers for `scripts/eval-live.ts` (TASK-23), kept separate so they
 * are unit-testable without importing the `server-only` live client.
 */
import type { Rejected, Result } from "@/ai/provider";
import { validateExtraction } from "@/ai/validateExtraction";
import type { EmailMessage, Extraction } from "@/domain/schema";

// Rough per-call cost estimate for the console notice; not a bill — the real
// cost comes from Anthropic's API. Opus 5.5 list price: $4 / $20 per MTok.
const EST_INPUT_TOKENS_PER_CALL = 400;
const EST_OUTPUT_TOKENS_PER_CALL = 200;
const EST_USD_PER_MILLION_INPUT = 4;
const EST_USD_PER_MILLION_OUTPUT = 20;

export function estimateCostUsd(callCount: number): number {
  const inputCost = (callCount * EST_INPUT_TOKENS_PER_CALL * EST_USD_PER_MILLION_INPUT) / 1_000_000;
  const outputCost = (callCount * EST_OUTPUT_TOKENS_PER_CALL * EST_USD_PER_MILLION_OUTPUT) / 1_000_000;
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
