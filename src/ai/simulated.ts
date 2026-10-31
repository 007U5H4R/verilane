/**
 * The simulated provider (TASK-12.4): the rule-based extractor + classifier
 * from `src/domain`, stamped `mode:'simulated'`, `provider:'simulated'`,
 * `schemaVersion:'extraction.v1'`, and validated like any other provider.
 *
 * `simulateExtraction` is synchronous so `recompute()` can run it inside its
 * Dexie transaction (awaiting non-Dexie promises there would commit it early).
 */
import { classify } from "@/domain/classify";
import { extractTokens } from "@/domain/extract";
import { EXTRACTION_SCHEMA_VERSION, type EmailMessage, type Extraction } from "@/domain/schema";
import type { Provider } from "./provider";
import { rejectedExtraction, validateExtraction } from "./validateExtraction";

const PROVIDER = "simulated";

/** The unvalidated provider output for one message. */
export function simulateRaw(msg: EmailMessage): unknown {
  const tokens = extractTokens(msg);
  const c = classify(tokens, msg.body);
  return {
    message_id: msg.message_id,
    thread_id: msg.thread_id,
    mode: "simulated",
    provider: PROVIDER,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    email_class: c.email_class,
    signals: c.signals,
    invoice_refs: tokens.refs,
    amounts: tokens.amounts,
    dates: [...new Set(tokens.allDates.map((d) => d.iso))],
    commitment_date: c.commitment_date,
    payment_claim: c.payment_claim,
    ...(c.dispute_type ? { dispute_type: c.dispute_type } : {}),
    missing_info: c.missing_info,
    status: "valid",
  };
}

/** Validated extraction, or a `rejected` row if the schema refuses it. */
export function simulateExtraction(msg: EmailMessage): Extraction {
  const result = validateExtraction(simulateRaw(msg), msg);
  return result.ok ? result.value : rejectedExtraction(msg, PROVIDER, "simulated", result.error);
}

export const simulatedProvider: Provider = {
  name: "simulated",
  extract: async (msg) => validateExtraction(simulateRaw(msg), msg),
};
