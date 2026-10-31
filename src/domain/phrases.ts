/**
 * Phrase families for the simulated classifier (TASK-12.2, TC-022).
 *
 * Each family is `{patterns, negations, hedges}`. A pattern hit only counts
 * when its clause carries no negation and no hedge for that family:
 * - a generic negator ("not", "never", "no", "n't", …) in the three words
 *   before the hit, or inside it, negates it — unless the pattern is
 *   `selfNegating` ("not received", "without a PO" *are* the claim);
 * - a family `negations` regex anywhere in the clause negates it
 *   ("paid neither", "no dispute");
 * - a family `hedges` regex anywhere in the clause hedges it
 *   ("we might pay" is not a promise).
 * Pure (SR2): no I/O.
 */
import type { DisputeType, SignalFamily } from "./schema";

export type { SignalFamily };

export interface PhrasePattern {
  re: RegExp;
  /** For the dispute family: which dispute type this wording claims. */
  dispute_type?: DisputeType;
  /** The wording itself contains the negator ("never reached"). */
  selfNegating?: boolean;
}

export interface PhraseFamily {
  patterns: PhrasePattern[];
  negations: RegExp[];
  hedges: RegExp[];
}

export interface SignalHit {
  family: SignalFamily;
  text: string;
  index: number;
  dispute_type?: DisputeType;
  /** missing_info only: the items the sender says they need. */
  items?: string[];
}

const PAY_PAST = "paid|settled|released|remitted|transferred|cleared";
const PAY_FUTURE = "pay|release|clear|transfer|remit|settle|process|make (?:the )?payment";

export const PHRASE_FAMILIES: Record<SignalFamily, PhraseFamily> = {
  duplicate: {
    patterns: [
      { re: /\bduplicat(?:e|es|ed)\b/i },
      { re: /\bbilled\s+twice\b/i },
      { re: /\b(?:repeats|same\s+as)\s+INV\b/i },
    ],
    negations: [/\bnot\s+(?:a\s+)?duplicate\b/i, /\bno\s+duplicate\b/i],
    hedges: [/\b(?:not\s+sure|unsure|perhaps|possibly|might|may)\b/i],
  },
  dispute: {
    patterns: [
      { re: /\bamount\s+is\s+(?:incorrect|wrong)\b/i, dispute_type: "incorrect_amount" },
      { re: /\b(?:incorrect|wrong)\s+amount\b/i, dispute_type: "incorrect_amount" },
      { re: /\bover-?(?:billed|charged)\b/i, dispute_type: "incorrect_amount" },
      {
        re: /\b(?:correct|wrong|incorrect)\s+(?:the\s+)?billing\s+period\b/i,
        dispute_type: "incorrect_billing_period",
      },
      {
        re: /\bbilling\s+period\s+is\s+(?:wrong|incorrect)\b/i,
        dispute_type: "incorrect_billing_period",
      },
      {
        re: /\b(?:does\s+not|doesn't|did\s+not|didn't)\s+(?:quote|mention|carry|include|have)\s+(?:our|the|a|any)?\s*(?:purchase\s+order|PO)\b/i,
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: /\bwithout\s+(?:a|the|our|any)?\s*(?:purchase\s+order|PO)\b/i,
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: /\b(?:missing|no)\s+(?:purchase\s+order|PO)\s+(?:number|reference)\b/i,
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: /\b(?:have|has|had)\s+not\s+(?:yet\s+)?received\s+(?:the\s+|any\s+)?(?:goods|material|consignment|delivery|services?|items?|shipment)\b/i,
        dispute_type: "not_received",
        selfNegating: true,
      },
      {
        re: /\bnever\s+(?:reached|arrived|delivered)\b/i,
        dispute_type: "not_received",
        selfNegating: true,
      },
      { re: /\balready\s+(?:paid|settled|cleared)\b/i, dispute_type: "payment_already_completed" },
      {
        re: /\bstop\s+(?:the\s+|sending\s+)?reminders\b/i,
        dispute_type: "payment_already_completed",
      },
      { re: /\bdisput(?:e|ed|ing)\b/i, dispute_type: "unknown" },
    ],
    negations: [/\bno\s+(?:dispute|issue|objection)s?\b/i, /\bnot\s+disput/i],
    hedges: [/\b(?:not\s+sure|unsure|perhaps|possibly|might|may)\b/i],
  },
  confirmation: {
    patterns: [
      { re: new RegExp(`\\b(?:have|has|had)\\s+(?:already\\s+)?(?:${PAY_PAST})\\b`, "i") },
      { re: new RegExp(`\\b(?:we|i)\\s+(?:already\\s+)?(?:${PAY_PAST})\\b`, "i") },
      { re: new RegExp(`\\b(?:was|were)\\s+(?:${PAY_PAST})\\b`, "i") },
      { re: /\b(?:has|have)\s+been\s+(?:paid|processed|released|remitted|transferred|cleared|made)\b/i },
      { re: /\bpayment\s+(?:is\s+|has\s+been\s+)?(?:done|completed|made)\b/i },
    ],
    negations: [/\bpaid\s+(?:neither|none|nothing)\b/i, /\bnot\s+(?:yet\s+)?(?:been\s+)?paid\b/i],
    hedges: [
      /\b(?:might|may|probably|possibly|perhaps|should\s+have|i\s+think|i\s+believe|hopefully)\b/i,
    ],
  },
  commitment: {
    patterns: [
      {
        re: new RegExp(
          `\\b(?:will|shall|would|might|may|could|can|going\\s+to|plan(?:ning)?\\s+to|intend\\s+to)\\s+(?:\\w+\\s+){0,2}?(?:${PAY_FUTURE})\\b`,
          "i",
        ),
      },
      { re: /\bwill\s+be\s+(?:made|paid|released|cleared|transferred|processed)\b/i },
      { re: /\bpayment\s+(?:date|run)\s+is\b/i },
      { re: /\bscheduled\s+(?:the\s+)?payment\b/i },
    ],
    negations: [],
    hedges: [
      /\b(?:might|may|maybe|could|would|possibly|perhaps|hope|hoping|try|trying|if|subject\s+to|tentative(?:ly)?)\b/i,
    ],
  },
  delay: {
    patterns: [
      { re: /\bdelay(?:ed|s)?\b/i },
      { re: /\bneed\s+(?:a\s+few|some)\s+more\s+(?:days|weeks|time)\b/i },
      { re: /\bcash\s+flow\s+is\s+tight\b/i },
      { re: /\brevert\s+with\s+a\s+date\b/i },
    ],
    negations: [/\bno\s+(?:further\s+)?delay\b/i, /\bwithout\s+(?:any\s+)?delay\b/i],
    hedges: [],
  },
  enquiry: {
    patterns: [
      { re: /\b(?:could|can|would)\s+you\b/i },
      { re: /\b(?:please|kindly)\s+(?:send|share|confirm|provide)\b/i },
      { re: /\bcopy\s+of\s+(?:the\s+)?(?:invoice|INV)\b/i },
    ],
    negations: [],
    hedges: [],
  },
  missing_info: {
    patterns: [
      { re: /\b(?:until|unless)\s+you\s+(?:share|send|provide)\b/i, selfNegating: true },
      { re: /\b(?:details|documents?|information)\s+(?:needed|required|missing)\b/i },
      { re: /\b(?:we\s+)?(?:need|require)\s+(?:your|the)\s+(?:GSTIN|PAN|bank|delivery|challan)\b/i },
    ],
    negations: [],
    hedges: [],
  },
};

