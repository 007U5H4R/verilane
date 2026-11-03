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
import { extractTokens } from "@/domain/extract";
import { normaliseRef } from "@/domain/match";
import { paise } from "@/domain/money";
import type { Rejected, Result } from "./provider";

/**
 * TASK-22.2: every amount and invoice ref the provider reports must appear
 * as a token in the source email; anything else was invented. Returns one
 * issue per offending value (empty when the output is grounded).
 */
export function crossCheck(
  ext: Pick<Extraction, "amounts" | "invoice_refs">,
  msg: Pick<EmailMessage, "body" | "sent_at">,
): string[] {
  const tokens = extractTokens(msg);
  const issues: string[] = [];
  ext.amounts.forEach((a, i) => {
    if (!tokens.amounts.includes(paise(a))) issues.push(`amounts.${i}: ${a} paise does not appear in the email`);
  });
  ext.invoice_refs.forEach((ref, i) => {
    if (!tokens.refs.includes(normaliseRef(ref))) issues.push(`invoice_refs.${i}: ${ref} does not appear in the email`);
  });
  return issues;
}

/**
 * Parses `raw` with the schema, then cross-checks it against the source
 * email when the body is given. Callers that only re-validate a stored row
 * (no body) get the schema check alone.
 */
export function validateExtraction(
  raw: unknown,
  msg: Pick<EmailMessage, "message_id"> & Partial<Pick<EmailMessage, "body" | "sent_at">>,
): Result<Extraction, Rejected> {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return {
      ok: false,
      error: { message_id: msg.message_id, reason: "schema validation failed", issues },
    };
  }
  if (msg.body !== undefined && msg.sent_at !== undefined) {
    const issues = crossCheck(parsed.data, { body: msg.body, sent_at: msg.sent_at });
    if (issues.length > 0) {
      return { ok: false, error: { message_id: msg.message_id, reason: "cross-check failed", issues } };
    }
  }
  return { ok: true, value: parsed.data };
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
