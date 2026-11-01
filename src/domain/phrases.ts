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
 *   ("we might pay" is not a promise);
 * - a family `scopeHedges` regex on the clause text *before* the hit hedges it
 *   when a conditional or temporal opener scopes over it ("if there is any
 *   error", "once the payment is made");
 * - a pattern's `requires` regex must match somewhere in the clause ("on hold"
 *   is a dispute only next to resolution words, not a budget wait).
 * Wording is grouped into cue-word families (goods, price terms, resolution
 * words) rather than literal sentences (TASK-30).
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
  /** The clause must also match this for the hit to count. */
  requires?: RegExp;
}

export interface PhraseFamily {
  patterns: PhrasePattern[];
  negations: RegExp[];
  hedges: RegExp[];
  /** Tested on the clause text before the hit (a conditional opener scoping over it). */
  scopeHedges?: RegExp[];
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

// "may" hedges only as a modal before a verb ("we may have paid", "may be
// released"), so the month ("on 3 May", "the May invoice") never does (M-002 R16).
const MAY_HEDGE =
  /\bmay\s+(?:not\s+|well\s+|also\s+)?(?:have|has|be|been|pay|release|clear|transfer|remit|settle|process|make|dispute|need|take|get)\b/i;

// Cue-word families (TASK-30). Built into patterns below so a new synonym is
// one word in one place, not another sentence.
/** Things a customer receives. "invoice" is deliberately absent: not receiving an invoice is an enquiry. */
const GOODS =
  "goods|materials?|consignments?|deliver(?:y|ies)|services?|items?|shipments?|products?|stock|supplies|equipment|parts|units|order";
/** What a price/quantity complaint is about. */
const PRICE_TERM =
  "amount|price|pricing|rates?|quantity|qty|charges?|tax|GST|total|value|discount|calculation|freight";
/** What it is measured against. */
const AGREED =
  "agreed|quoted|quotation|quote|contract(?:ed)?|negotiated|approved|rate\\s+card|agreement|order(?:ed)?";
/** A defect word. */
const DEFECT = "damaged|defective|faulty|broken|sub-?standard|poor[- ]quality|leaking|spoil(?:ed|t)|expired";
/** Words that name an open problem awaiting resolution. */
const RESOLUTION =
  "issues?|matter|disputes?|discrepanc(?:y|ies)|quer(?:y|ies)|problems?|mismatch|differences?|corrections?|clarifications?|resolution|rectification|credit\\s+note|(?:revised|corrected|amended)\\s+invoice|resolved|rectified|corrected|clarified|sorted";
/** "doesn't / does not / do not / don't". */
const DONT = "(?:does|do|did)\\s+not|doesn't|don't|didn't";
const PO = "PO|purchase\\s+order";
/** A bank transfer reference with an id (UTR / NEFT / RTGS / IMPS): proof a payment went out. */
export const PAYMENT_REF =
  /\b(?:UTR|NEFT|RTGS|IMPS)\b(?:\s*(?:UTR|ref(?:erence)?|no|number|id|txn|transaction)\.?)*\s*[:#-]?\s*(?=[A-Z]*\d)[A-Z0-9]{10,22}\b/i;

export const PHRASE_FAMILIES: Record<SignalFamily, PhraseFamily> = {
  duplicate: {
    patterns: [
      { re: /\bduplicat(?:e|es|ed)\b/i },
      { re: /\bbilled\s+twice\b/i },
      { re: /\b(?:repeats|same\s+as)\s+INV\b/i },
    ],
    negations: [/\bnot\s+(?:a\s+)?duplicate\b/i, /\bno\s+duplicate\b/i],
    hedges: [/\b(?:not\s+sure|unsure|perhaps|possibly|might)\b/i, MAY_HEDGE],
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

      // TASK-30 — quantity / price disagreements.
      {
        re: new RegExp(`\\b(?:incorrect|wrong|inaccurate|erroneous|excess(?:ive)?|inflated)\\s+(?:${PRICE_TERM})\\b`, "i"),
        dispute_type: "incorrect_amount",
      },
      {
        re: new RegExp(
          `\\b(?:${PRICE_TERM})\\s+(?:\\w+\\s+){0,2}?(?:is|are|was|were|seems?|appears?|looks?)\\s+(?:to\\s+be\\s+)?(?:incorrect|wrong|inaccurate|erroneous|excessive|inflated|too\\s+high)\\b`,
          "i",
        ),
        dispute_type: "incorrect_amount",
      },
      {
        re: new RegExp(`\\b(?:higher|more)\\s+than\\s+(?:the\\s+|what\\s+(?:was|we)\\s+)?(?:${AGREED}|PO)\\b`, "i"),
        dispute_type: "incorrect_amount",
      },
      {
        re: new RegExp(
          `\\bnot\\s+(?:as\\s+per|per|in\\s+line\\s+with)\\s+(?:the\\s+|our\\s+|your\\s+)?(?:${AGREED})\\b`,
          "i",
        ),
        dispute_type: "incorrect_amount",
        selfNegating: true,
      },
      {
        re: new RegExp(
          `\\b(?:${DONT})\\s+(?:match|tally|reconcile|agree|correspond)\\s+(?:with\\s+)?(?:the\\s+|our\\s+|your\\s+)?(?:${AGREED}|records?|books|GRN|goods\\s+receipt|delivered|received)`,
          "i",
        ),
        dispute_type: "incorrect_amount",
        selfNegating: true,
      },
      {
        re: /\b(?:price|rate|amount|quantity|qty)\s+(?:difference|discrepanc(?:y|ies)|variance|mismatch)\b/i,
        dispute_type: "incorrect_amount",
      },
      { re: /\b(?:over-?invoiced|charged\s+(?:us\s+)?(?:extra|more))\b/i, dispute_type: "incorrect_amount" },
      {
        re: /\b(?:short[- ](?:delivery|delivered|supply|supplied|shipment|shipped|received)|shortage)\b/i,
        dispute_type: "incorrect_amount",
      },
      {
        re: /\bonly\s+\d+\s+(?:\w+\s+){0,2}?(?:were|was|have\s+been|has\s+been)?\s*(?:received|delivered|supplied|shipped)\b/i,
        dispute_type: "incorrect_amount",
      },

      // Goods not received or damaged.
      {
        re: new RegExp(
          `\\b(?:have|has|had)(?:\\s+not|n't)\\s+(?:yet\\s+)?(?:received|got(?:ten)?)\\s+(?:the\\s+|any\\s+|our\\s+|these\\s+|this\\s+)?(?:${GOODS})\\b`,
          "i",
        ),
        dispute_type: "not_received",
        selfNegating: true,
      },
      {
        re: new RegExp(
          `\\b(?:${DONT}|never)\\s+(?:receive|received|get|got)\\s+(?:the\\s+|any\\s+|our\\s+|these\\s+|this\\s+)?(?:${GOODS})\\b`,
          "i",
        ),
        dispute_type: "not_received",
        selfNegating: true,
      },
      {
        re: /\b(?:were|was|have\s+been|has\s+been|have|has)\s+(?:never|not)\s+(?:yet\s+|actually\s+)?(?:been\s+)?(?:rendered|provided|performed|delivered|supplied|dispatched|shipped)\b/i,
        dispute_type: "not_received",
        selfNegating: true,
      },
      {
        re: new RegExp(`\\b(?:still\\s+)?(?:awaiting|waiting\\s+for|yet\\s+to\\s+receive)\\s+(?:the\\s+)?(?:${GOODS})\\b`, "i"),
        dispute_type: "not_received",
      },
      {
        re: new RegExp(
          `\\b(?:arrived|received|delivered|reached\\s+us|were|was|are|is)\\s+(?:found\\s+)?(?:in\\s+(?:a\\s+)?)?(?:${DEFECT})\\b|\\b(?:damaged|defective|faulty|sub-?standard|poor[- ]quality)\\b`,
          "i",
        ),
        dispute_type: "not_received",
      },

      // Never ordered / PO mismatch.
      {
        re: new RegExp(
          `\\b(?:never|did\\s+not|didn't|have\\s+not|haven't|had\\s+not)\\s+(?:(?:place|placed|raise|raised|issue|issued)\\s+(?:an?|any|this|that|the|such\\s+an?)\\s+(?:order|${PO})|order(?:ed)?)\\b`,
          "i",
        ),
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: /\bnot\s+(?:ordered|requested|authori[sz]ed)\s+by\s+us\b/i,
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: new RegExp(`\\b(?:${PO})\\b[^.;!?\\n]{0,30}?\\b(?:${DONT})\\s+(?:match|tally|correspond)`, "i"),
        dispute_type: "missing_po",
        selfNegating: true,
      },
      {
        re: new RegExp(
          `\\b(?:wrong|incorrect|invalid|different)\\s+(?:${PO})\\b|\\b(?:${PO})\\s+(?:number\\s+|reference\\s+)?(?:mismatch|(?:is|seems|appears)\\s+(?:to\\s+be\\s+)?(?:wrong|incorrect|invalid))\\b`,
          "i",
        ),
        dispute_type: "missing_po",
      },

      // Credit notes, corrected invoices, rejection.
      {
        re: /\b(?:issue|raise|pass|need|require|request(?:ing)?|expect|want)\s+(?:us\s+)?(?:a\s+)?credit\s+note\b|\bsend\s+(?:us\s+)?a\s+credit\s+note\b/i,
        dispute_type: "unknown",
      },
      {
        re: /\b(?:send|issue|share|raise|provide|need|require)\s+(?:us\s+)?(?:a\s+|the\s+)?(?:revised|corrected|amended|rectified)\s+invoice\b/i,
        dispute_type: "unknown",
      },
      { re: /\b(?:revise|amend|rectify|re-?issue)\s+(?:the\s+|this\s+|your\s+)?(?:invoice|bill|INV)\b/i, dispute_type: "unknown" },
      {
        re: /\b(?:cannot|can't|can\s+not|unable\s+to|not\s+able\s+to|will\s+not|won't|do\s+not|don't)\s+(?:accept|approve|honou?r|agree\s+(?:to|with))\s+(?:this|the|these|your)?\s*(?:invoice|bill|charges?|amount|rate|price|INV)\b/i,
        dispute_type: "unknown",
        selfNegating: true,
      },
      { re: /\b(?:is|are)\s+not\s+payable\b/i, dispute_type: "unknown", selfNegating: true },

      // Withholding payment pending resolution.
      {
        re: /\b(?:withh(?:o|e)ld(?:ing)?|withhold(?:ing)?|holding\s+back|held\s+back)\s+(?:the\s+|our\s+|this\s+|any\s+)?(?:payment|amount|release|remittance)\b/i,
        dispute_type: "unknown",
      },
      {
        re: new RegExp(`\\b(?:until|unless|till|pending)\\b[^.;!?\\n]{0,40}?\\b(?:${RESOLUTION})\\b`, "i"),
        dispute_type: "unknown",
        requires: /\b(?:not|n't|cannot|unable|hold|withh(?:o|e)ld)\b/i,
        selfNegating: true,
      },
      {
        re: /\bon\s+hold\b/i,
        dispute_type: "unknown",
        requires: new RegExp(`\\b(?:${RESOLUTION})\\b`, "i"),
      },

      // Escalation.
      {
        // "Please escalate this to your team" asks for help; it is not a threat.
        re: /(?<!\b(?:please|kindly)\s+)\bescalat(?:e|ed|es|ing|ion)\b|\b(?:formal|written)\s+complaint\b|\blegal\s+(?:action|notice|recourse)\b/i,
        dispute_type: "unknown",
      },

      // Polite and indirect.
      {
        re: new RegExp(
          `\\b(?:discrepanc(?:y|ies)|mismatch(?:es)?|errors?|mistakes?|anomal(?:y|ies)|inconsistenc(?:y|ies))\\s+(?:in|on|with)\\s+(?:the\\s+|this\\s+|your\\s+|our\\s+)?(?:invoice|bill|billing|INV|${PRICE_TERM})\\b`,
          "i",
        ),
        dispute_type: "unknown",
      },
      {
        re: /\bthere\s+(?:seems|appears)\s+to\s+(?:be|have\s+been)\s+(?:a|an|some)\s+(?:\w+\s+)?(?:error|mistake|discrepancy|issue|problem|mismatch|confusion|oversight)\b/i,
        dispute_type: "unknown",
      },
      {
        re: /\b(?:invoice|bill|INV\s*-?\s*\d+)\s+(?:is|seems|appears|looks)\s+(?:to\s+be\s+)?(?:incorrect|wrong|erroneous|inflated|inaccurate)\b/i,
        dispute_type: "unknown",
      },
      {
        re: /\b(?:raised|issued|billed|charged|invoiced)\s+(?:to\s+us\s+)?(?:in\s+error|by\s+mistake|wrongly|incorrectly|erroneously)\b|\b(?:wrongly|incorrectly|erroneously|mistakenly)\s+(?:billed|charged|invoiced|raised|issued)\b/i,
        dispute_type: "unknown",
      },
      {
        re: /\bobject(?:s|ed|ing)?\s+to\b|\b(?:contest(?:s|ed|ing)?|challeng(?:e|es|ed|ing))\s+(?:the\s+|this\s+|your\s+)?(?:invoice|bill|amount|charges?|INV)\b/i,
        dispute_type: "unknown",
      },
    ],
    negations: [
      /\bno\s+(?:dispute|issue|objection|discrepanc(?:y|ie)|complaint|concern|problem)s?\b/i,
      /\bnot\s+disput/i,
      // "has been resolved" closes the dispute — but "until it is resolved" keeps it open.
      /(?<!\b(?:until|till|unless|once|after|when|pending)\b[^.;!?\n]*)\b(?:has|have|is|was|were)\s+(?:now\s+|since\s+)?(?:been\s+)?(?:resolved|sorted\s+out|rectified)\b/i,
    ],
    // Polite softeners ("there might be an error") stay disputes; only a
    // hedged *act* of disputing is blocked ("we may / might dispute").
    hedges: [
      /\b(?:not\s+sure|unsure)\b/i,
      /\b(?:might|could|perhaps|possibly)\s+(?:\w+\s+){0,2}?(?:dispute|object|escalate|contest|challenge|withhold)\b/i,
      MAY_HEDGE,
    ],
    // "if there is any error …", "in case the goods arrive damaged" — no comma
    // between the opener and the hit, so "If not fixed by Friday, we will
    // escalate" still counts.
    scopeHedges: [/\b(?:if|in\s+case|whether|should\s+there)\b[^,]*$/i],
  },
  confirmation: {
    patterns: [
      { re: new RegExp(`\\b(?:have|has|had)\\s+(?:already\\s+)?(?:${PAY_PAST})\\b`, "i") },
      { re: new RegExp(`\\b(?:we|i)\\s+(?:already\\s+)?(?:${PAY_PAST})\\b`, "i") },
      { re: new RegExp(`\\b(?:was|were)\\s+(?:${PAY_PAST})\\b`, "i") },
      { re: /\b(?:has|have)\s+been\s+(?:paid|processed|released|remitted|transferred|cleared|made)\b/i },
      { re: /\bpayment\s+(?:is\s+|has\s+been\s+)?(?:done|completed|made)\b/i },

      // TASK-30 — broader past-tense payment language.
      { re: new RegExp(`\\b(?:was|were)\\s+\\w+ly\\s+(?:${PAY_PAST})\\b`, "i") },
      { re: new RegExp(`\\b(?:we|i)'ve\\s+(?:already\\s+)?(?:${PAY_PAST})\\b`, "i") },
      {
        re: /\b(?:has|have)\s+(?:now\s+|just\s+|already\s+)?been\s+(?:credited|deposited|wired|sent|disbursed)\b/i,
      },
      {
        re: /\b(?:have|has|had|we|i)\s+(?:already\s+|now\s+|just\s+)?(?:made|sent|initiated|effected|processed|released|wired)\s+(?:the\s+|a\s+|full\s+|our\s+)?(?:payment|transfer|remittance|amount|funds)\b/i,
      },
      {
        re: /\b(?:payment|transfer|remittance|amount|funds|NEFT|RTGS|IMPS)\s+(?:is\s+|was\s+|has\s+been\s+|have\s+been\s+)?(?:done|completed|successful|executed|effected|credited)\b/i,
      },
      // Bare participle: "Amount transferred to your account". Transfer verbs only —
      // "amount paid" / "amount settled" too often names a figure under discussion.
      { re: /\b(?:amount|payment|funds|balance)\s+(?:transferred|remitted|credited|wired)\b/i },
      // A sentence that opens on the verb: "Paid via NEFT …", "Settled INV-2147 …".
      { re: /(?<=(?:^|[\n.;!?:])\s*)(?:paid|remitted|transferred|settled)\b/i },
      {
        re: /\b(?:find|attached|attaching|enclosed|enclosing|sharing|herewith)\b[^.;!?\n]{0,30}?\b(?:remittance\s+advice|payment\s+(?:advice|confirmation|receipt|proof)|proof\s+of\s+payment|transfer\s+confirmation)\b/i,
      },
      { re: PAYMENT_REF },
    ],
    negations: [
      /\bpaid\s+(?:neither|none|nothing)\b/i,
      /\bnot\s+(?:yet\s+)?(?:been\s+)?(?:paid|made|sent|transferred|credited|processed|released|remitted)\b/i,
    ],
    hedges: [
      /\b(?:might|probably|possibly|perhaps|should\s+have|i\s+think|i\s+believe|hopefully)\b/i,
      MAY_HEDGE,
    ],
    // "once the payment is made", "after the transfer is done" — not yet paid.
    scopeHedges: [/\b(?:once|when|after|until|unless|before|if|as\s+soon\s+as)\b[^,]*$/i],
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
      /\b(?:might|maybe|could|would|possibly|perhaps|hope|hoping|try|trying|if|subject\s+to|tentative(?:ly)?)\b/i,
      MAY_HEDGE,
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

/** The [start, end) of the sentence/clause around `index`. */
export function clauseAt(text: string, index: number): [number, number] {
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
        if (def.scopeHedges?.some((h) => h.test(text.slice(cs, index)))) continue;
        if (pattern.requires && !pattern.requires.test(clause)) continue;

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
