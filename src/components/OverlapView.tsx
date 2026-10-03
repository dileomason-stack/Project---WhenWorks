"use client";

import { useMemo, useState } from "react";
import { layoutDay } from "./CalendarMockup";
import { buildSlots, formatRange, formatTime, SLOT_MINUTES } from "@/lib/schedule";
import { addDays, convertTime, DEFAULT_TIME_ZONE, parseISODate, timeZoneCity } from "@/lib/dates";
import { DAY_NAMES, DAY_SHORT, type BusyBlock, type Group } from "@/lib/types";

// One color per person, in a fixed order checked for colorblind-safe contrast between neighbors.
// Past eight people, everyone else shares gray (their names still show on each block).
const PERSON_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const EXTRA_COLOR = "#8a8a85";
export const colorForIndex = (i: number) => PERSON_COLORS[i] ?? EXTRA_COLOR;

const HOUR_PX = 44;

type Event = BusyBlock & { memberId: string; key: string };

export default function OverlapView({ group, weekStart, viewerZone }: { group: Group; weekStart: string; viewerZone: string }) {
  const groupZone = group.timeZone ?? DEFAULT_TIME_ZONE;
  const twoZones = viewerZone !== groupZone;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Event | null>(null);
  const colors = new Map(group.members.map((m, i) => [m.id, colorForIndex(i)]));
  const names = new Map(group.members.map((m) => [m.id, m.name]));
  const total = group.members.length;

  // Light green behind times when everyone is free, so free time still stands out.
  const freeSlots = useMemo(
    () => buildSlots(group).map((day) => day.filter((s) => total > 0 && s.freeIds.length === total)),
    [group, total],
  );

  const events: Event[] = group.members
    .filter((m) => !hidden.has(m.id))
    .flatMap((m) =>
      m.busy
        .filter((b) => b.end > group.dayStart && b.start < group.dayEnd)
        .map((b, i) => ({
          ...b,
          start: Math.max(b.start, group.dayStart),
          end: Math.min(b.end, group.dayEnd),
          memberId: m.id,
          key: `${m.id}-${i}`,
        })),
    );

  const hours: number[] = [];
  for (let t = group.dayStart; t < group.dayEnd; t += 60) hours.push(t);
  const height = ((group.dayEnd - group.dayStart) / 60) * HOUR_PX;
  const top = (minute: number) => ((minute - group.dayStart) / 60) * HOUR_PX;

  const toggle = (memberId: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {group.members.map((m) => {
          const off = hidden.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              aria-pressed={!off}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                off ? "border-stone-200 text-stone-400 line-through" : "border-stone-300 text-stone-800"
              }`}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: off ? "#d6d3d1" : colors.get(m.id) }} />
              {m.name}
            </button>
          );
        })}
        <span className="flex items-center gap-1.5 px-1 text-xs text-stone-500">
          <span className="h-3 w-3 rounded-sm border border-emerald-300 bg-emerald-100" /> Everyone free
        </span>
      </div>
      <p className="mb-3 text-xs text-stone-500">Tap a name to hide or show their events. Tap an event for details.</p>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="flex items-end border-b border-stone-200 pb-1">
            {twoZones && (
              <div className="w-11 shrink-0 pr-1.5 text-right text-[9px] font-semibold leading-tight text-sky-700">{timeZoneCity(viewerZone)}</div>
            )}
            <div className={`w-11 shrink-0 pr-1.5 text-right text-[9px] font-semibold leading-tight text-stone-500 ${twoZones ? "" : "invisible"}`}>
              {timeZoneCity(groupZone)}
            </div>
            {group.days.map((d) => (
              <div key={d} className="min-w-[72px] flex-1 text-center text-xs font-semibold text-stone-600">
                {DAY_SHORT[d]}{" "}
                <span className="font-normal text-stone-400">{parseISODate(addDays(weekStart, d)).getDate()}</span>
              </div>
            ))}
          </div>
          <div className="flex">
            {twoZones && (
              <div className="relative w-11 shrink-0" style={{ height }}>
                {hours.map((t, i) => (
                  <div key={t} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-sky-700/70" style={{ top: i * HOUR_PX }}>
                    {i === 0 ? "" : formatTime(convertTime(weekStart, t, groupZone, viewerZone).minutes)}
                  </div>
                ))}
              </div>
            )}
            <div className="relative w-11 shrink-0" style={{ height }}>
              {hours.map((t, i) => (
                <div key={t} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-stone-400" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? "" : formatTime(t)}
                </div>
              ))}
            </div>
            {group.days.map((d, di) => (
              <div
                key={d}
                className="relative min-w-[72px] flex-1 border-l border-stone-200"
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, #e7e5e4 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
              >
                {freeSlots[di].map((s) => (
                  <div
                    key={s.start}
                    className="absolute inset-x-0 bg-emerald-100"
                    style={{ top: top(s.start), height: (SLOT_MINUTES / 60) * HOUR_PX }}
                  />
                ))}
                {layoutDay(events.filter((e) => e.day === d)).map(({ block, col, cols }) => {
                  const color = colors.get(block.memberId)!;
                  const h = Math.max(top(block.end) - top(block.start), 14);
                  const selected = picked?.key === block.key;
                  return (
                    <button
                      key={block.key}
                      type="button"
                      onClick={() => setPicked(selected ? null : block)}
                      title={`${names.get(block.memberId)} · ${block.label || "Busy"} · ${formatRange(block.start, block.end)}`}
                      className={`absolute overflow-hidden rounded-[4px] border-l-[3px] bg-white text-left text-[10px] leading-tight text-stone-900 ${
                        selected ? "z-10 ring-2 ring-stone-900" : ""
                      }`}
                      style={{
                        top: top(block.start) + 1,
                        height: h - 2,
                        left: `calc(${(col / cols) * 100}% + 1px)`,
                        width: `calc(${100 / cols}% - 2px)`,
                        borderLeftColor: color,
                        backgroundColor: `color-mix(in srgb, ${color} 22%, white)`,
                      }}
                    >
                      <span className="block px-1 pt-0.5 font-semibold">{names.get(block.memberId)}</span>
                      {h > 28 && cols < 3 && <span className="block px-1 text-stone-700">{block.label}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-10 text-sm">
        {picked && (
          <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: colors.get(picked.memberId) }} />
            <div>
              <b>{names.get(picked.memberId)}</b> · {picked.label || "Busy"}
              <div className="text-stone-500">
                {DAY_NAMES[picked.day]}, {formatRange(picked.start, picked.end)}
                {picked.date ? " (just this week)" : " (every week)"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
