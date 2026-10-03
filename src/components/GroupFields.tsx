"use client";

import { useMemo } from "react";
import { allTimeZones, timeZoneLabel } from "@/lib/dates";
import type { GroupSettings } from "@/lib/groupSettings";
import { formatTime } from "@/lib/schedule";
import { DAY_SHORT } from "@/lib/types";

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60);
const fieldClass = "mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5";

// The group's settings fields, shared by "make a group" and the creator's group settings.
export default function GroupFields({
  value,
  onChange,
  autoFocus = false,
}: {
  value: GroupSettings;
  onChange: (patch: Partial<GroupSettings>) => void;
  autoFocus?: boolean;
}) {
  const zones = useMemo(() => {
    const list = allTimeZones();
    if (!list.includes(value.timeZone)) list.unshift(value.timeZone);
    return list.map((z) => ({ zone: z, label: timeZoneLabel(z) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [value.timeZone]);

  const toggleDay = (d: number) =>
    onChange({ days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort() });

  return (
    <>
      <label className="block">
        <span className="text-sm font-semibold">Group name</span>
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. CSC 101 project group"
          maxLength={80}
          className={`${fieldClass} outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100`}
          autoFocus={autoFocus}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold">How many people are in the group?</span>
        <select
          value={value.expectedCount ?? ""}
          onChange={(e) => onChange({ expectedCount: e.target.value ? Number(e.target.value) : undefined })}
          className={fieldClass}
        >
          <option value="">Not sure yet</option>
          {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>
              {n} people
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">So the page can show who still needs to add theirs.</span>
      </label>

      <div>
        <span className="text-sm font-semibold">Meeting type</span>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(
            [
              ["in_person", "In person", "Meet up somewhere"],
              ["online", "Online call", "Video call link"],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              type="button"
              key={mode}
              onClick={() => onChange({ mode })}
              className={`rounded-xl border px-3 py-2.5 text-left ${
                value.mode === mode ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-xs text-stone-500">{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">How long is the meeting?</span>
        <select
          value={value.meetingMinutes}
          onChange={(e) => onChange({ meetingMinutes: Number(e.target.value) })}
          className={fieldClass}
        >
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>1 hour</option>
          <option value={90}>1.5 hours</option>
          <option value={120}>2 hours</option>
        </select>
      </label>

      <div>
        <span className="text-sm font-semibold">Which days could work?</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DAY_SHORT.map((label, d) => (
            <button
              type="button"
              key={label}
              onClick={() => toggleDay(d)}
              className={`w-12 rounded-lg border py-2 text-sm font-medium ${
                value.days.includes(d) ? "border-emerald-500 bg-emerald-600 text-white" : "border-stone-300 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">Group time zone</span>
        <select value={value.timeZone} onChange={(e) => onChange({ timeZone: e.target.value })} className={fieldClass}>
          {zones.map(({ zone, label }) => (
            <option key={zone} value={zone}>
              {label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          The hours below, suggested times and invites use this time zone. People elsewhere still see their own time too.
        </span>
      </label>

      <div>
        <span className="text-sm font-semibold">Between</span>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={value.dayStart}
            onChange={(e) => onChange({ dayStart: Number(e.target.value) })}
            className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
            aria-label="Earliest time"
          >
            {HOURS.slice(0, 24).map((m) => (
              <option key={m} value={m} disabled={m >= value.dayEnd}>
                {formatTime(m)}
              </option>
            ))}
          </select>
          <span className="text-stone-500">and</span>
          <select
            value={value.dayEnd}
            onChange={(e) => onChange({ dayEnd: Number(e.target.value) })}
            className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
            aria-label="Latest time"
          >
            {HOURS.slice(1).map((m) => (
              <option key={m} value={m} disabled={m <= value.dayStart}>
                {m === 24 * 60 ? "midnight" : formatTime(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
