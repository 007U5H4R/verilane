import type { Customer, EmailMessage, Invoice } from "@/domain/schema";

/**
 * TASK-38: the top bar's global search. One entry per invoice, customer and
 * email, built from the same Dexie rows the pages read — no separate index
 * to drift out of date.
 */
export type SearchKind = "invoice" | "customer" | "email";

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Lower-cased text the query is matched against. */
  haystack: string;
}

export function buildSearchIndex({
  invoices,
  customers,
  emails,
}: {
  invoices: Invoice[];
  customers: Customer[];
  emails: EmailMessage[];
}): SearchEntry[] {
  const nameById = new Map(customers.map((c) => [c.customer_id, c.name]));
  const out: SearchEntry[] = [];
  for (const i of invoices) {
    const number = i.invoice_number ?? i.invoice_id;
    const customer = nameById.get(i.customer_id) ?? i.customer_id;
    out.push({
      kind: "invoice",
      id: i.invoice_id,
      title: number,
      subtitle: customer,
      href: `/invoices/${encodeURIComponent(i.invoice_id)}`,
      haystack: [number, i.invoice_id, customer, i.po_number ?? ""].join(" ").toLowerCase(),
    });
  }
  for (const c of customers) {
    out.push({
      kind: "customer",
      id: c.customer_id,
      title: c.name,
      subtitle: c.customer_id,
      href: `/invoices?customer=${encodeURIComponent(c.customer_id)}`,
      haystack: [c.name, c.customer_id, ...c.contact_emails].join(" ").toLowerCase(),
    });
  }
  for (const e of emails) {
    out.push({
      kind: "email",
      id: e.message_id,
      title: e.subject,
      subtitle: e.from_address,
      href: `/emails?thread=${encodeURIComponent(e.thread_id)}`,
      haystack: [e.subject, e.from_address, e.thread_id].join(" ").toLowerCase(),
    });
  }
  return out;
}

/**
 * Entries whose text contains every word of `query`, grouped in kind order
 * (invoices, customers, emails), at most `perKind` each. Index order within
 * a kind is kept, so results are deterministic. Blank query → nothing.
 */
export function searchIndex(entries: SearchEntry[], query: string, perKind = 5): SearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const counts: Record<SearchKind, number> = { invoice: 0, customer: 0, email: 0 };
  const hits: SearchEntry[] = [];
  for (const kind of ["invoice", "customer", "email"] as const) {
    for (const e of entries) {
      if (e.kind !== kind || counts[kind] >= perKind) continue;
      if (words.every((w) => e.haystack.includes(w))) {
        hits.push(e);
        counts[kind] += 1;
      }
    }
  }
  return hits;
}
