/**
 * Fault-injection provider (TASK-22.1, FS11). Wraps a working provider and
 * corrupts its output in one of six ways a real model can fail, then runs
 * the corrupted output through the same `validateExtraction` gate as every
 * other provider. Deterministic: the corruption depends only on the kind
 * and the message, never on randomness or the clock.
 */
import { extractTokens } from "@/domain/extract";
import type { EmailMessage, Extraction } from "@/domain/schema";
import type { Provider, Rejected, Result } from "./provider";
import { validateExtraction } from "./validateExtraction";

export const FAULT_KINDS = [
  "malformed_json",
  "missing_fields",
  "bad_enum",
  "hallucinated_amount",
  "wrong_ref",
  "refusal",
] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

/** Larger than any amount in the corpora, so it is never a source token. */
const INVENTED_AMOUNT_FLOOR = 98_765_432_100;

/** An `INV-dddd` the email does not cite, counting down from INV-9999. */
function inventedRef(cited: string[]): string {
  for (let n = 9999; n >= 1000; n--) {
    const ref = `INV-${n}`;
    if (!cited.includes(ref)) return ref;
  }
  throw new Error("every INV-dddd is cited; cannot invent a ref");
}

/** The raw (pre-parse) text a faulty model would return for this message. */
export function faultyRaw(x: Extraction, msg: EmailMessage, kind: FaultKind): string {
  const tokens = extractTokens(msg);
  switch (kind) {
    case "malformed_json": {
      const text = JSON.stringify(x);
      return text.slice(0, Math.floor(text.length / 2));
    }
    case "missing_fields": {
      const rest: Partial<Extraction> = { ...x };
      delete rest.email_class;
      delete rest.amounts;
      return JSON.stringify(rest);
    }
    case "bad_enum":
      return JSON.stringify({ ...x, email_class: "urgent_payment" });
    case "hallucinated_amount": {
      const invented = Math.max(INVENTED_AMOUNT_FLOOR, ...tokens.amounts) + 1;
      return JSON.stringify({ ...x, amounts: [...x.amounts, invented] });
    }
    case "wrong_ref":
      return JSON.stringify({ ...x, invoice_refs: [...x.invoice_refs, inventedRef(tokens.refs)] });
    case "refusal":
      return JSON.stringify({ type: "refusal", refusal: "I can't help with that request." });
  }
}

function parse(text: string, msg: EmailMessage): Result<unknown, Rejected> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    const issue = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { message_id: msg.message_id, reason: "malformed JSON", issues: [issue] } };
  }
}

export function faulty(base: Provider, kind: FaultKind): Provider {
  return {
    name: "faulty",
    async extract(msg) {
      const result = await base.extract(msg);
      if (!result.ok) return result;
      const raw = parse(faultyRaw(result.value, msg, kind), msg);
      return raw.ok ? validateExtraction(raw.value, msg) : raw;
    },
  };
}
