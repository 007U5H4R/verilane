"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, Mail, Search, User, X } from "lucide-react";

import { useDismiss } from "@/components/shell/useDismiss";
import { searchIndex, type SearchKind } from "@/domain/search/globalSearch";
import { useSearchIndex } from "@/store/shellHooks";
import { DbContext } from "@/store/hooks";

const KIND_LABEL: Record<SearchKind, string> = { invoice: "Invoices", customer: "Customers", email: "Emails" };
const KIND_ICON: Record<SearchKind, typeof FileText> = { invoice: FileText, customer: User, email: Mail };

/**
 * TASK-38: top-bar search over invoices, customers and emails (ARIA combobox).
 * ⌘K / Ctrl+K focuses it; ↑/↓ move, Enter opens, Escape closes then clears.
 * The index loads only once the box is first focused.
 */
export function GlobalSearch() {
  const db = useContext(DbContext);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const index = useSearchIndex(used);
  const results = useMemo(() => (index ? searchIndex(index, query) : []), [index, query]);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      setOpen(true);
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (e.key === "Enter") {
      const hit = results[active];
      if (open && hit) {
        e.preventDefault();
        go(hit.href);
      }
    } else if (e.key === "Escape") {
      // useDismiss closes the panel; a second Escape on a closed panel clears.
      if (!open) setQuery("");
    }
  }

  const showPanel = open && query.trim().length > 0;
  const activeId = showPanel && results[active] ? `${listId}-${active}` : undefined;

  return (
    <div ref={wrapRef} role="search" className="relative w-full md:max-w-md md:flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search invoices, customers, or emails"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Search invoices, customers, or emails..."
        disabled={!db}
        value={query}
        onFocus={() => {
          setUsed(true);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-lg border border-border bg-surface-sunken pr-16 pl-9 text-sm text-text placeholder:text-text-muted focus-visible:border-interactive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-interactive disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="grid size-6 place-items-center rounded text-text-muted hover:bg-surface hover:text-text"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] text-text-muted md:inline">
            ⌘K
          </kbd>
        )}
      </div>
      {showPanel && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          {!index ? (
            <p role="status" className="px-3 py-2 text-sm text-text-muted">
              Loading…
            </p>
          ) : results.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-text-muted">
              No invoices, customers or emails match “{query.trim()}”.
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="Search results">
            {results.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              const firstOfKind = results[i - 1]?.kind !== r.kind;
              return (
                <li key={`${r.kind}-${r.id}`} role="presentation">
                  {firstOfKind && (
                    <p
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-text-muted uppercase"
                    >
                      {KIND_LABEL[r.kind]}
                    </p>
                  )}
                  <Link
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    href={r.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      i === active ? "bg-surface-sunken" : ""
                    }`}
                  >
                    <Icon className="size-4 flex-none text-text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text">{r.title}</span>
                      <span className="block truncate text-xs text-text-muted">{r.subtitle}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
