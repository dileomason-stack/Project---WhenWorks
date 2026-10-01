import { createGroup, newId, toPublic } from "@/lib/store";
import type { MeetingMode, StoredGroup } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return Response.json({ error: "Give your group a name." }, { status: 400 });

  const mode: MeetingMode = body?.mode === "online" ? "online" : "in_person";
  const meetingMinutes = [30, 45, 60, 90, 120].includes(body?.meetingMinutes) ? body.meetingMinutes : 60;
  const days = Array.isArray(body?.days)
    ? [...new Set<number>(body.days.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
    : [0, 1, 2, 3, 4];
  const dayStart = Number.isInteger(body?.dayStart) && body.dayStart >= 0 && body.dayStart < 24 * 60 ? body.dayStart : 8 * 60;
  const dayEnd = Number.isInteger(body?.dayEnd) && body.dayEnd > dayStart && body.dayEnd <= 24 * 60 ? body.dayEnd : 22 * 60;
  if (days.length === 0) return Response.json({ error: "Pick at least one day." }, { status: 400 });

  const group: StoredGroup = {
    id: newId(),
    name,
    mode,
    meetingMinutes,
    days,
    dayStart,
    dayEnd,
    createdAt: new Date().toISOString(),
    timeZone: validTimeZone(body?.timeZone) ? body.timeZone : "America/Los_Angeles",
    ...(Number.isInteger(body?.expectedCount) && body.expectedCount >= 2 && body.expectedCount <= 30
      ? { expectedCount: body.expectedCount }
      : {}),
    members: [],
    proposals: [],
    meeting: null,
    adminKey: newId(12),
  };
  await createGroup(group);
  return Response.json({ ...toPublic(group), adminKey: group.adminKey }, { status: 201 });
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
