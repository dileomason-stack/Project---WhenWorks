import { cleanBlocks } from "@/lib/schedule";
import { newId, toPublic, updateGroup } from "@/lib/store";

// Adds a new person's schedule, or replaces it if they send back their id and edit key.
export async function POST(request: Request, ctx: RouteContext<"/api/groups/[id]/members">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return Response.json({ error: "Enter your name." }, { status: 400 });
  const busy = cleanBlocks(body?.busy);

  const result = await updateGroup(id, (group) => {
    const now = new Date().toISOString();
    if (body?.memberId) {
      const existing = group.members.find((m) => m.id === body.memberId);
      if (!existing || existing.editKey !== body.editKey) return { error: "You can only edit your own schedule." } as const;
      existing.name = name;
      existing.busy = busy;
      existing.updatedAt = now;
      return { member: existing, group: toPublic(group) };
    }
    if (group.members.length >= 50) return { error: "This group is full." } as const;
    const member = { id: newId(), editKey: newId(12), name, busy, updatedAt: now };
    group.members.push(member);
    return { member, group: toPublic(group) };
  });

  if (!result) return Response.json({ error: "This group link doesn't exist." }, { status: 404 });
  if ("error" in result) return Response.json({ error: result.error }, { status: 403 });
  return Response.json({ memberId: result.member.id, editKey: result.member.editKey, group: result.group });
}
