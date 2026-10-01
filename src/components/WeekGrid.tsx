"use client";

import { useMemo, useState } from "react";
import { buildSlots, formatRange, formatTime, SLOT_MINUTES, type Slot } from "@/lib/schedule";
import { addDays, formatLongDate, parseISODate } from "@/lib/dates";
import { DAY_SHORT, type Group, type Proposal } from "@/lib/types";
import { Button } from "./ui";

interface Props {
  group: Group;
  focusId: string | null;
  weekStart: string; // The Monday of the week shown.
  proposals: Proposal[];
  onSuggest?: (date: string, start: number, end: number) => Promise<void>;
}

const ROW_PX = 11;

export default function WeekGrid({ group, focusId, weekStart, proposals, onSuggest }: Props) {
  const [suggesting, setSuggesting] = useState(false);
  const dateOf = (day: number) => addDays(weekStart, day);
  const isProposed = (slot: Slot) =>
    proposals.some((p) => p.date === dateOf(slot.day) && p.start <= slot.start && p.end > slot.start);
  const slots = useMemo(() => buildSlots(group), [group]);
  const [pickedSlot, setPicked] = useState<Slot | null>(null);
  // Tapping a time selects a whole meeting-length stretch starting there (e.g. 3pm – 4pm for an hour),
  // and "free" means free for all of it.
  const picked = useMemo(() => {
    if (!pickedSlot) return null;
    const daySlots = slots[group.days.indexOf(pickedSlot.day)] ?? [];
    const end = Math.min(pickedSlot.start + group.meetingMinutes, group.dayEnd);
    const covered = daySlots.filter((s) => s.start >= pickedSlot.start && s.start < end);
    const freeIds = group.members
      .filter((m) => covered.every((s) => s.freeIds.includes(m.id)))
      .map((m) => m.id);
    return { day: pickedSlot.day, start: pickedSlot.start, end, freeIds };
  }, [pickedSlot, slots, group]);
  const total = group.members.length;
  const focus = group.members.find((m) => m.id === focusId) ?? null;
  const names = new Map(group.members.map((m) => [m.id, m.name]));

  function cellClass(slot: Slot) {
    if (focus) return slot.freeIds.includes(focus.id) ? "bg-emerald-500" : "bg-white";
    if (total > 0 && slot.freeIds.length === total) return "bg-emerald-500";
    return "bg-white";
  }

  const rows = slots[0]?.length ?? 0;

  return (
    <div>
      <div className="flex">
        <div className="w-11 shrink-0" />
        {group.days.map((d) => (
          <div key={d} className="flex-1 pb-1 text-center text-xs font-semibold text-stone-600">
            {DAY_SHORT[d]} <span className="font-normal text-stone-400">{parseISODate(dateOf(d)).getDate()}</span>
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
          <div key={di} className="relative flex-1 border-l border-stone-200 first:border-l-0">
            {picked && picked.day === daySlots[0]?.day && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 rounded-sm border-2 border-stone-900"
                style={{
                  top: ((picked.start - group.dayStart) / SLOT_MINUTES) * ROW_PX,
                  height: ((picked.end - picked.start) / SLOT_MINUTES) * ROW_PX,
                }}
              />
            )}
            {daySlots.map((slot, i) => {
              const isPicked = pickedSlot?.day === slot.day && pickedSlot?.start === slot.start;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPicked(isPicked ? null : slot)}
                  title={`${formatRange(slot.start, slot.end)} · ${slot.freeIds.length}/${total} free`}
                  className={`block w-full ${cellClass(slot)} ${
                    slot.start % 60 === 0 ? "border-t border-stone-200" : ""
                  } ${isProposed(slot) ? "shadow-[inset_3px_0_0_#1c1917]" : ""}`}
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
              {formatLongDate(dateOf(picked.day))}, {formatRange(picked.start, picked.end)}
            </div>
              <>
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
              </>
            {onSuggest && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-2">
                <Button
                  variant={picked.freeIds.length === total ? "primary" : "secondary"}
                  disabled={suggesting}
                  className="py-1.5"
                  onClick={async () => {
                    setSuggesting(true);
                    await onSuggest(dateOf(picked.day), picked.start, picked.end);
                    setSuggesting(false);
                    setPicked(null);
                  }}
                >
                  Suggest this time
                </Button>
                {picked.freeIds.length < total && (
                  <span className="text-xs text-stone-500">Not everyone is free for the whole time.</span>
                )}
              </div>
            )}
          </div>
        ) : focus ? (
          <Legend items={[["bg-emerald-500", `${focus.name} is free`], ["bg-white border border-stone-300", "Busy"]]} />
        ) : (
          <Legend
            items={[
              ["bg-emerald-500", "Everyone free"],
              ["bg-white border border-stone-300", "Someone's busy"],
            ]}
            hint={onSuggest ? "Tap a time to see who's free or suggest it" : "Tap a time to see who's free"}
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
