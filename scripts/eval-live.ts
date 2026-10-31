#!/usr/bin/env tsx
/**
 * TASK-23 (TKT-18): runs the heldout eval set through the LIVE Claude
 * provider and writes `eval/report.live.json`. This spends real money and
 * calls a real API — it refuses to run without `--yes`. Its result is
 * reported, never gated: it does not fail the build and is not part of
 * `pnpm test:all`.
 *
 * Run with: `pnpm eval:live --yes`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EmailMessageSchema } from "@/domain/schema";
import { extractLive, isLiveLlmEnabled, liveModelId } from "@/server/llm";

const ROOT = process.cwd();

// Rough per-call cost estimate for the console notice below; not billed by
// this script itself — the real cost comes from Anthropic's API.
const EST_INPUT_TOKENS_PER_CALL = 400;
const EST_OUTPUT_TOKENS_PER_CALL = 200;
const EST_USD_PER_MILLION_INPUT = 5;
const EST_USD_PER_MILLION_OUTPUT = 25;

function estimateCostUsd(callCount: number): number {
  const inputCost = (callCount * EST_INPUT_TOKENS_PER_CALL * EST_USD_PER_MILLION_INPUT) / 1_000_000;
  const outputCost = (callCount * EST_OUTPUT_TOKENS_PER_CALL * EST_USD_PER_MILLION_OUTPUT) / 1_000_000;
  return inputCost + outputCost;
}

async function main(): Promise<void> {
  const yes = process.argv.includes("--yes");
  if (!yes) {
    console.error(
      "eval:live: this calls the real Anthropic API and spends real money.\n" +
        "Re-run with --yes to proceed: pnpm eval:live --yes",
    );
    process.exit(1);
  }

  if (!isLiveLlmEnabled()) {
    console.error(
      "eval:live: live mode is disabled — set ANTHROPIC_API_KEY and VERILANE_LIVE_LLM=1 first.",
    );
    process.exit(1);
  }

  const emails = EmailMessageSchema.array().parse(
    JSON.parse(readFileSync(join(ROOT, "eval", "heldout", "emails.json"), "utf8")),
  );

  console.log(
    `eval:live: ${emails.length} calls against model "${liveModelId()}", ` +
      `estimated cost ~$${estimateCostUsd(emails.length).toFixed(4)} (rough estimate, not a bill).`,
  );

  const results = [];
  for (const msg of emails) {
    const result = await extractLive(msg);
    results.push({
      message_id: msg.message_id,
      thread_id: msg.thread_id,
      ok: result.ok,
      value: result.ok ? result.value : undefined,
      error: result.ok ? undefined : result.error,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    model: liveModelId(),
    gated: false,
    note: "reported, not gated — this report does not fail pnpm test:all or any build step",
    call_count: emails.length,
    results,
  };

  const outPath = join(ROOT, "eval", "report.live.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`eval:live: wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error("eval:live: failed", err);
  process.exit(1);
});
