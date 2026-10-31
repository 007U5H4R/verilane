import { provenanceOf } from "@/domain/evidence";
import type { Evidence } from "@/domain/schema";

/** `invoices.csv · Row 12 · due_date`, 12px mono, under the value it sources (Design.md §13). */
export function ProvenanceLine({ evidence }: { evidence: Evidence }) {
  return (
    <span data-testid="provenance" className="mt-0.5 block font-mono text-xs text-text-muted">
      {provenanceOf(evidence)}
    </span>
  );
}
