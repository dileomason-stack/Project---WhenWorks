"use client";

import { useMemo, useState } from "react";
import { buildSlots, formatRange, formatTime, SLOT_MINUTES, type Slot } from "@/lib/schedule";
import { DAY_SHORT, type Group } from "@/lib/types";

interface Props {
  group: Group;
  focusId: string | null;
}

const ROW_PX = 11;

export default function WeekGrid({ group, focusId }: Props) {
  const slots = useMemo(() => buildSlots(group), [group]);
  const [picked, setPicked] = useState<Slot | null>(null);
  const total = group.members.length;
  const focus = group.members.find((m) => m.id === focusId) ?? null;
  const names = new Map(group.members.map((m) => [m.id, m.name]));

  function cellClass(slot: Slot) {
    if (total === 0) return "bg-stone-50";
    if (focus) return slot.freeIds.includes(focus.id) ? "bg-sky-400" : "bg-stone-100";
    const n = slot.freeIds.length;
    if (n === total) return "bg-emerald-500";
    const ratio = n / total;
    if (ratio >= 0.75) return "bg-emerald-300";
    if (ratio >= 0.5) return "bg-emerald-200";
    if (ratio > 0) return "bg-emerald-100";
    return "bg-stone-100";
  }

  const rows = slots[0]?.length ?? 0;

  return (
    <div>
      <div className="flex">
        <div className="w-11 shrink-0" />
        {group.days.map((d) => (
          <div key={d} className="flex-1 pb-1 text-center text-xs font-semibold text-stone-600">
            {DAY_SHORT[d]}
          </div>
        ))}
      </div>
      <div className="flex">
        <div className="relative w-11 shrink-0" style={{ height: rows * ROW_PX }}>
          {slots[0]?.map((s, i) =>
            s.start % 60 === 0 ? (
              <div key={i} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-stone-400" style={{ top: i * ROW_PX }}>
                {formatTime(s.start)}
              </div>
            ) : null,
          )}
        </div>
        {slots.map((daySlots, di) => (
          <div key={di} className="flex-1 border-l border-white">
            {daySlots.map((slot, i) => {
              const isPicked = picked && picked.day === slot.day && picked.start === slot.start;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPicked(isPicked ? null : slot)}
                  title={`${formatRange(slot.start, slot.end)} · ${slot.freeIds.length}/${total} free`}
                  className={`block w-full ${cellClass(slot)} ${
                    slot.start % 60 === 0 ? "border-t border-white" : ""
                  } ${isPicked ? "outline-2 -outline-offset-2 outline-stone-900" : ""}`}
                  style={{ height: ROW_PX }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 min-h-12 text-sm">
        {picked ? (
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <div className="font-semibold">
              {DAY_SHORT[picked.day]} {formatRange(picked.start, picked.start + SLOT_MINUTES)}
            </div>
            <div className="text-emerald-700">
              Free: {picked.freeIds.map((id) => names.get(id)).join(", ") || "nobody"}
            </div>
            {picked.freeIds.length < total && (
              <div className="text-stone-500">
                Busy:{" "}
                {group.members
                  .filter((m) => !picked.freeIds.includes(m.id))
                  .map((m) => m.name)
                  .join(", ")}
              </div>
            )}
          </div>
        ) : focus ? (
          <Legend items={[["bg-sky-400", `${focus.name} is free`], ["bg-stone-100", "Busy"]]} />
        ) : (
          <Legend
            items={[
              ["bg-emerald-500", "Everyone free"],
              ["bg-emerald-200", "Some free"],
              ["bg-stone-100", "Nobody free"],
            ]}
            hint="Tap a time to see who's free"
          />
        )}
      </div>
    </div>
  );
}

function Legend({ items, hint }: { items: [string, string][]; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${cls}`} /> {label}
        </span>
      ))}
      {hint && <span className="text-stone-400">{hint}</span>}
    </div>
  );
}
