"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "./ui";
import { formatRange, fromHHMM, toHHMM } from "@/lib/schedule";
import { DAY_NAMES, type BusyBlock } from "@/lib/types";

interface Props {
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
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function UploadSchedule({ initialName = "", initialBusy = [], onSave, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [blocks, setBlocks] = useState<BusyBlock[]>(initialBusy);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reading = screenshots.some((s) => s.status === "reading");
  // The review list appears once a screenshot has been tried, so a failed read can still be fixed by hand.
  const hasRead = screenshots.some((s) => s.status !== "reading") || initialBusy.length > 0;

  const addFiles = useCallback(async (files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
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
          signal: AbortSignal.timeout(120_000),
        }).catch(() => {
          throw new Error("Reading took too long. Check your connection and try again.");
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setBlocks((prev) => sortBlocks([...prev, ...data.blocks]));
        if (data.notes) setNotes((prev) => [...prev, data.notes]);
        update({
          status: "done",
          message: data.blocks.length === 0 ? "No busy times found in this one." : `Found ${data.blocks.length} busy blocks`,
        });
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

  const updateBlock = (index: number, patch: Partial<BusyBlock>) =>
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const removeBlock = (index: number) => setBlocks((prev) => prev.filter((_, i) => i !== index));
  const addBlock = () => setBlocks((prev) => [...prev, { day: 0, start: 9 * 60, end: 10 * 60, label: "" }]);

  const invalid = blocks.some((b) => b.end <= b.start);

  async function save() {
    setError("");
    setSaving(true);
    try {
      await onSave(name.trim(), sortBlocks(blocks));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-5">
      <label className="block">
        <span className="text-sm font-semibold">Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name is fine"
          maxLength={40}
          className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </label>

      <div>
        <span className="text-sm font-semibold">Your schedule</span>
        <p className="text-sm text-stone-500">
          Screenshot your class schedule or a week view of your calendar. You can add more than one, like classes and work.
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
          <span className="mt-2 font-semibold">{screenshots.length ? "Add another screenshot" : "Upload a screenshot"}</span>
          <span className="text-xs text-stone-500">Tap to choose, drag it here, or paste it</span>
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
        <p className="mt-2 text-xs text-stone-400">
          Screenshots are read by Google&apos;s Gemini AI and aren&apos;t saved here. Only your busy times are kept.
        </p>
      </div>

      {screenshots.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {screenshots.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="w-28 shrink-0">
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
            </a>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}

      {(hasRead || blocks.length > 0) && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Check your busy times</span>
            <span className="text-xs text-stone-500">Compare with your screenshot and fix anything wrong</span>
          </div>
          {blocks.length === 0 ? (
            <p className="mt-2 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
              No busy times yet. If you&apos;re really free all week, you can save as-is.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200">
              {blocks.map((b, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <select
                    value={b.day}
                    onChange={(e) => updateBlock(i, { day: Number(e.target.value) })}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm"
                    aria-label="Day"
                  >
                    {DAY_NAMES.map((d, di) => (
                      <option key={d} value={di}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <TimeInput value={b.start} onChange={(start) => updateBlock(i, { start })} label="Start time" />
                  <span className="text-stone-400">to</span>
                  <TimeInput value={b.end} onChange={(end) => updateBlock(i, { end })} label="End time" />
                  <input
                    value={b.label ?? ""}
                    onChange={(e) => updateBlock(i, { label: e.target.value })}
                    placeholder="What is it?"
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-sm text-stone-600 hover:border-stone-200 focus:border-stone-300"
                  />
                  {b.end <= b.start && <span className="text-xs text-red-600">End must be after start</span>}
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    className="ml-auto rounded-lg px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${formatRange(b.start, b.end)}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={addBlock} className="mt-2 text-sm font-medium text-emerald-700 hover:underline">
            + Add something it missed
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={save} disabled={saving || reading || !name.trim() || !hasRead || invalid} className="flex-1">
          {saving && <Spinner />} {reading ? "Reading your screenshot…" : "Save my schedule"}
        </Button>
      </div>
    </Card>
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
      className="rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
    />
  );
}

function sortBlocks(blocks: BusyBlock[]) {
  return [...blocks].sort((a, b) => a.day - b.day || a.start - b.start);
}
