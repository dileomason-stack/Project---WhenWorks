import { createGroup, newId, toPublic } from "@/lib/store";
import { parseGroupSettings } from "@/lib/groupSettings";
import type { StoredGroup } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseGroupSettings(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const group: StoredGroup = {
    id: newId(),
    ...parsed.settings,
    createdAt: new Date().toISOString(),
    timeZone: validTimeZone(body?.timeZone) ? body.timeZone : "America/Los_Angeles",
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
