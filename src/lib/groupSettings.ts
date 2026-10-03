import { DEFAULT_TIME_ZONE, isTimeZone } from "./dates";
import type { MeetingMode } from "./types";

// The settings someone picks when making a group, and can change later if they made it.
export interface GroupSettings {
  name: string;
  mode: MeetingMode;
  meetingMinutes: number;
  days: number[];
  dayStart: number;
  dayEnd: number;
  expectedCount?: number;
  // The group's home time zone: the meeting hours, suggested times and invites are all in it.
  timeZone: string;
}

export const DEFAULT_SETTINGS: GroupSettings = {
  name: "",
  mode: "in_person",
  meetingMinutes: 60,
  days: [0, 1, 2, 3, 4],
  dayStart: 8 * 60,
  dayEnd: 22 * 60,
  timeZone: DEFAULT_TIME_ZONE,
};

export const MEETING_LENGTHS = [30, 45, 60, 90, 120];

// Checks settings sent to the server. Returns the cleaned settings, or a message saying what's wrong.
export function parseGroupSettings(body: unknown): { settings: GroupSettings } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return { error: "Give your group a name." };
  const days = Array.isArray(b.days)
    ? [...new Set(b.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
    : DEFAULT_SETTINGS.days;
  if (days.length === 0) return { error: "Pick at least one day." };
  const dayStart = Number.isInteger(b.dayStart) && (b.dayStart as number) >= 0 && (b.dayStart as number) < 1440 ? (b.dayStart as number) : 480;
  const dayEnd =
    Number.isInteger(b.dayEnd) && (b.dayEnd as number) > dayStart && (b.dayEnd as number) <= 1440 ? (b.dayEnd as number) : 1320;
  const count = Number(b.expectedCount);
  return {
    settings: {
      name,
      mode: b.mode === "online" ? "online" : "in_person",
      meetingMinutes: MEETING_LENGTHS.includes(b.meetingMinutes as number) ? (b.meetingMinutes as number) : 60,
      days,
      dayStart,
      dayEnd,
      timeZone: isTimeZone(b.timeZone) ? b.timeZone : DEFAULT_TIME_ZONE,
      ...(Number.isInteger(count) && count >= 2 && count <= 30 ? { expectedCount: count } : {}),
    },
  };
}
