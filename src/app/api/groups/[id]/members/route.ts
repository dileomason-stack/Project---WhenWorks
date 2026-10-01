import { cleanBlocks } from "@/lib/schedule";
import { getGroup, newId, saveMember, toPublic } from "@/lib/store";

// Adds a new person's schedule, or replaces it if the request includes their id and edit key.
// Anyone can add schedules for other people (like a friend who sent a screenshot), and whoever
// added a schedule keeps its edit key.
export async function POST(request: Request, ctx: RouteContext<"/api/groups/[id]/members">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return Response.json({ error: "Enter a name." }, { status: 400 });
  const busy = cleanBlocks(body?.busy);

  const group = await getGroup(id);
  if (!group) return Response.json({ error: "This group link doesn't exist." }, { status: 404 });

  const now = new Date().toISOString();
  let member;
  if (body?.memberId) {
    const existing = group.members.find((m) => m.id === body.memberId);
    if (!existing || existing.editKey !== body.editKey) {
      return Response.json({ error: "You can only edit schedules you added." }, { status: 403 });
    }
    member = { ...existing, name, busy, updatedAt: now };
  } else {
    if (group.members.length >= 50) return Response.json({ error: "This group is full." }, { status: 403 });
    member = { id: newId(), editKey: newId(12), name, busy, updatedAt: now, addedAt: now };
  }

  await saveMember(id, member);
  const updated = await getGroup(id);
  return Response.json({ memberId: member.id, editKey: member.editKey, group: toPublic(updated!) });
}
