"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type EditableBlock } from "./CalendarMockup";
import ReviewSchedule, { newUid } from "./ReviewSchedule";
import { Button, Card, Spinner } from "./ui";
import type { BusyBlock } from "@/lib/types";

interface Props {
  // True when uploading a screenshot someone else sent you, which changes "your" to "their" in the wording.
  forOther?: boolean;
  initialName?: string;
  initialBusy?: BusyBlock[];
  onSave: (name: string, busy: BusyBlock[]) => Promise<void>;
  onCancel?: () => void;
}

interface Screenshot {
  url: string;
  status: "reading" | "done" | "error";
  message?: string;
}

// Shrinks big screenshots before sending so uploads are fast, keeping text readable.
async function prepareImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open that image. Try a PNG or JPG screenshot."));
      setTimeout(() => reject(new Error("Couldn't open that image. Try a PNG or JPG screenshot.")), 15_000);
      el.src = url;
    });
    const maxPixels = 4_000_000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (img.naturalWidth * img.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // The server only accepts uploads up to about 4.5 MB, so lower the quality if a huge screenshot is too big.
    let dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    for (const quality of [0.8, 0.65, 0.5]) {
      if (dataUrl.length < 3_500_000) break;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function UploadSchedule({ forOther = false, initialName = "", initialBusy = [], onSave, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => initialBusy.map((b) => ({ ...b, uid: newUid() })));
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isPhone = useIsPhone();

  const reading = screenshots.some((s) => s.status === "reading");
  // Review opens once a screenshot has been tried, so a failed read can still be fixed by hand.
  const canReview = screenshots.some((s) => s.status !== "reading") || initialBusy.length > 0;

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    for (const file of images) {
      const shot: Screenshot = { url: URL.createObjectURL(file), status: "reading" };
      setScreenshots((prev) => [...prev, shot]);
      const update = (patch: Partial<Screenshot>) =>
        setScreenshots((prev) => prev.map((s) => (s.url === shot.url ? { ...s, ...patch } : s)));
      try {
        const { base64, mimeType } = await prepareImage(file);
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType }),
          signal: AbortSignal.timeout(180_000),
        }).catch(() => {
          throw new Error("Reading took too long. Check your connection and try again.");
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setBlocks((prev) => mergeBlocks(prev, data.blocks));
        if (data.notes) setNotes((prev) => [...prev, data.notes]);
        update({
          status: "done",
          message: data.blocks.length === 0 ? "No busy times found in this one." : `Found ${data.blocks.length} events`,
        });
        setReviewing(true);
      } catch (err) {
        update({ status: "error", message: err instanceof Error && err.message ? err.message : "Couldn't read this one." });
      }
    }
  }, []);

  // Lets people paste a screenshot straight from their clipboard (Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  async function save() {
    setError("");
    setSaving(true);
    try {
      await onSave(
        name.trim(),
        sortBlocks(blocks.map(({ day, start, end, label, date }) => ({ day, start, end, label, ...(date ? { date } : {}) }))),
      );
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-5">
      <label className="block">
        <span className="text-sm font-semibold">{forOther ? "Their name" : "Your name"}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={forOther ? "Their first name" : "First name is fine"}
          maxLength={40}
          className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </label>

      <div>
        <span className="text-sm font-semibold">{forOther ? "Their schedule" : "Your schedule"}</span>
        <p className="text-sm text-stone-500">
          {forOther
            ? "Upload the screenshot they sent you. If they sent more than one, add them all."
            : "Screenshot your class schedule or a week view of your calendar. If it doesn't fit in one, add more (like morning and afternoon)."}
        </p>
        <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span aria-hidden>⚠️</span>
          <span>
            Make sure your screenshot includes <b>the times down the left side</b> and <b>the days across the top</b>.
            Without them, there&apos;s no way to tell when each event is.
          </span>
        </p>
        <div
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-emerald-500 bg-emerald-50" : "border-stone-300 hover:border-emerald-400 hover:bg-stone-50"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isPhone ? (
            <>
              <span className="mt-2 font-semibold">{screenshots.length ? "Add another from Photos" : "Add from Photos"}</span>
              <span className="text-xs text-stone-500">Pick your calendar screenshot. You can pick more than one.</span>
            </>
          ) : (
            <>
              <span className="mt-2 font-semibold">{screenshots.length ? "Add another screenshot" : "Upload a screenshot"}</span>
              <span className="text-xs text-stone-500">Click to choose, drag it here, or paste it</span>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <details open={isPhone} className="mt-2 rounded-xl bg-stone-50 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-emerald-700 select-none">
            How to screenshot your calendar on iPhone
          </summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-stone-600">
            <li>
              <b className="text-stone-800">Open week view.</b> Google Calendar app: tap ☰ (top left) → <b>Week</b>. Apple
              Calendar: turn your phone sideways to see the whole week.
            </li>
            <li>
              <b className="text-stone-800">Hide calendars that aren&apos;t yours.</b> Google: in the same ☰ menu, uncheck
              them. Apple: tap <b>Calendars</b> at the bottom and uncheck them.
            </li>
            <li>
              <b className="text-stone-800">Take the screenshot:</b> press the <b>side button</b> and <b>volume up</b> at
              the same time. Pinch to zoom out first if your day doesn&apos;t fit, or take one of the morning and one of
              the afternoon.
            </li>
            <li>
              <b className="text-stone-800">Come back here</b>, tap <b>Add from Photos</b>, and pick your screenshot(s).
            </li>
          </ol>
        </details>
        <details className="mt-2 rounded-xl bg-stone-50 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-emerald-700 select-none">
            Calendar doesn&apos;t fit in one screenshot?
          </summary>
          <ul className="mt-2 space-y-2 text-stone-600">
            <li>
              <b className="text-stone-800">On a laptop:</b> press{" "}
              <Key>⌘ Cmd</Key> + <Key>−</Key> (Mac) or <Key>Ctrl</Key> + <Key>−</Key> (Windows) a few times to zoom out
              until your whole day fits. <Key>⌘ Cmd</Key> + <Key>0</Key> or <Key>Ctrl</Key> + <Key>0</Key> sets it back.
            </li>
            <li>
              <b className="text-stone-800">Google Calendar:</b> Settings (gear icon) → Density and color → Compact fits
              more hours on screen.
            </li>
            <li>
              <b className="text-stone-800">Shared calendars:</b> turn off calendars that aren&apos;t yours (like a
              partner&apos;s or roommate&apos;s) before you take the screenshot, so their events don&apos;t count as your
              busy times. In Google Calendar, uncheck them in the left sidebar.
            </li>
          </ul>
        </details>
        <p className="mt-2 text-xs text-stone-400">
          Screenshots are read by Google&apos;s free Gemini AI, which usually takes 15–30 seconds and can take up to a
          minute when it&apos;s busy. Screenshots aren&apos;t saved here, only your busy times.
        </p>
      </div>

      {screenshots.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {screenshots.map((s) => (
            <div key={s.url} className="w-28 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt="Your screenshot" className="h-36 w-28 rounded-lg border border-stone-200 object-cover object-top" />
              <div
                className={`mt-1 flex items-center gap-1 text-xs ${
                  s.status === "error" ? "text-red-600" : s.status === "reading" ? "text-stone-500" : "text-emerald-700"
                }`}
              >
                {s.status === "reading" ? (
                  <>
                    <Spinner /> Reading…
                  </>
                ) : (
                  s.message
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reading && <ReadingStatus />}

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => setReviewing(true)} disabled={reading || !canReview} className="flex-1">
          {reading ? (
            <>
              <Spinner /> Reading your screenshot…
            </>
          ) : (
            "Check it and save"
          )}
        </Button>
      </div>

      {reviewing && (
        <ReviewSchedule
          screenshots={screenshots.filter((s) => s.status === "done")}
          blocks={blocks}
          setBlocks={setBlocks}
          notes={notes}
          forOther={forOther}
          name={name}
          setName={setName}
          saving={saving}
          error={error}
          onSave={save}
          onClose={() => setReviewing(false)}
          onAddScreenshot={() => {
            setReviewing(false);
            fileInput.current?.click();
          }}
        />
      )}
    </Card>
  );
}

// Combines events from several screenshots. When two screenshots overlap, the same event shows up
// twice (sometimes cut off at the edge of one), so matching events are joined into one. Different
// events at the same time, like classes on two layered calendars, are kept separate.
function mergeBlocks(existing: EditableBlock[], incoming: BusyBlock[]) {
  // Only match against earlier screenshots, never within the same one, so side-by-side events stay separate.
  const result = [...existing];
  const before = existing.length;
  const sameLabel = (x?: string, y?: string) => {
    if (!x || !y) return false;
    const [a, b] = [x.toLowerCase(), y.toLowerCase()];
    return a.startsWith(b) || b.startsWith(a);
  };
  for (const b of incoming) {
    const overlaps = (e: BusyBlock) => e.day === b.day && e.start <= b.end && b.start <= e.end;
    const earlier = result.slice(0, before);
    let match = earlier.findIndex((e) => overlaps(e) && sameLabel(e.label, b.label));
    if (match === -1 && !b.label) {
      match = earlier.findIndex(
        (e) => overlaps(e) && !e.label && (Math.abs(e.start - b.start) <= 10 || Math.abs(e.end - b.end) <= 10),
      );
    }
    if (match === -1) {
      result.push({ ...b, uid: newUid() });
    } else {
      const e = result[match];
      const longer = (b.label?.length ?? 0) > (e.label?.length ?? 0) ? b.label : e.label;
      result[match] = { ...e, start: Math.min(e.start, b.start), end: Math.max(e.end, b.end), label: longer };
    }
  }
  return result;
}

function sortBlocks<T extends BusyBlock>(blocks: T[]) {
  return [...blocks].sort((a, b) => a.day - b.day || a.start - b.start);
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-stone-300 bg-white px-1.5 py-0.5 font-sans text-xs font-semibold text-stone-700 shadow-[0_1px_0_#d6d3d1]">
      {children}
    </kbd>
  );
}

// Reading can take a while on Google's free tier, so explain what's happening as time passes
// instead of leaving people staring at a spinner wondering if it broke.
function ReadingStatus() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const [title, detail] =
    seconds < 12
      ? ["Reading your schedule…", "This usually takes 15–30 seconds."]
      : seconds < 35
        ? ["Still reading, almost there…", "Busy calendars take a little longer to read carefully."]
        : seconds < 75
          ? [
              "Google's free AI is busy right now, so we're retrying.",
              "This can take up to a minute. It isn't broken, so keep this page open.",
            ]
          : ["This is taking longer than usual.", "Hang on a bit more. If nothing happens, you'll get a message to try again."];

  return (
    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
      <span className="mt-0.5">
        <Spinner />
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-emerald-800/80">
          {detail} <span className="tabular-nums text-emerald-800/60">({seconds}s)</span>
        </div>
      </div>
    </div>
  );
}

// True on touch-screen phones and tablets, where people pick screenshots from their photo library.
function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(pointer: coarse)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
