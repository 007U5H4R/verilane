"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow, type PageInfo } from "@/domain/invoices/register";
import { cn } from "@/lib/cn";

const BTN =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-text tabular-nums hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-50 md:h-8 md:min-w-8";

export function InvoicesPagination({ info, onPage }: { info: PageInfo; onPage: (p: number) => void }) {
  const { page, pageCount, start, end, total } = info;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
      <p className="tabular-nums" data-testid="invoices-range">
        Showing {start}–{end} of {total} {total === 1 ? "invoice" : "invoices"}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1 md:ml-auto">
          <button type="button" className={BTN} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            <span className="max-sm:hidden">Prev</span>
          </button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={cn(BTN, p === page && "border-brand bg-brand text-on-brand disabled:opacity-100")}
                disabled={p === page}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={BTN} disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
            <span className="max-sm:hidden">Next</span>
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
