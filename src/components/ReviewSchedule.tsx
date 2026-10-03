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
  shareDetails: boolean;
  setShareDetails: (value: boolean) => void;
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
  shareDetails,
  setShareDetails,
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
  const invalid = blocks.some((b) => b.end <= b.start);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return selectedUid ? setSelectedUid(null) : onClose();
      // Delete or Backspace removes the selected event, unless you're typing in a box.
      const typing = (e.target as HTMLElement)?.closest?.("input, select, textarea");
      if ((e.key === "Delete" || e.key === "Backspace") && selectedUid && !typing) {
        e.preventDefault();
        setBlocks((prev) => prev.filter((b) => b.uid !== selectedUid));
        setSelectedUid(null);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, selectedUid, setBlocks]);

  const change = (uid: string, patch: Partial<EditableBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  const remove = (uid: string) => {
    setBlocks((prev) => prev.filter((b) => b.uid !== uid));
    setSelectedUid(null);
  };

  function create(day: number, start: number, end: number) {
    const block = { uid: newUid(), day, start, end, label: "" };
    setBlocks((prev) => [...prev, block]);
    setSelectedUid(block.uid);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100">
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-lg font-bold">Does this match {forOther ? "their" : "your"} calendar?</h2>
          <p className="text-sm text-stone-500">
            Tap an event to edit or delete it. Drag it to move it, or drag its bottom edge to change when it ends. Tap or
            drag on an empty spot to add something it missed.
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
            <CalendarMockup
              blocks={blocks}
              selectedUid={selectedUid}
              onSelect={setSelectedUid}
              onChange={change}
              onCreate={create}
              renderEditor={(block) => (
                <EventEditor
                  block={block}
                  onChange={(patch) => change(block.uid, patch)}
                  onDelete={() => remove(block.uid)}
                  onClose={() => setSelectedUid(null)}
                />
              )}
            />
          </div>
        </section>
      </div>

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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={shareDetails}
            onChange={(e) => setShareDetails(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          <span>
            Show event names to the group
            <span className="block text-xs text-stone-400">
              {shareDetails ? "Everyone sees what each event is." : "Off: the group only sees that you're busy."}
            </span>
          </span>
        </label>
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

// A small editor for one event, like the popup Google Calendar shows when you click an event.
function EventEditor({
  block,
  onChange,
  onDelete,
  onClose,
}: {
  block: EditableBlock;
  onChange: (patch: Partial<EditableBlock>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3 rounded-t-2xl border border-stone-200 bg-white p-4 shadow-2xl md:rounded-2xl">
      <div className="flex items-center gap-2">
        <input
          value={block.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Add a title"
          maxLength={40}
          autoFocus={!block.label}
          className="min-w-0 flex-1 border-b-2 border-stone-200 py-1 text-lg font-semibold outline-none focus:border-emerald-600"
        />
        <button onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="space-y-2 text-sm">
        {block.date ? (
          <input
            type="date"
            value={block.date}
            onChange={(e) => isISODate(e.target.value) && onChange({ date: e.target.value, day: weekdayOf(e.target.value) })}
            className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            aria-label="Date"
          />
        ) : (
          <select
            value={block.day}
            onChange={(e) => onChange({ day: Number(e.target.value) })}
            className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            aria-label="Day"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <TimeInput value={block.start} onChange={(start) => onChange({ start })} label="Start time" />
          <span className="text-stone-400">–</span>
          <TimeInput value={block.end} onChange={(end) => onChange({ end })} label="End time" />
        </div>
      </div>
      {block.end <= block.start && <p className="text-xs text-red-600">End time must be after the start.</p>}

      <div className="inline-flex rounded-lg border border-stone-300 p-0.5 text-sm">
        <button
          type="button"
          onClick={() => onChange({ date: undefined })}
          className={`rounded-md px-2.5 py-1 font-medium ${!block.date ? "bg-stone-900 text-white" : "text-stone-600"}`}
        >
          Every week
        </button>
        <button
          type="button"
          onClick={() => !block.date && onChange({ date: dateInThisWeek(block.day) })}
          className={`rounded-md px-2.5 py-1 font-medium ${block.date ? "bg-stone-900 text-white" : "text-stone-600"}`}
        >
          Just once
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 pt-3">
        <button onClick={onDelete} className="rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
          🗑 Delete
        </button>
        <Button onClick={onClose} className="py-1.5">
          Done
        </Button>
      </div>
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
      className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
    />
  );
}

// The date of a weekday in the current week, used when someone switches an event to "Just once".
function dateInThisWeek(day: number) {
  return addDays(mondayOf(toISODate(new Date())), day);
}
