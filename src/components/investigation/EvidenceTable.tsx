import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Evidence } from "@/domain/schema";
import { ProvenanceLine } from "./ProvenanceLine";

export interface EvidenceRow {
  label: string;
  value: ReactNode;
  evidence: Evidence;
}

/**
 * One grouped evidence table (Invoice facts / Communication / Payments,
 * Design.md §13): label · value, with the provenance line under each value
 * and a chip where the value isn't plainly verified.
 */
export function EvidenceTable({ title, rows }: { title: string; rows: EvidenceRow[] }) {
  const headingId = `ev-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="mt-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2 text-sm font-semibold text-text">
        {title}
      </h2>
      <table className="w-full border-collapse text-[13px] max-md:block">
        <tbody className="max-md:block">
          {rows.map(({ label, value, evidence }) => (
            <tr
              key={evidence.evidence_id}
              data-field={evidence.source_field}
              className="border-b border-border max-md:block max-md:py-2"
            >
              <th
                scope="row"
                className="py-2 pr-4 text-left align-top font-medium text-text-muted max-md:block max-md:p-0 md:w-[38%]"
              >
                {label}
              </th>
              <td className="py-2 align-top text-text break-words max-md:block max-md:pb-0 max-md:pt-0.5">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {value}
                  {evidence.validation_status === "missing" && <Badge variant="high">Missing</Badge>}
                  {evidence.validation_status === "conflict" && <Badge variant="med">Conflict</Badge>}
                </span>
                <ProvenanceLine evidence={evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
