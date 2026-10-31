/**
 * TASK-12.7: the simulated extractor reproduces the seed labels.
 *
 * Gate: amount and invoice-ref exact match over `eval/seed.labels.json` is
 * 100% (set equality, paise). Class, dispute type and commitment date are
 * checked too, as a regression net for the phrase rules. The extractor never
 * reads these labels — this test is the only place they meet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "@/domain/classify";
import { extractTokens } from "@/domain/extract";
import { ThreadLabelFile } from "./schema";

interface EmailRow {
  thread_id: string;
  message_id: string;
  sent_at: string;
  body: string;
}

const ROOT = process.cwd();
const labels = ThreadLabelFile.parse(
  JSON.parse(readFileSync(join(ROOT, "eval", "seed.labels.json"), "utf8")),
);
const emails = JSON.parse(
  readFileSync(join(ROOT, "public", "seed", "emails.json"), "utf8"),
) as EmailRow[];

function sorted<T>(xs: Iterable<T>): T[] {
  return [...xs].sort();
}

/** Thread-level view: union of every message's tokens; class from the latest message. */
function extractThread(threadId: string) {
  const msgs = emails
    .filter((e) => e.thread_id === threadId)
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const amounts = new Set<number>();
  const refs = new Set<string>();
  let last: ReturnType<typeof classify> | undefined;
  for (const m of msgs) {
    const tokens = extractTokens(m);
    tokens.amounts.forEach((a) => amounts.add(a));
    tokens.refs.forEach((r) => refs.add(r));
    last = classify(tokens, m.body);
  }
  return { amounts, refs, classification: last };
}

describe("seed extraction vs labels (TASK-12.7)", () => {
  it("covers every labelled thread", () => {
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(emails.some((e) => e.thread_id === l.thread_id), l.thread_id).toBe(true);
    }
  });

  it.each(labels.map((l) => [l.thread_id, l] as const))(
    "%s: amounts and refs match exactly (set equality)",
    (_id, label) => {
      const got = extractThread(label.thread_id);
      expect(sorted(got.amounts)).toEqual(sorted(label.amounts));
      expect(sorted(got.refs)).toEqual(sorted(label.invoice_refs));
    },
  );

  it.each(labels.map((l) => [l.thread_id, l] as const))(
    "%s: class, dispute type and commitment date match",
    (_id, label) => {
      const c = extractThread(label.thread_id).classification;
      expect(c?.email_class).toBe(label.email_class);
      expect(c?.dispute_type).toBe(label.dispute_type);
      expect(c?.commitment_date ?? null).toBe(label.commitment_date);
    },
  );
});
