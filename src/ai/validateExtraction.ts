/**
 * SR5: every provider output is parsed with `ExtractionSchema` before it is
 * stored. A refused output becomes a `rejected` row (class `unknown`, no
 * facts) so the UI can say "extraction rejected" instead of showing guesses.
 */
import {
  EXTRACTION_SCHEMA_VERSION,
  ExtractionSchema,
  type EmailMessage,
  type Extraction,
} from "@/domain/schema";
import type { Rejected, Result } from "./provider";

export function validateExtraction(
  raw: unknown,
  msg: Pick<EmailMessage, "message_id">,
): Result<Extraction, Rejected> {
  const parsed = ExtractionSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return {
    ok: false,
    error: { message_id: msg.message_id, reason: "schema validation failed", issues },
  };
}

/** The row stored for a refused output: no class, no facts, the reason kept. */
export function rejectedExtraction(
  msg: Pick<EmailMessage, "message_id" | "thread_id">,
  provider: string,
  mode: Extraction["mode"],
  rejected: Rejected,
): Extraction {
  return {
    message_id: msg.message_id,
    thread_id: msg.thread_id,
    mode,
    provider,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    email_class: "unknown",
    signals: [],
    invoice_refs: [],
    amounts: [],
    dates: [],
    commitment_date: null,
    payment_claim: null,
    missing_info: [],
    status: "rejected",
    rejection_reason: [rejected.reason, ...rejected.issues].join("; "),
  };
}
