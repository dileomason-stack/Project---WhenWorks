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
- Use 24-hour "HH:MM" times. Read times from labels when they are written; otherwise estimate from the
  block's position against the time axis, rounding to the nearest 5 minutes.
- "label" is a short name for the block (for example "ENGL 134" or "Work"). Keep it under 30 characters.
- Skip all-day events, holidays, and anything that is clearly marked as free time.
- Do not invent blocks. If something is unreadable, leave it out and mention it in "notes".
- "notes" is one short sentence for the person about anything you were unsure of, or an empty string.
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

  // The free tier is sometimes overloaded, so retry once and then fall back to the lighter model.
  const attempts = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-flash-latest", "gemini-flash-lite-latest"];
  let res: Response | null = null;
  for (const [i, model] of attempts.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(40_000),
      });
    } catch (err) {
      console.error("Gemini request failed", model, err);
      res = null;
      continue;
    }
    if (res.ok || ![429, 500, 503].includes(res.status)) break;
    console.error("Gemini busy", model, res.status);
  }

  if (res?.status === 429) {
    throw new ScreenshotError("The screenshot reader is busy right now. Wait a minute and try again.", 429);
  }
  if (!res?.ok) {
    if (res) console.error("Gemini error", res.status, await res.text());
    throw new ScreenshotError("Google's screenshot reader is busy right now. Try again in a moment.", 502);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
  if (!text) throw new ScreenshotError("Couldn't read that screenshot. Try a clearer one.", 502);

  let parsed: { blocks?: { day: string; start: string; end: string; label?: string }[]; notes?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScreenshotError("Couldn't read that screenshot. Try a clearer one.", 502);
  }

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