const MISSING_ITEMS =
  /\b(GSTIN|PAN|delivery\s+challan(?:\s+number)?|purchase\s+order\s+number|PO\s+(?:number|reference)|bank\s+details|TDS\s+certificate|copy\s+of\s+(?:the\s+)?invoice)\b/gi;

const NEGATOR = /\b(?:not|never|no|neither|nor|cannot|without)\b|n't\b/i;

// Sentence/clause boundaries; "Rs." and decimals ("3.4") are not boundaries.
const BOUNDARY = /(?<!\bRs)[.;!?](?=\s|$)|\n/gi;

function clauseAt(text: string, index: number): [number, number] {
  let start = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const at = m.index ?? 0;
    if (at < index) start = at + 1;
    else return [start, at];
  }
  return [start, text.length];
}

function lastWords(s: string, n: number): string {
  return s.trim().split(/\s+/).slice(-n).join(" ");
}

/** Every non-negated, non-hedged phrase hit in `text`, in text order. */
export function detectSignals(text: string): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const [family, def] of Object.entries(PHRASE_FAMILIES) as [SignalFamily, PhraseFamily][]) {
    for (const pattern of def.patterns) {
      const re = new RegExp(pattern.re.source, "gi");
      for (const m of text.matchAll(re)) {
        const index = m.index ?? 0;
        const [cs, ce] = clauseAt(text, index);
        const clause = text.slice(cs, ce);
        if (!pattern.selfNegating) {
          const window = `${lastWords(text.slice(cs, index), 3)} ${m[0]}`;
          if (NEGATOR.test(window)) continue;
        }
        if (def.negations.some((n) => n.test(clause))) continue;
        if (def.hedges.some((h) => h.test(clause))) continue;

        const hit: SignalHit = { family, text: m[0], index };
        if (pattern.dispute_type) hit.dispute_type = pattern.dispute_type;
        if (family === "missing_info") {
          hit.items = [...clause.matchAll(MISSING_ITEMS)].map((x) => x[0]);
        }
        hits.push(hit);
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
