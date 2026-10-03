"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { addDays } from "@/lib/dates";
import { formatRange, formatTime } from "@/lib/schedule";
import { DAY_SHORT, type BusyBlock } from "@/lib/types";

export type EditableBlock = BusyBlock & { uid: string };

interface Props {
  blocks: EditableBlock[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onChange: (uid: string, patch: Partial<EditableBlock>) => void;
  onCreate: (day: number, start: number, end: number) => void;
  // The editor shown next to the selected event (or as a sheet on phones).
  renderEditor?: (block: EditableBlock) => ReactNode;
}

const HOUR_PX = 46;
const SNAP = 15;
// Each day gets at least this much room; on phones the calendar scrolls sideways instead of squishing.
const DAY_WIDTH = "min-w-[88px] flex-1";
// US calendars (Google, Apple) start the week on Sunday, so the mockup does too to make comparing easy.
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
// Side-by-side events alternate shades, like layered calendars in Google Calendar.
const SHADES = ["bg-emerald-700 text-white", "bg-lime-600 text-white", "bg-emerald-500 text-white"];

// Places events that overlap side by side, the way Google Calendar does.
export function layoutDay<T extends { start: number; end: number }>(blocks: T[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { block: T; col: number; cols: number }[] = [];
  let cluster: { block: T; col: number; cols: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    for (const p of cluster) p.cols = columnEnds.length;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
  };
  for (const block of sorted) {
    if (block.start >= clusterEnd) closeCluster();
    let col = columnEnds.findIndex((end) => end <= block.start);
    if (col === -1) col = columnEnds.push(block.end) - 1;
    else columnEnds[col] = block.end;
    cluster.push({ block, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  closeCluster();
  return placed;
}

type Drag =
  | { kind: "move" | "resize"; uid: string; x: number; y: number; orig: EditableBlock; moved: boolean }
  | { kind: "create"; day: number; anchor: number; current: number; pointerType: string; y: number; moved: boolean };

const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP;

export default function CalendarMockup({ blocks, selectedUid, onSelect, onChange, onCreate, renderEditor }: Props) {
  const days = DISPLAY_ORDER.filter((d) => (d >= 0 && d <= 4) || blocks.some((b) => b.day === d));
  // The visible hours grow to fit the events, but don't shrink while dragging so the grid doesn't jump.
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const fitStart = Math.min(8 * 60, ...blocks.map((b) => Math.floor(b.start / 60) * 60));
  const fitEnd = Math.max(18 * 60, ...blocks.map((b) => Math.ceil(b.end / 60) * 60));
  const rangeStart = range ? Math.min(range.start, fitStart) : fitStart;
  const rangeEnd = range ? Math.max(range.end, fitEnd) : fitEnd;
  const hours = [];
  for (let t = rangeStart; t < rangeEnd; t += 60) hours.push(t);
  const height = ((rangeEnd - rangeStart) / 60) * HOUR_PX;

  const columns = useRef(new Map<number, HTMLDivElement>());
  const eventEls = useRef(new Map<string, HTMLDivElement>());
  // Where the selected event is on screen, so its editor can float beside it without being cut off.
  const [anchor, setAnchor] = useState<{ left: number; right: number; top: number } | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // The window listeners below read the latest drag from here, so they don't need re-adding on every move.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  // The latest props and visible hours, for the pointer handlers below (they outlive a single render).
  const live = useRef({ onChange, onCreate, onSelect, selectedUid, rangeStart, rangeEnd });
  useEffect(() => {
    live.current = { onChange, onCreate, onSelect, selectedUid, rangeStart, rangeEnd };
  });

  useLayoutEffect(() => {
    const place = () => {
      const el = selectedUid ? eventEls.current.get(selectedUid) : null;
      const r = el?.getBoundingClientRect();
      setAnchor(r ? { left: r.left, right: r.right, top: r.top } : null);
    };
    place();
    // Keep it next to the event while the calendar or page scrolls.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [selectedUid, blocks, drag]);

  const minuteAt = (day: number, clientY: number, top = rangeStart) => {
    const col = columns.current.get(day);
    if (!col) return top;
    return top + ((clientY - col.getBoundingClientRect().top) / HOUR_PX) * 60;
  };
  const dayAt = (clientX: number, fallback: number) => {
    for (const [day, col] of columns.current) {
      const r = col.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return day;
    }
    return fallback;
  };

  // Starts a drag and listens for the pointer right away, so even a very quick click is caught.
  function startDrag(next: Drag) {
    const top = rangeStart;
    const bottom = rangeEnd;
    setRange({ start: top, end: bottom });
    setDrag(next);

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.abs(e.clientY - d.y) > 4 || ("x" in d && Math.abs(e.clientX - d.x) > 4);
      if (d.kind === "create") {
        setDrag({ ...d, moved, current: Math.max(top, Math.min(bottom, snap(minuteAt(d.day, e.clientY, top)))) });
        return;
      }
      if (!moved) return;
      const dy = snap(((e.clientY - d.y) / HOUR_PX) * 60);
      if (d.kind === "resize") {
        live.current.onChange(d.uid, { end: Math.min(24 * 60, Math.max(d.orig.start + SNAP, d.orig.end + dy)) });
      } else {
        const length = d.orig.end - d.orig.start;
        const start = Math.max(0, Math.min(24 * 60 - length, d.orig.start + dy));
        const day = dayAt(e.clientX, d.orig.day);
        // One-time events move to the matching date in the same week.
        const date = d.orig.date ? addDays(d.orig.date, day - d.orig.day) : undefined;
        live.current.onChange(d.uid, { start, end: start + length, day, ...(date ? { date } : {}) });
      }
      setDrag({ ...d, moved: true });
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onUp = () => {
      stop();
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const { onCreate, onSelect, selectedUid } = live.current;
      if (d.kind === "create") {
        const a = snap(d.anchor);
        // A tap or a tiny drag makes a one-hour event; a real drag makes one as long as the drag.
        const [start, end] =
          d.moved && Math.abs(d.current - a) >= SNAP ? [Math.min(a, d.current), Math.max(a, d.current)] : [a, a + 60];
        onCreate(d.day, Math.max(0, start), Math.min(24 * 60, end));
      } else if (!d.moved) {
        onSelect(selectedUid === d.uid ? null : d.uid);
      } else {
        onSelect(d.uid);
      }
    };
    const onCancel = () => {
      stop();
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  const selected = blocks.find((b) => b.uid === selectedUid) ?? null;
  const creating = drag?.kind === "create" && drag.moved ? drag : null;
  const editing = drag && drag.kind !== "create" && drag.moved;

  return (
    <div className={`min-w-max select-none ${editing ? "cursor-grabbing" : ""}`}>
      <div className="sticky -top-3 z-20 -mt-3 flex border-b border-stone-200 bg-white pt-3 pb-1.5">
        <div className="sticky left-0 z-10 w-12 shrink-0 bg-white" />
        {days.map((d) => (
          <div key={d} className={`${DAY_WIDTH} text-center text-xs font-semibold uppercase tracking-wide text-stone-500`}>
            {DAY_SHORT[d]}
          </div>
        ))}
      </div>
      <div className="flex">
        <div className="sticky left-0 z-10 w-12 shrink-0 bg-white" style={{ height }}>
          {hours.map((t, i) => (
            <div key={t} className="absolute right-2 -translate-y-1/2 text-[10px] text-stone-400" style={{ top: i * HOUR_PX }}>
              {i === 0 ? "" : formatTime(t).toUpperCase()}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d}
            ref={(el) => {
              if (el) columns.current.set(d, el);
              else columns.current.delete(d);
            }}
            className={`relative ${DAY_WIDTH} cursor-cell border-l border-stone-200`}
            style={{
              height,
              touchAction: "pan-x pan-y",
              backgroundImage: `repeating-linear-gradient(to bottom, #e7e5e4 0 1px, transparent 1px ${HOUR_PX}px)`,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (selectedUid) {
                onSelect(null);
                return;
              }
              const minute = Math.max(rangeStart, Math.min(rangeEnd - SNAP, Math.floor(minuteAt(d, e.clientY) / SNAP) * SNAP));
              startDrag({ kind: "create", day: d, anchor: minute, current: minute, pointerType: e.pointerType, y: e.clientY, moved: false });
            }}
          >
            {layoutDay(blocks.filter((b) => b.day === d)).map(({ block, col, cols }) => {
              const top = ((block.start - rangeStart) / 60) * HOUR_PX;
              const h = Math.max(((block.end - block.start) / 60) * HOUR_PX, 16);
              const selected = block.uid === selectedUid;
              const active = drag && drag.kind !== "create" && drag.uid === block.uid;
              return (
                <div
                  key={block.uid}
                  ref={(el) => {
                    if (el) eventEls.current.set(block.uid, el);
                    else eventEls.current.delete(block.uid);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${block.label || "Busy"}, ${formatRange(block.start, block.end)}. Press Enter to edit.`}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(block.uid)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const resize = (e.target as HTMLElement).dataset.handle === "resize";
                    startDrag({ kind: resize ? "resize" : "move", uid: block.uid, x: e.clientX, y: e.clientY, orig: block, moved: false });
                  }}
                  className={`group absolute overflow-hidden rounded-md text-left leading-tight shadow-sm ${
                    cols >= 3 ? "px-0.5 py-0.5 text-[9px]" : "px-1.5 py-1 text-[11px]"
                  } ${SHADES[col % SHADES.length]} ${
                    selected || active ? "z-10 ring-2 ring-stone-900 ring-offset-1" : "hover:brightness-110"
                  } ${active && drag?.moved ? "cursor-grabbing opacity-90 shadow-lg" : "cursor-grab"} ${
                    block.date ? "border-2 border-dashed border-white/80" : ""
                  }`}
                  style={{
                    top: top + 1,
                    height: h - 2,
                    left: `calc(${(col / cols) * 100}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                    touchAction: "none",
                  }}
                  title={`${block.label || "Busy"} · ${formatRange(block.start, block.end)}`}
                >
                  {block.date && cols < 3 && (
                    <div className="mb-0.5 inline-block rounded bg-white/25 px-1 text-[9px] font-bold uppercase tracking-wide">
                      Once
                    </div>
                  )}
                  <div className="font-semibold">{block.label || "Busy"}</div>
                  {cols < 3 && <div className="opacity-90">{formatRange(block.start, block.end)}</div>}
                  {/* Drag this strip to change when the event ends. */}
                  <div
                    data-handle="resize"
                    className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center"
                  >
                    <span data-handle="resize" className="mb-0.5 h-0.5 w-5 rounded bg-white/70 opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
              );
            })}

            {creating && creating.day === d && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-emerald-600 bg-emerald-600/20 px-1.5 py-1 text-[11px] font-semibold text-emerald-900"
                style={{
                  top: ((Math.min(creating.anchor, creating.current) - rangeStart) / 60) * HOUR_PX,
                  height: (Math.max(SNAP, Math.abs(creating.current - creating.anchor)) / 60) * HOUR_PX,
                }}
              >
                {formatRange(Math.min(creating.anchor, creating.current), Math.max(creating.anchor, creating.current))}
              </div>
            )}

          </div>
        ))}
      </div>

      {renderEditor && selected && anchor && !drag && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:top-[var(--y)] md:left-[var(--x)] md:w-[22rem]"
          style={editorPosition(anchor)}
        >
          {renderEditor(selected)}
        </div>
      )}
    </div>
  );
}

// Beside the event on the right if it fits, otherwise on the left, and always inside the window.
function editorPosition(anchor: { left: number; right: number; top: number }) {
  const width = 352;
  const gap = 8;
  const x = anchor.right + gap + width <= window.innerWidth - 8 ? anchor.right + gap : Math.max(8, anchor.left - gap - width);
  const y = Math.min(Math.max(8, anchor.top), window.innerHeight - 340);
  return { ["--x" as string]: `${x}px`, ["--y" as string]: `${y}px` };
}
