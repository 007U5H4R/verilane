/**
 * Strict email → invoice matcher (Architecture.md §6.2, TASK-13.1). Pure.
 *
 * Two parts must both hold for `matched`: the sender is a known contact of
 * a customer, and the cited invoice number is owned by that customer.
 * Comparison is exact after normalisation only. There is deliberately no
 * approximate or nearest-string scoring: a near-miss reference is never
 * promoted to a match. The one heuristic is the transposition check (same
 * digits, different order), and it only ever downgrades to `ambiguous` so
 * a person decides.
 */
import type { Customer, EmailMessage, Extraction, Invoice, Match } from "./schema";

export interface MatchLedger {
  customers: Customer[];
  invoices: Invoice[];
}

export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** `inv 1042`, `INV–1042`, `inv1042` → `INV-1042`. */
export function normaliseRef(ref: string): string {
  const compact = ref
    .toUpperCase()
    .replace(/[\s‐-―−_-]+/g, "");
  const m = /^([A-Z]+)(\d+)$/.exec(compact);
  return m ? `${m[1]}-${m[2]}` : compact;
}

function digitKey(ref: string): string {
  return ref.replace(/\D/g, "").split("").sort().join("");
}

function prefixOf(ref: string): string {
  return ref.replace(/[\d-]+$/, "");
}

/** Owned invoice numbers with the same prefix and the same digits in another order. */
function transpositionsOf(ref: string, owned: Invoice[]): Invoice[] {
  const key = digitKey(ref);
  return owned.filter((inv) => {
    const n = inv.invoice_number && normaliseRef(inv.invoice_number);
    return !!n && n !== ref && prefixOf(n) === prefixOf(ref) && digitKey(n) === key;
  });
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Later re-issue of a duplicate pair: latest invoice_date, then highest row. */
function laterIssue(invoices: Invoice[]): Invoice {
  return invoices.reduce((a, b) =>
    b.invoice_date > a.invoice_date || (b.invoice_date === a.invoice_date && b.row_id > a.row_id) ? b : a,
  );
}

export function match(ext: Extraction, msg: EmailMessage, ledger: MatchLedger): Match {
  const base = { message_id: msg.message_id };
  const sender = normaliseAddress(msg.from_address);
  const customer = ledger.customers.find((c) =>
    c.contact_emails.some((e) => normaliseAddress(e) === sender),
  );

  const byNumber = new Map<string, Invoice>();
  for (const inv of ledger.invoices) {
    if (inv.invoice_number) byNumber.set(normaliseRef(inv.invoice_number), inv);
  }
  // A rejected extraction's refs are not trusted facts.
  const refs = ext.status === "valid" ? uniq(ext.invoice_refs.map(normaliseRef)) : [];

  if (!customer) {
    const cited = refs.flatMap((r) => (byNumber.has(r) ? [byNumber.get(r)!.invoice_id] : []));
    return {
      ...base,
      outcome: "unresolved",
      candidates: cited,
      reason: `Sender ${sender} is not a known customer contact`,
    };
  }

  const withCustomer = { ...base, customer_id: customer.customer_id };
  const ownedInvoices = ledger.invoices.filter((i) => i.customer_id === customer.customer_id);

  if (refs.length === 0) {
    const open = ownedInvoices.filter((i) => i.status !== "paid" && i.status !== "written_off");
    return {
      ...withCustomer,
      outcome: "customer_only",
      candidates: open.map((i) => i.invoice_id),
      reason: `Known contact of ${customer.name}, but no invoice number cited`,
    };
  }

  const owned: Invoice[] = [];
  const problems: string[] = [];
  const candidates: string[] = [];
  let unknownOnly = true;

  for (const ref of refs) {
    const inv = byNumber.get(ref);
    const swaps = transpositionsOf(ref, ownedInvoices);
    if (inv && inv.customer_id === customer.customer_id) {
      owned.push(inv);
      candidates.push(inv.invoice_id);
      continue;
    }
    if (inv) {
      unknownOnly = false;
      candidates.push(inv.invoice_id);
      problems.push(`${ref} belongs to another customer`);
    } else {
      problems.push(`${ref} is not in the ledger`);
    }
    for (const s of swaps) {
      unknownOnly = false;
      candidates.push(s.invoice_id);
      problems.push(`possible transposition of ${normaliseRef(s.invoice_number!)}`);
    }
  }

  if (problems.length === 0) {
    if (owned.length === 1) {
      return {
        ...withCustomer,
        outcome: "matched",
        invoice_id: owned[0]!.invoice_id,
        candidates,
        reason: `Known contact cites ${refs[0]}, owned by ${customer.name}`,
      };
    }
    if (ext.email_class === "duplicate") {
      const later = laterIssue(owned);
      return {
        ...withCustomer,
        outcome: "matched",
        invoice_id: later.invoice_id,
        candidates,
        reason: `Duplicate claim over ${refs.join(" and ")}, all owned by ${customer.name}`,
      };
    }
    return {
      ...withCustomer,
      outcome: "ambiguous",
      candidates,
      reason: `Cites more than one invoice: ${refs.join(", ")}`,
    };
  }

  // Only unknown refs, none resembling an owned number: the customer is known, the invoice is not.
  if (owned.length === 0 && unknownOnly) {
    return {
      ...withCustomer,
      outcome: "customer_only",
      candidates: [],
      reason: `Known contact of ${customer.name}; ${problems.join("; ")}`,
    };
  }

  return { ...withCustomer, outcome: "ambiguous", candidates: uniq(candidates), reason: problems.join("; ") };
}
