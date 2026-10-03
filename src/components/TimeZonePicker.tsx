"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { allTimeZones, browserTimeZone, timeZoneLabel } from "@/lib/dates";

// Names people actually search for, which time zone IDs don't contain.
const ALIASES: Record<string, string> = {
  "America/Los_Angeles": "pacific pst pdt california la usa us west coast seattle san francisco",
  "America/Denver": "mountain mst mdt colorado usa us",
  "America/Phoenix": "arizona mst usa us",
  "America/Chicago": "central cst cdt texas illinois usa us",
  "America/New_York": "eastern est edt nyc new york boston usa us east coast",
  "America/Anchorage": "alaska akst usa us",
  "Pacific/Honolulu": "hawaii hst usa us",
  "America/Toronto": "canada eastern est",
  "America/Vancouver": "canada pacific pst",
  "America/Mexico_City": "mexico cst",
  "America/Sao_Paulo": "brazil brt",
  "Europe/London": "uk united kingdom britain british england gmt bst scotland wales",
  "Europe/Dublin": "ireland ist gmt",
  "Europe/Paris": "france cet cest central european",
  "Europe/Berlin": "germany cet cest central european",
  "Europe/Madrid": "spain cet cest",
  "Europe/Rome": "italy cet cest",
  "Europe/Amsterdam": "netherlands holland cet",
  "Europe/Zurich": "switzerland cet",
  "Europe/Athens": "greece eet",
  "Asia/Kolkata": "india ist delhi mumbai bangalore calcutta",
  "Asia/Calcutta": "india ist delhi mumbai bangalore kolkata",
  "Asia/Saigon": "vietnam ict ho chi minh",
  "Asia/Ho_Chi_Minh": "vietnam ict saigon",
  "Europe/Kiev": "ukraine eet kyiv",
  "Europe/Kyiv": "ukraine eet kiev",
  "Asia/Kathmandu": "nepal katmandu",
  "Asia/Katmandu": "nepal kathmandu",
  "Asia/Dubai": "uae gst dubai",
  "Asia/Singapore": "singapore sgt",
  "Asia/Hong_Kong": "hong kong hkt",
  "Asia/Shanghai": "china cst beijing",
  "Asia/Tokyo": "japan jst",
  "Asia/Seoul": "korea kst",
  "Australia/Sydney": "australia aest aedt",
  "Australia/Melbourne": "australia aest aedt",
  "Australia/Perth": "australia awst",
  "Pacific/Auckland": "new zealand nzst nzdt",
  "Africa/Johannesburg": "south africa sast",
  "Africa/Lagos": "nigeria wat",
};

// Shown first before anyone types.
const POPULAR = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Calcutta",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface Option {
  zone: string;
  label: string;
  search: string;
}

export default function TimeZonePicker({
  value,
  onChange,
  label = "Time zone",
  dropUp = false,
  className = "",
}: {
  value: string;
  onChange: (zone: string) => void;
  label?: string;
  dropUp?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const options = useMemo<Option[]>(() => {
    const zones = allTimeZones();
    for (const z of [value, browserTimeZone()]) if (z && !zones.includes(z)) zones.unshift(z);
    return zones.map((zone) => {
      const label = timeZoneLabel(zone);
      return { zone, label, search: `${zone.replace(/[_/]/g, " ")} ${label} ${ALIASES[zone] ?? ""}`.toLowerCase() };
    });
  }, [value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const first = [...new Set([browserTimeZone(), value, ...POPULAR])];
      const top = first.flatMap((z) => options.find((o) => o.zone === z) ?? []);
      const rest = options.filter((o) => !first.includes(o.zone)).sort((a, b) => a.label.localeCompare(b.label));
      return [...top, ...rest];
    }
    // "gmt+9" or "utc-5" only matches that exact offset (not GMT+9:30).
    const offsetQuery = /^(gmt|utc)[+-]\d{1,2}(:\d{2})?$/.test(q) ? q.replace("utc", "gmt") : null;
    const words = q.split(/\s+/);
    const score = (o: Option) => {
      const city = o.label.toLowerCase().replace(/ \(.*\)$/, "");
      const aliasWords = (ALIASES[o.zone] ?? "").split(" ");
      if (city === q || aliasWords.includes(q)) return 0;
      if (city.startsWith(q)) return 1;
      return POPULAR.includes(o.zone) ? 2 : 3;
    };
    return options
      .filter((o) =>
        offsetQuery
          ? o.label.toLowerCase().endsWith(`(${offsetQuery})`)
          : words.every((w) => o.search.includes(w)),
      )
      .sort((a, b) => {
        const popular = (o: Option) => (POPULAR.includes(o.zone) ? 0 : 1);
        return score(a) - score(b) || popular(a) - popular(b) || a.label.localeCompare(b.label);
      });
  }, [options, query, value]);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(zone: string) {
    onChange(zone);
    setOpen(false);
    setQuery("");
  }

  const current = timeZoneLabel(value);

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <input
        role="combobox"
        aria-expanded={open ? "true" : "false"}
        aria-controls={listId}
        aria-label={label}
        aria-autocomplete="list"
        value={open ? query : current}
        placeholder={open ? `Search, e.g. London, PST, India` : current}
        onFocus={(e) => {
          setOpen(true);
          setQuery("");
          setActive(0);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && results[active]) choose(results[active].zone);
          } else if (e.key === "Escape") {
            // Keep Escape from also closing the review screen.
            e.stopPropagation();
            setOpen(false);
            setQuery("");
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 pr-8 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden>
        ⌕
      </span>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 z-50 max-h-64 min-w-64 overflow-auto rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-stone-500">No time zones match “{query}”</li>
          ) : (
            results.map((o, i) => (
              <li
                key={o.zone}
                data-index={i}
                role="option"
                aria-selected={o.zone === value}
                onPointerDown={(e) => {
                  e.preventDefault();
                  choose(o.zone);
                }}
                onPointerEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${
                  i === active ? "bg-emerald-50" : ""
                }`}
              >
                <span>
                  {o.label}
                  {o.zone === browserTimeZone() && <span className="ml-1.5 text-xs text-stone-400">(this device)</span>}
                </span>
                {o.zone === value && <span className="text-emerald-600">✓</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
