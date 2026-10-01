"use client";

import { formatRange, formatTime } from "@/lib/schedule";
import { DAY_SHORT, type BusyBlock } from "@/lib/types";

export type EditableBlock = BusyBlock & { uid: string };

interface Props {
  blocks: EditableBlock[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onAddAt: (day: number, start: number) => void;
}

const HOUR_PX = 46;
// Each day gets at least this much room; on phones the calendar scrolls sideways instead of squishing.
const DAY_WIDTH = "min-w-[88px] flex-1";
// US calendars (Google, Apple) start the week on Sunday, so the mockup does too to make comparing easy.
const DISPLAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
// Side-by-side events alternate shades, like layered calendars in Google Calendar.
const SHADES = ["bg-emerald-700 text-white", "bg-lime-600 text-white", "bg-emerald-500 text-white"];

// Places events that overlap side by side, the way Google Calendar does.
function layoutDay(blocks: EditableBlock[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { block: EditableBlock; col: number; cols: number }[] = [];
  let cluster: { block: EditableBlock; col: number; cols: number }[] = [];
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

export default function CalendarMockup({ blocks, selectedUid, onSelect, onAddAt }: Props) {
  const days = DISPLAY_ORDER.filter((d) => (d >= 0 && d <= 4) || blocks.some((b) => b.day === d));
  const rangeStart = Math.min(8 * 60, ...blocks.map((b) => Math.floor(b.start / 60) * 60));
  const rangeEnd = Math.max(18 * 60, ...blocks.map((b) => Math.ceil(b.end / 60) * 60));
  const hours = [];
  for (let t = rangeStart; t < rangeEnd; t += 60) hours.push(t);
  const height = ((rangeEnd - rangeStart) / 60) * HOUR_PX;

  return (
    <div className="min-w-max select-none">
      <div className="sticky top-0 z-20 flex border-b border-stone-200 bg-white pb-1.5">
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
            className={`relative ${DAY_WIDTH} cursor-copy border-l border-stone-200`}
            style={{
              height,
              backgroundImage: `repeating-linear-gradient(to bottom, #e7e5e4 0 1px, transparent 1px ${HOUR_PX}px)`,
            }}
            onClick={(e) => {
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              const minute = rangeStart + Math.floor((y / HOUR_PX) * 2) * 30;
              onAddAt(d, Math.min(minute, rangeEnd - 60));
            }}
          >
            {layoutDay(blocks.filter((b) => b.day === d)).map(({ block, col, cols }) => {
              const top = ((block.start - rangeStart) / 60) * HOUR_PX;
              const h = Math.max(((block.end - block.start) / 60) * HOUR_PX, 16);
              const selected = block.uid === selectedUid;
              return (
                <button
                  key={block.uid}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected ? null : block.uid);
                  }}
                  className={`absolute overflow-hidden rounded-md text-left leading-tight shadow-sm transition-shadow ${
                    cols >= 3 ? "px-0.5 py-0.5 text-[9px]" : "px-1.5 py-1 text-[11px]"
                  } ${
                    SHADES[col % SHADES.length]
                  } ${selected ? "z-10 ring-2 ring-stone-900 ring-offset-1" : "hover:brightness-110"}`}
                  style={{
                    top: top + 1,
                    height: h - 2,
                    left: `calc(${(col / cols) * 100}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                  }}
                  title={`${block.label || "Busy"} · ${formatRange(block.start, block.end)}`}
                >
                  <div className="font-semibold">{block.label || "Busy"}</div>
                  {cols < 3 && <div className="opacity-90">{formatRange(block.start, block.end)}</div>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
