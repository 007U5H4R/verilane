"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The open state of the Customer picker (FiltersPanel): a search box and the
 * `group "Customer"` of aria-pressed buttons. Split out so it loads only on
 * first open; it takes focus itself when it mounts.
 */
export function CustomerPickerList({
  id,
  labelId,
  customers,
  selected,
  onToggle,
  onClear,
}: {
  id: string;
  labelId: string;
  customers: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const shown = q === "" ? customers : customers.filter((c) => c.name.toLowerCase().includes(q));

  return (
    <div
      id={id}
      className="absolute left-0 top-full z-20 mt-1 flex w-72 max-w-[calc(100vw-4rem)] flex-col gap-2 rounded-lg border border-border bg-surface p-2 shadow-card"
    >
      <label className="flex items-center gap-2 rounded-md border border-border-strong px-2 py-1">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
        <span className="sr-only">Find a customer</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a customer…"
          className="min-h-7 min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
        />
      </label>
      <div role="group" aria-labelledby={labelId} className="flex max-h-60 flex-col overflow-y-auto">
        {shown.map((c) => {
          const pressed = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(c.id)}
              className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-xs text-text hover:bg-surface-sunken"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border",
                  pressed ? "border-brand bg-brand text-on-brand" : "border-border-strong",
                )}
              >
                {pressed && <Check className="size-3" />}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="px-2 py-1 text-xs text-text-muted">No customer matches “{query}”.</p>}
      {selected.length > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear customers
        </Button>
      )}
    </div>
  );
}
