import { getGroup } from "@/lib/store";

// The full version of a schedule (including private event names) for whoever added it, so they can
// see and edit their own event names even when the group can't.
export async function POST(request: Request, ctx: RouteContext<"/api/groups/[id]/members/mine">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const group = await getGroup(id);
  const member = group?.members.find((m) => m.id === body?.memberId && m.editKey === body?.editKey);
  if (!member) return Response.json({ error: "You can only open schedules you added." }, { status: 403 });
  return Response.json({ busy: member.busy, shareDetails: !!member.shareDetails, timeZone: member.timeZone ?? null });
}
