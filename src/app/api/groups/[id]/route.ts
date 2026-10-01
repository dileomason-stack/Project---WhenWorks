import { deleteGroup, getGroup, toPublic } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/groups/[id]">) {
  const { id } = await ctx.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "This group link doesn't exist." }, { status: 404 });
  return Response.json(toPublic(group));
}

// Only whoever created the group (and so has its admin key) can delete it.
export async function DELETE(request: Request, ctx: RouteContext<"/api/groups/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const group = await getGroup(id);
  if (!group) return Response.json({ ok: true });
  if (!group.adminKey || body?.adminKey !== group.adminKey) {
    return Response.json({ error: "Only the person who made this group can delete it." }, { status: 403 });
  }
  await deleteGroup(id);
  return Response.json({ ok: true });
}
