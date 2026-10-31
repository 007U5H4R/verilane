/**
 * Read-only view of the priority.v1 weights (TKT-14). The numbers mirror the
 * private tables in `src/domain/priority.ts`; they are restated here rather
 * than exported so this ticket leaves that file untouched (EXE note). If
 * priority.ts changes, this table and its version string must change too.
 */
const CONFIG_VERSION = "priority.v1";

const FACTORS: { factor: string; rows: [string, string][] }[] = [
  {
    factor: "Days overdue",
    rows: [
      ["61 or more", "45"],
      ["31 to 60", "35"],
      ["16 to 30", "20"],
      ["1 to 15", "10"],
      ["Not overdue", "0"],
    ],
  },
  {
    factor: "Outstanding amount",
    rows: [
      ["₹5,00,000 or more", "30"],
      ["₹2,00,000 to ₹4,99,999", "20"],
      ["₹50,000 to ₹1,99,999", "12"],
      ["Under ₹50,000", "5"],
    ],
  },
  {
    factor: "Customer’s average days late",
    rows: [
      ["No payment history", "5"],
      ["5 or fewer", "0"],
      ["More than 5, up to 20", "5"],
      ["More than 20, up to 45", "10"],
      ["More than 45", "15"],
    ],
  },
  { factor: "Broken payment promise", rows: [["Promise date passed unpaid", "+10"]] },
];

export function PriorityWeights() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-muted">
        Config <span className="font-mono text-xs">{CONFIG_VERSION}</span>. Read-only. Scores add up; 55 or more is High,
        30 to 54 is Medium, below 30 is Low. Data-quality, dispute and payment gates are checked before any score.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Priority weights, {CONFIG_VERSION}</caption>
          <thead className="text-text-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">Factor</th>
              <th scope="col" className="py-1 pr-4 font-medium">When</th>
              <th scope="col" className="py-1 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {FACTORS.flatMap(({ factor, rows }) =>
              rows.map(([when, points], i) => (
                <tr key={`${factor}-${when}`} className={i === 0 ? "border-t border-border" : ""}>
                  <th scope="row" className="py-1 pr-4 font-normal text-text">
                    {i === 0 ? factor : <span className="sr-only">{factor}</span>}
                  </th>
                  <td className="py-1 pr-4 text-text">{when}</td>
                  <td className="py-1 text-right tabular-nums text-text">{points}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
