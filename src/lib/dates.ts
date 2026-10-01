// Calendar dates are "YYYY-MM-DD" strings in the group's local time. Weeks start on Monday, matching
// the rest of the app (day 0 = Monday ... 6 = Sunday).

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(parseISODate(value)) === value;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// 0 = Monday ... 6 = Sunday.
export function weekdayOf(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

export function formatShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatLongDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Turns a wall-clock time in a time zone (like 4:00pm in Los Angeles on 2026-10-06) into a real moment,
// so calendar invites land at the right time for everyone.
export function zonedTimeToUtc(iso: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - t;
  };
  // Two passes handle the hour around daylight saving changes.
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}
