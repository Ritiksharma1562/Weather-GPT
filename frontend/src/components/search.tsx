"use client";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Place } from "@/lib/types";
export function PlaceSearch({
  onSelect,
  placeholder = "Search a city or place",
  initial = "",
}: {
  onSelect: (place: Place) => void;
  placeholder?: string;
  initial?: string;
}) {
  const [query, setQuery] = useState(initial),
    [results, setResults] = useState<Place[]>([]),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (query.trim().length < 2 || !open) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api<Place[]>(
          `/locations/search?q=${encodeURIComponent(query)}`,
        );
        if (!cancelled) {
          setResults(data);
          setActive(-1);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, open]);
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, []);
  const select = (place: Place) => {
    onSelect(place);
    setQuery(place.name);
    setOpen(false);
  };
  return (
    <div className="place-search" ref={wrap}>
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && query.length >= 2}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && active >= 0 && results[active]) {
            e.preventDefault();
            select(results[active]);
          }
        }}
      />
      {loading ? (
        <LoaderCircle className="spin" size={16} />
      ) : (
        query && (
          <button
            className="clear-search"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )
      )}
      {open && query.length >= 2 && (
        <div className="search-results" id={id} role="listbox">
          {results.map((p, i) => (
            <button
              key={`${p.latitude}-${p.longitude}`}
              role="option"
              aria-selected={active === i}
              id={`${id}-${i}`}
              onClick={() => select(p)}
            >
              <MapPin size={16} />
              <span>
                <strong>{p.name}</strong>
                <small>
                  {[p.admin1, p.country].filter(Boolean).join(", ")}
                </small>
              </span>
            </button>
          ))}
          {!results.length && !loading && (
            <p>{error || "No matching places"}</p>
          )}
        </div>
      )}
    </div>
  );
}
