import { addDays, convertTime, DEFAULT_TIME_ZONE, formatShortDate, isISODate, timeZoneCity, weekdayOf, zonedParts, zonedTimeToUtc } from "./dates";
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

// The group as it looks in one week (given by its Monday, in the group's time zone). Weekly events always
// count and one-time events only count in their own week. Schedules from other time zones are converted
// into the group's time zone for that specific week, so daylight saving changes line up correctly.
export function groupForWeek(group: Group, weekStart: string): Group {
  const weekEnd = addDays(weekStart, 6);
  const groupZone = group.timeZone ?? DEFAULT_TIME_ZONE;
  return {
    ...group,
    members: group.members.map((m) => {
      const zone = m.timeZone ?? groupZone;
      const busy =
        zone === groupZone
          ? m.busy.filter((b) => !b.date || (b.date >= weekStart && b.date <= weekEnd))
          : convertBusy(m.busy, zone, groupZone, weekStart);
      return { ...m, busy };
    }),
  };
}

// Converts someone's busy times from their time zone into another for one week. An event that crosses
// midnight after converting (like 9pm–11pm Los Angeles = 5am–7am London the next day) is split in two.
function convertBusy(busy: BusyBlock[], from: string, to: string, weekStart: string): BusyBlock[] {
  const weekEnd = addDays(weekStart, 6);
  const out: BusyBlock[] = [];
  // Their local dates can be a day either side of the week once converted, so look one day further out.
  const dates = Array.from({ length: 9 }, (_, i) => addDays(weekStart, i - 1));
  for (const b of busy) {
    const occurrences = b.date ? [b.date] : dates.filter((iso) => weekdayOf(iso) === b.day);
    for (const iso of occurrences) {
      const start = zonedParts(zonedTimeToUtc(iso, b.start, from), to);
      const end = zonedParts(zonedTimeToUtc(iso, b.end, from), to);
      const pieces =
        start.iso === end.iso
          ? [{ iso: start.iso, start: start.minutes, end: end.minutes }]
          : [
              { iso: start.iso, start: start.minutes, end: 24 * 60 },
              { iso: end.iso, start: 0, end: end.minutes },
            ];
      for (const p of pieces) {
        if (p.iso < weekStart || p.iso > weekEnd || p.end <= p.start) continue;
        out.push({ day: weekdayOf(p.iso), start: p.start, end: p.end, label: b.label, ...(b.date ? { date: p.iso } : {}) });
      }
    }
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start);
}

// A time range on a date, described in another time zone: "9am – 10am" or, if the date changes,
// "11pm – 12am (Mon, Oct 5)".
export function describeInZone(iso: string, start: number, end: number, from: string, to: string): string {
  const a = convertTime(iso, start, from, to);
  const range = formatRange(a.minutes, a.minutes + (end - start));
  if (a.iso === iso) return range;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayOf(a.iso)];
  return `${range} (${weekday}, ${formatShortDate(a.iso)})`;
}

export const zoneCity = (zone: string | undefined) => timeZoneCity(zone ?? DEFAULT_TIME_ZONE);
