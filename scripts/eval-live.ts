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

import { estimateCostUsd, toReportRow } from "./eval-live-report";

const ROOT = process.cwd();

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

  const cost = estimateCostUsd(emails.length, liveModelId());
  console.log(
    `eval:live: ${emails.length} calls against model "${liveModelId()}", ` +
      (cost === null
        ? `cost unknown for model "${liveModelId()}" (no rates on file).`
        : `estimated cost ~$${cost.toFixed(4)} (rough estimate, not a bill).`),
  );

  const results = [];
  for (const msg of emails) {
    results.push(toReportRow(msg, await extractLive(msg)));
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
