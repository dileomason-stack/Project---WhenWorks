import { toISODate } from "./dates";
import { cleanBlocks, fromHHMM } from "./schedule";
import type { BusyBlock } from "./types";

const DAY_ENUM = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const PROMPT = `This image is a screenshot of one person's schedule. It might be a class schedule from a
college portal, a week view from Google Calendar or Apple Calendar, a work schedule, or a list of times.

List every block of time when this person is BUSY.

Rules:
- Output one entry per day. A class on "MWF 9:10-10:00" becomes three entries (Monday, Wednesday, Friday).
- Day letters on college schedules: M = Monday, T or Tu = Tuesday, W = Wednesday, R or Th = Thursday, F = Friday, S or Sa = Saturday, U or Su = Sunday.
- If the day columns show a date (like "SEP 28", "9/28" or "Mon 28"), put that month and day in "date"
  as "MM-DD" (for example "09-28") for every event in that column. Copy the date exactly as shown; the
  weekday is worked out from it separately. Leave "date" empty if the columns only show weekday names.
- "day" is the weekday name if it is written on the column. If only a date is shown, still give your
  best guess for "day".
- Calendars often show several calendars layered together (for example a personal calendar and a shared
  one), so events that happen at the same time appear side by side in narrower columns. This is normal.
  List every event separately, even when it overlaps another one, and do not mention overlaps in "notes".
- Work out each event's day from the day column it sits inside, using the column's left and right edges
  under the day header. A narrow event squeezed against the right edge of a column still belongs to that
  column's day, not the next day.
- Read times from the text written on each event (like "9 – 10:20am" or "1:30 – 2:50pm") whenever it is
  there. Only estimate from the event's position when no time is written, rounding to the nearest 5 minutes.
- If the time axis shows two columns of times (two time zones), use the column right next to the
  calendar grid, the one that matches the times written on events.
- Use 24-hour "HH:MM" times.
- "label" is the event's name as written (for example "ENGL 134" or "Work"). Keep it under 30 characters.
- Skip the all-day row at the top of calendars: all-day events, birthdays, holidays, tasks and reminders.
- "repeats" says whether the event happens every week. Classes, labs, work shifts, practices, club meetings
  and anything on a class schedule repeat (true). One-off things like appointments, visits, birthdays,
  dates, interviews, a single project meeting or a trip are false. When unsure, use true.
- Skip classes with no meeting time, like ones listed as "asynchronous", "online", "TBA" or "by arrangement".
- Do not invent blocks. If something is truly unreadable, leave it out and mention it in "notes".
- "notes" is one short sentence for the person about anything you could not read, or an empty string.
- If the image is not a schedule at all, return no blocks and say so in "notes".`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    blocks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "STRING", enum: DAY_ENUM },
          start: { type: "STRING" },
          end: { type: "STRING" },
          label: { type: "STRING" },
          date: { type: "STRING" },
          repeats: { type: "BOOLEAN" },
        },
        required: ["day", "start", "end"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["blocks", "notes"],
};

export class ScreenshotError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export async function readScheduleScreenshot(
  imageBase64: string,
  mimeType: string,
): Promise<{ blocks: BusyBlock[]; notes: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ScreenshotError("Screenshot reading isn't set up yet (the site is missing its Gemini key).", 503);
  }
  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  // Free-tier models are often overloaded, so ask the accurate newer flash models at the same time and
  // use whichever answers first. If they're all busy, fall back to older models one at a time.
  const raced = [
    ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ];
  const fallbacks = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  const statuses: number[] = [];

  async function ask(model: string, signal: AbortSignal): Promise<string> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!res.ok) {
      statuses.push(res.status);
      console.error("Gemini unavailable", model, res.status);
      throw new Error(`${model} ${res.status}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
    if (typeof text !== "string") throw new Error(`${model} returned no text`);
    JSON.parse(text);
    return text;
  }

  let text: string | null = null;
  const race = new AbortController();
  try {
    text = await Promise.any(raced.map((m) => ask(m, race.signal)));
    race.abort();
  } catch {
    for (const model of fallbacks) {
      try {
        text = await ask(model, new AbortController().signal);
        break;
      } catch {
        // Try the next one.
      }
    }
  }

  if (!text) {
    if (statuses.length && statuses.every((s) => s === 429)) {
      throw new ScreenshotError("The screenshot reader is busy right now. Wait a minute and try again.", 429);
    }
    throw new ScreenshotError("Google's screenshot reader is busy right now. Try again in a moment.", 502);
  }

  const parsed: {
    blocks?: { day: string; start: string; end: string; label?: string; date?: string; repeats?: boolean }[];
    notes?: string;
  } =
    JSON.parse(text);

  const blocks = cleanBlocks(
    (parsed.blocks ?? []).map((b) => ({
      day: weekdayFromDate(b.date) ?? DAY_ENUM.indexOf(b.day),
      // A one-time event keeps its full date so it only counts in that week. Without a date shown, there's
      // no way to tell which week it's in, so it's treated as weekly.
      ...(b.repeats === false && fullDateFrom(b.date) ? { date: fullDateFrom(b.date) } : {}),
      start: fromHHMM(b.start ?? ""),
      end: fromHHMM(b.end ?? ""),
      label: b.label?.trim() || undefined,
    })),
  );
  return { blocks, notes: parsed.notes?.trim() ?? "" };
}

// "09-28" → "2026-09-28", using whichever year puts the date closest to today.
export function fullDateFrom(date: string | undefined, today = new Date()): string | undefined {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(date?.trim() ?? "");
  if (!match || weekdayFromDate(date, today) === null) return undefined;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const candidates = [-1, 0, 1].map((dy) => new Date(today.getFullYear() + dy, month, day));
  const closest = candidates.reduce((a, b) =>
    Math.abs(b.getTime() - today.getTime()) < Math.abs(a.getTime() - today.getTime()) ? b : a,
  );
  return toISODate(closest);
}

// Calendars that label columns only with dates ("SEP 28") leave the AI guessing the weekday, and it
// often guesses wrong. So when it reports a date, work out the weekday here instead. The year isn't
// shown, so use whichever year puts the date closest to today. Returns 0 = Monday ... 6 = Sunday.
export function weekdayFromDate(date: string | undefined, today = new Date()): number | null {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(date?.trim() ?? "");
  if (!match) return null;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const year = today.getFullYear();
  const candidates = [year - 1, year, year + 1].map((y) => new Date(y, month, day));
  const closest = candidates.reduce((a, b) =>
    Math.abs(b.getTime() - today.getTime()) < Math.abs(a.getTime() - today.getTime()) ? b : a,
  );
  if (closest.getMonth() !== month) return null; // A date like 02-30 that doesn't exist.
  return (closest.getDay() + 6) % 7;
}
