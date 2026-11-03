"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FileText, Mail, Search, User, X } from "lucide-react";

import { useDismiss } from "@/components/shell/useDismiss";
import { searchIndex, type SearchKind } from "@/domain/search/globalSearch";
import { useSearchIndex } from "@/store/shellHooks";
import { DbContext } from "@/store/hooks";

const KIND_LABEL: Record<SearchKind, string> = { invoice: "Invoices", customer: "Customers", email: "Emails" };
const KIND_ICON: Record<SearchKind, typeof FileText> = { invoice: FileText, customer: User, email: Mail };

// The inline field shows at ≥1280 (Tailwind `xl`); below it an icon opens a
// full-width row under the bar.
const INLINE_QUERY = "(min-width: 80rem)";

const noSubscribe = () => () => {};
function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/**
 * TASK-38: top-bar search over invoices, customers and emails (ARIA combobox).
 * ⌘K / Ctrl+K focuses it; ↑/↓ move, Enter opens, Escape closes then clears.
 * The index loads only once the box is first focused. Below 1280 the field
 * lives behind a search icon; ⌘K opens it there too, Escape closes it and
 * returns focus to the icon.
 */
export function GlobalSearch() {
  const db = useContext(DbContext);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const fieldId = useId();
  // ⌘ on the server and on Apple platforms; Ctrl elsewhere, after mount.
  const apple = useSyncExternalStore(noSubscribe, isApple, () => true);

  const index = useSearchIndex(used);
  const results = useMemo(() => (index ? searchIndex(index, query) : []), [index, query]);
  const close = useCallback(() => {
    // Collapsing hides the focused field below 1280; hand focus back first.
    if (expanded && !window.matchMedia(INLINE_QUERY).matches && wrapRef.current?.contains(document.activeElement)) {
      buttonRef.current?.focus();
    }
    setOpen(false);
    setExpanded(false);
  }, [expanded]);
  useDismiss(wrapRef, open || expanded, close);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setExpanded(true);
        // The field is display:none below 1280 until this render commits.
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setExpanded(false);
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
    <div ref={wrapRef} className="contents xl:flex xl:min-w-[160px] xl:flex-1 xl:justify-center xl:px-2">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Search"
        aria-expanded={expanded}
        aria-controls={fieldId}
        onClick={() => {
          if (expanded) return close();
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={`grid size-11 shrink-0 place-items-center rounded-full text-text transition-colors duration-150 hover:bg-mint-pale xl:hidden ${
          expanded ? "bg-mint-pale" : ""
        }`}
      >
        <Search className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <div
        id={fieldId}
        role="search"
        className={`flex max-xl:absolute max-xl:inset-x-0 max-xl:top-full max-xl:z-30 max-xl:border-b max-xl:border-topbar-divider max-xl:bg-surface max-xl:px-4 max-xl:py-3 max-xl:shadow-[0_8px_16px_rgb(8_47_37/0.06)] xl:w-full xl:max-w-[520px] ${
          expanded ? "" : "max-xl:hidden"
        }`}
      >
        <div className="relative w-full">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
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
            className="h-12 w-full rounded-full border border-topbar-control-border bg-surface pr-20 pl-11 text-[15px] text-text shadow-[0_1px_2px_rgb(8_47_37/0.05)] transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted hover:border-border-strong focus-visible:border-interactive focus-visible:shadow-[0_0_0_4px_var(--brand-tint)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-interactive disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden"
          />
          <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : (
              <kbd
                aria-label={apple ? "Command K" : "Control K"}
                className="hidden items-center gap-0.5 rounded-md border border-topbar-control-border bg-surface-sunken px-2 py-0.5 font-sans text-[12px] font-medium text-text-muted md:inline-flex"
              >
                {apple ? "⌘" : "Ctrl"} K
              </kbd>
            )}
          </div>
          {showPanel && (
            <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-lg">
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
                          setExpanded(false);
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
      </div>
    </div>
  );
}
