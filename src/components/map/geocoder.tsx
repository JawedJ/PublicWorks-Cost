"use client";

import { Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { geocode, type GeocodeResult } from "@/lib/geo/geocode";
import { cn } from "@/lib/utils";
import { useMap } from "./map-context";

const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || undefined;
const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "done" | "error";

/** Place search box that flies the map to the chosen result. */
export function Geocoder() {
  const t = useTranslations("map.search");
  const locale = useLocale();
  const map = useMap();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  // The query text last set by choosing a result; don't search it again.
  const chosenRef = useRef<string | null>(null);

  async function runSearch(q: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setOpen(true);
    try {
      const found = await geocode(q, {
        language: locale,
        maptilerKey,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setResults(found);
      setActive(found.length ? 0 : -1);
      setStatus("done");
    } catch {
      if (ctrl.signal.aborted) return;
      setResults([]);
      setStatus("error");
    }
  }

  // Debounced search-as-you-type.
  useEffect(() => {
    if (query === chosenRef.current) return;
    if (query.trim().length < MIN_CHARS) return;
    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function choose(result: GeocodeResult) {
    abortRef.current?.abort();
    chosenRef.current = result.label;
    setQuery(result.label);
    setOpen(false);
    if (!map) return;
    if (result.bbox) {
      map.fitBounds(result.bbox, { padding: 40, maxZoom: 16 });
    } else {
      map.flyTo({ center: result.center, zoom: 15 });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && results[active]) choose(results[active]);
      else void runSearch(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && status !== "idle";

  return (
    <div className="relative w-80 max-w-[calc(100vw-5rem)]">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        {status === "loading" ? (
          <Loader2
            aria-hidden
            className="size-4 animate-spin text-muted-foreground"
          />
        ) : (
          <Search aria-hidden className="size-4 text-muted-foreground" />
        )}
        <input
          type="search"
          role="combobox"
          aria-label={t("label")}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < MIN_CHARS) {
              abortRef.current?.abort();
              setResults([]);
              setStatus("idle");
              setOpen(false);
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("results")}
          className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-sm shadow-md"
        >
          {status === "error" && (
            <li className="px-3 py-2 text-muted-foreground">{t("error")}</li>
          )}
          {status === "done" && results.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              {t("noResults")}
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer truncate px-3 py-2",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
