"use client";

import { useEffect, useState } from "react";
import CalendarMockup, { type EditableBlock } from "./CalendarMockup";
import { Button, Spinner } from "./ui";
import { addDays, isISODate, mondayOf, toISODate, weekdayOf } from "@/lib/dates";
import { fromHHMM, toHHMM } from "@/lib/schedule";
import { DAY_NAMES } from "@/lib/types";

interface Props {
  screenshots: { url: string }[];
  blocks: EditableBlock[];
  setBlocks: (update: (prev: EditableBlock[]) => EditableBlock[]) => void;
  notes: string[];
  forOther: boolean;
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  error: string;
  onSave: () => void;
  onClose: () => void;
  onAddScreenshot: () => void;
}

let nextUid = 0;
export const newUid = () => `b${nextUid++}`;

export default function ReviewSchedule({
  screenshots,
  blocks,
  setBlocks,
  notes,
  forOther,
  name,
  setName,
  saving,
  error,
  onSave,
  onClose,
  onAddScreenshot,
}: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "read">("read");
  const selected = blocks.find((b) => b.uid === selectedUid) ?? null;
  const invalid = blocks.some((b) => b.end <= b.start);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (selectedUid ? setSelectedUid(null) : onClose());
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, selectedUid]);

  const update = (patch: Partial<EditableBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.uid === selectedUid ? { ...b, ...patch } : b)));

  function addAt(day: number, start: number) {
    const block = { uid: newUid(), day, start, end: start + 60, label: "" };
    setBlocks((prev) => [...prev, block]);
    setSelectedUid(block.uid);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100">
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-lg font-bold">Does this match {forOther ? "their" : "your"} calendar?</h2>
          <p className="text-sm text-stone-500">
            Tap an event to fix or delete it, or to mark it as just once. Tap an empty spot to add something it missed.
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </header>

      <div className="flex gap-1 border-b border-stone-200 bg-white px-4 py-2 md:hidden">
        {(
          [
            ["mine", forOther ? "Their screenshot" : "Your screenshot"],
            ["read", "What we read"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === value ? "bg-stone-900 text-white" : "text-stone-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 md:grid-cols-2 sm:p-6">
        <section className={`min-h-0 min-w-0 flex-col ${tab === "mine" ? "flex" : "hidden"} md:flex`}>
          <h3 className="mb-2 hidden text-sm font-semibold text-stone-600 md:block">{forOther ? "Their screenshot" : "Your screenshot"}</h3>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto rounded-2xl border border-stone-200 bg-white p-3">
            {screenshots.length === 0 ? (
              <p className="p-4 text-sm text-stone-500">No screenshot this time. This is your saved schedule.</p>
            ) : (
              screenshots.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.url} src={s.url} alt="Your schedule screenshot" className="w-full rounded-lg" />
              ))
            )}
          </div>
        </section>

        <section className={`min-h-0 min-w-0 flex-col ${tab === "read" ? "flex" : "hidden"} md:flex`}>
          <h3 className="mb-2 hidden text-sm font-semibold text-stone-600 md:block">What WhenWorks read</h3>
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-stone-200 bg-white p-3">
            {notes.length > 0 && (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            )}
            <CalendarMockup blocks={blocks} selectedUid={selectedUid} onSelect={setSelectedUid} onAddAt={addAt} />
          </div>
        </section>
      </div>

      {selected && (
        <div className="border-t border-stone-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={selected.label ?? ""}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="Event name"
              maxLength={40}
              autoFocus={!selected.label}
              className="min-w-40 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <div className="inline-flex rounded-lg border border-stone-300 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => update({ date: undefined })}
                className={`rounded-md px-2.5 py-1.5 font-medium ${!selected.date ? "bg-stone-900 text-white" : "text-stone-600"}`}
              >
                Every week
              </button>
              <button
                type="button"
                onClick={() => !selected.date && update({ date: dateInThisWeek(selected.day) })}
                className={`rounded-md px-2.5 py-1.5 font-medium ${selected.date ? "bg-stone-900 text-white" : "text-stone-600"}`}
              >
                Just once
              </button>
            </div>
            {selected.date ? (
              <input
                type="date"
                value={selected.date}
                onChange={(e) => isISODate(e.target.value) && update({ date: e.target.value, day: weekdayOf(e.target.value) })}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                aria-label="Date"
              />
            ) : (
              <select
                value={selected.day}
                onChange={(e) => update({ day: Number(e.target.value) })}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                aria-label="Day"
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <TimeInput value={selected.start} onChange={(start) => update({ start })} label="Start time" />
            <span className="text-sm text-stone-400">to</span>
            <TimeInput value={selected.end} onChange={(end) => update({ end })} label="End time" />
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                setBlocks((prev) => prev.filter((b) => b.uid !== selectedUid));
                setSelectedUid(null);
              }}
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setSelectedUid(null)}>
              Done
            </Button>
          </div>
          {selected.end <= selected.start && <p className="mt-1 text-xs text-red-600">End time must be after the start.</p>}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white px-4 py-3 sm:px-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={forOther ? "Their name" : "Your name"}
          maxLength={40}
          className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm sm:w-48"
          aria-label={forOther ? "Their name" : "Your name"}
        />
        <Button variant="secondary" onClick={onAddScreenshot}>
          + Add another screenshot
        </Button>
        <div className="flex flex-1 items-center justify-end gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <Button onClick={onSave} disabled={saving || invalid || !name.trim()} className="w-full sm:w-auto">
            {saving && <Spinner />} {name.trim() ? "Looks right, save it" : forOther ? "Enter their name to save" : "Enter your name to save"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function TimeInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="time"
      step={300}
      value={toHHMM(Math.min(value, 23 * 60 + 59))}
      onChange={(e) => {
        const v = fromHHMM(e.target.value);
        if (v !== null) onChange(v);
      }}
      aria-label={label}
      className="rounded-lg border border-stone-300 px-2 py-2 text-sm"
    />
  );
}

// The date of a weekday in the current week, used when someone switches an event to "Just once".
function dateInThisWeek(day: number) {
  return addDays(mondayOf(toISODate(new Date())), day);
}
