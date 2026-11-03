"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, pageList, type PageInfo } from "@/domain/audit/view";
import { cn } from "@/lib/cn";

const BTN =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-text tabular-nums hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-50";

export function AuditPagination({
  info,
  size,
  onPage,
  onSize,
}: {
  info: PageInfo;
  size: number;
  onPage: (p: number) => void;
  onSize: (s: number) => void;
}) {
  const { page, pageCount, start, end, total } = info;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
      <p className="tabular-nums" data-testid="audit-range">
        Showing {start}–{end} of {total} {total === 1 ? "activity" : "activities"}
      </p>
      <label className="flex items-center gap-2">
        Rows per page
        <select
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="min-h-8 rounded-md border border-border bg-surface px-2 text-xs text-text"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Pagination" className="flex items-center gap-1 md:ml-auto">
        <button type="button" className={BTN} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Prev
        </button>
        {pageList(page, pageCount).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cn(BTN, n === page && "border-brand bg-brand text-on-brand disabled:opacity-100")}
              disabled={n === page}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className={BTN} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
