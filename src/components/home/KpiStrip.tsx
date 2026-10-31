import { formatInr, paise } from "@/domain/money";
import type { HomeKpis } from "@/domain/aggregates";

/**
 * KPI strip: four sunken cells, a serif value and a label (Design.md §14).
 * "Open disputes" is the open dispute-record count, the same number as the
 * sidebar Disputes badge (T18-10).
 */
export function KpiStrip({ kpis, openDisputesCount }: { kpis: HomeKpis; openDisputesCount: number }) {
  const cells: { id: string; label: string; value: string }[] = [
    { id: "outstanding", label: "Outstanding", value: formatInr(paise(kpis.outstandingPaise)) },
    { id: "high", label: "High priority", value: String(kpis.highCount) },
    { id: "disputes", label: "Open disputes", value: String(openDisputesCount) },
    {
      id: "avg-days",
      label: "Avg days overdue",
      value: kpis.avgDaysOverdue === null ? "—" : String(Math.round(kpis.avgDaysOverdue)),
    },
  ];

  return (
    <div data-testid="kpi-strip" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.id} className="rounded-lg bg-surface-sunken p-4" data-testid={`kpi-${cell.id}`}>
          <p className="font-display text-2xl font-semibold text-text" data-testid={`kpi-${cell.id}-value`}>
            {cell.value}
          </p>
          <p className="text-xs text-text-muted">{cell.label}</p>
        </div>
      ))}
    </div>
  );
}
