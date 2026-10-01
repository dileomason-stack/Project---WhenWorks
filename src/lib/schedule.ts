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
    const day = Number(r.day);
    const start = Number(r.start);
    const end = Number(r.end);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end > 24 * 60 || end <= start) continue;
    const label = typeof r.label === "string" ? r.label.slice(0, 80) : undefined;
    blocks.push({ day, start: Math.round(start), end: Math.round(end), label });
  }
  return blocks.sort((a, b) => a.day - b.day || a.start - b.start);
}

export interface NearMiss {
  memberId: string;
  // "late": their event ends soon after this time, so they'd arrive late.
  // "early": their event starts shortly before this time, so they'd have to leave early.
  kind: "late" | "early";
  minutes: number;
  label?: string;
  eventStart: number;
  eventEnd: number;
}

// For a slot where some people are busy, checks whether each busy person is only busy because of an
// event that ends or starts within `withinMinutes`. If so, returns how each of them is affected;
// otherwise null (someone is properly busy then).
export function nearMisses(group: Group, slot: Slot, withinMinutes: number): NearMiss[] | null {
  const busyMembers = group.members.filter((m) => !slot.freeIds.includes(m.id));
  if (busyMembers.length === 0) return null;
  const result: NearMiss[] = [];
  for (const m of busyMembers) {
    const blocks = m.busy.filter((b) => b.day === slot.day && b.start < slot.end && b.end > slot.start);
    const eventStart = Math.min(...blocks.map((b) => b.start));
    const eventEnd = Math.max(...blocks.map((b) => b.end));
    const label = blocks.map((b) => b.label).find(Boolean);
    const late = eventEnd - slot.start;
    const early = slot.end - eventStart;
    if (late <= withinMinutes) result.push({ memberId: m.id, kind: "late", minutes: late, label, eventStart, eventEnd });
    else if (early <= withinMinutes) result.push({ memberId: m.id, kind: "early", minutes: early, label, eventStart, eventEnd });
    else return null;
  }
  return result;
}

// Near misses worth showing: ones that stretch a time when everyone is free. A stretch just before an
// everyone-free time counts if the busy people would arrive late; a stretch just after counts if they'd
// leave early. Keyed by `${day}-${start}`.
export function usefulNearMisses(group: Group, withinMinutes: number): Map<string, NearMiss[]> {
  const result = new Map<string, NearMiss[]>();
  const total = group.members.length;
  if (total < 2) return result;
  for (const daySlots of buildSlots(group)) {
    const green = daySlots.map((s) => s.freeIds.length === total);
    const misses = daySlots.map((s, i) => (green[i] ? null : nearMisses(group, s, withinMinutes)));
    for (let a = 0; a < daySlots.length; a++) {
      if (!misses[a]) continue;
      let b = a;
      while (b + 1 < daySlots.length && misses[b + 1]) b++;
      const run = misses.slice(a, b + 1) as NearMiss[][];
      const allLate = run.every((slot) => slot.every((m) => m.kind === "late"));
      const allEarly = run.every((slot) => slot.every((m) => m.kind === "early"));
      if ((green[b + 1] && allLate) || (green[a - 1] && allEarly)) {
        for (let i = a; i <= b; i++) result.set(`${daySlots[i].day}-${daySlots[i].start}`, misses[i]!);
      }
      a = b;
    }
  }
  return result;
}
