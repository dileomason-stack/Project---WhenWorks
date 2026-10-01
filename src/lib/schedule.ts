import { addDays, isISODate, weekdayOf } from "./dates";
import type { BusyBlock, Group } from "./types";

export const SLOT_MINUTES = 15;

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function fromHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

export function isBusy(busy: BusyBlock[], day: number, start: number, end: number): boolean {
  return busy.some((b) => b.day === day && b.start < end && b.end > start);
}

export interface Slot {
  day: number;
  start: number;
  end: number;
  freeIds: string[];
}

// Splits each day into 15-minute slots and records who is free for the whole slot.
export function buildSlots(group: Group): Slot[][] {
  return group.days.map((day) => {
    const slots: Slot[] = [];
    for (let t = group.dayStart; t < group.dayEnd; t += SLOT_MINUTES) {
      const end = t + SLOT_MINUTES;
      const freeIds = group.members.filter((m) => !isBusy(m.busy, day, t, end)).map((m) => m.id);
      slots.push({ day, start: t, end, freeIds });
    }
    return slots;
  });
}

// Free time for one person, as ranges within the group's day window.
export function freeRangesFor(group: Group, busy: BusyBlock[], day: number): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = group.dayStart;
  const blocks = busy
    .filter((b) => b.day === day && b.end > group.dayStart && b.start < group.dayEnd)
    .sort((a, b) => a.start - b.start);
  for (const b of blocks) {
    if (b.start > cursor) ranges.push({ start: cursor, end: Math.min(b.start, group.dayEnd) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < group.dayEnd) ranges.push({ start: cursor, end: group.dayEnd });
  return ranges;
}

export function cleanBlocks(input: unknown): BusyBlock[] {
  if (!Array.isArray(input)) return [];
  const blocks: BusyBlock[] = [];
  for (const raw of input.slice(0, 300)) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const date = isISODate(r.date) ? r.date : undefined;
    const day = date ? weekdayOf(date) : Number(r.day);
    const start = Number(r.start);
    const end = Number(r.end);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end > 24 * 60 || end <= start) continue;
    const label = typeof r.label === "string" ? r.label.slice(0, 80) : undefined;
    blocks.push({ day, start: Math.round(start), end: Math.round(end), label, ...(date ? { date } : {}) });
  }
  return blocks.sort((a, b) => a.day - b.day || a.start - b.start);
}

// The group as it looks in one week (given by its Monday): weekly events always count, one-time
// events only count in their own week.
export function groupForWeek(group: Group, weekStart: string): Group {
  const weekEnd = addDays(weekStart, 6);
  return {
    ...group,
    members: group.members.map((m) => ({
      ...m,
      busy: m.busy.filter((b) => !b.date || (b.date >= weekStart && b.date <= weekEnd)),
    })),
  };
}
