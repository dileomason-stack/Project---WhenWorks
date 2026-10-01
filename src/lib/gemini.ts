import { cleanBlocks, fromHHMM } from "./schedule";
import type { BusyBlock } from "./types";

const DAY_ENUM = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const PROMPT = `This image is a screenshot of one person's schedule. It might be a class schedule from a
college portal, a week view from Google Calendar or Apple Calendar, a work schedule, or a list of times.

List every block of time when this person is BUSY, as a repeating weekly schedule.

Rules:
- Output one entry per day. A class on "MWF 9:10-10:00" becomes three entries (Monday, Wednesday, Friday).
- Day letters on college schedules: M = Monday, T or Tu = Tuesday, W = Wednesday, R or Th = Thursday, F = Friday, S or Sa = Saturday, U or Su = Sunday.
- If the screenshot shows calendar dates, use the weekday of each date.
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

  const parsed: { blocks?: { day: string; start: string; end: string; label?: string }[]; notes?: string } =
    JSON.parse(text);

  const blocks = cleanBlocks(
    (parsed.blocks ?? []).map((b) => ({
      day: DAY_ENUM.indexOf(b.day),
      start: fromHHMM(b.start ?? ""),
      end: fromHHMM(b.end ?? ""),
      label: b.label?.trim() || undefined,
    })),
  );
  return { blocks, notes: parsed.notes?.trim() ?? "" };
}
