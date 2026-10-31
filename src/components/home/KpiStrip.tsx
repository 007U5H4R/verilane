import { formatInr, paise } from "@/domain/money";
import type { HomeKpis } from "@/domain/aggregates";

/** KPI strip: four sunken cells, a serif value and a label (Design.md §14). */
export function KpiStrip({ kpis }: { kpis: HomeKpis }) {
  const cells: { label: string; value: string }[] = [
    { label: "Outstanding", value: formatInr(paise(kpis.outstandingPaise)) },
    { label: "High priority", value: String(kpis.highCount) },
    { label: "Open disputes", value: String(kpis.openDisputesCount) },
    {
      label: "Avg days overdue",
      value: kpis.avgDaysOverdue === null ? "—" : String(Math.round(kpis.avgDaysOverdue)),
    },
  ];

  return (
    <div data-testid="kpi-strip" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg bg-surface-sunken p-4">
          <p className="font-display text-2xl font-semibold text-text">{cell.value}</p>
          <p className="text-xs text-text-muted">{cell.label}</p>
        </div>
      ))}
    </div>
  );
}
