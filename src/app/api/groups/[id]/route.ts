import { getGroup, toPublic } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/groups/[id]">) {
  const { id } = await ctx.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "This group link doesn't exist." }, { status: 404 });
  return Response.json(toPublic(group));
}
