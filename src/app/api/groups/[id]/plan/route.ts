import { isISODate } from "@/lib/dates";
import {
  addProposal,
  deleteProposal,
  getGroup,
  newId,
  setMeeting,
  setVote,
  toPublic,
  updateSettings,
} from "@/lib/store";
import type { StoredGroup, Vote } from "@/lib/types";

// Everything about settling on a time, in one place:
//   propose    suggest a date and time (anyone with the link)
//   vote       say yes or no for a schedule you added (needs its edit key)
//   unpropose  remove a suggestion (the group's creator)
//   confirm    lock in a suggestion as the meeting (the creator any time, anyone once everyone said yes)
//   unconfirm  reopen picking a time (the creator)
//   size       set how many people are in the group (the creator)
export async function POST(request: Request, ctx: RouteContext<"/api/groups/[id]/plan">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const group = await getGroup(id);
  if (!group) return fail("This group link doesn't exist.", 404);

  const isAdmin = !!group.adminKey && body?.adminKey === group.adminKey;
  const ownsMember = (memberId: unknown, editKey: unknown) =>
    group.members.some((m) => m.id === memberId && m.editKey === editKey);
  const proposal = group.proposals.find((p) => p.id === body?.proposalId);

  switch (body?.action) {
    case "propose": {
      const start = Number(body.start);
      const end = Number(body.end);
      if (!isISODate(body.date) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) {
        return fail("That time isn't valid.");
      }
      if (group.proposals.length >= 20) return fail("There are already a lot of suggestions. Remove some first.");
      if (group.proposals.some((p) => p.date === body.date && p.start === start)) {
        return fail("Someone already suggested that time.");
      }
      // Whoever suggests a time counts as a yes for the schedules they added.
      const votes: Record<string, Vote> = {};
      for (const owner of Array.isArray(body.voters) ? body.voters : []) {
        if (ownsMember(owner?.memberId, owner?.editKey)) votes[owner.memberId] = "yes";
      }
      await addProposal(id, { id: newId(), date: body.date, start, end, createdAt: new Date().toISOString(), votes });
      break;
    }
    case "vote": {
      if (!proposal) return fail("That suggestion was removed.", 404);
      if (!ownsMember(body.memberId, body.editKey)) return fail("You can only vote for schedules you added.", 403);
      if (body.vote !== "yes" && body.vote !== "no" && body.vote !== null) return fail("That vote isn't valid.");
      await setVote(id, proposal.id, body.memberId, body.vote);
      break;
    }
    case "unpropose": {
      if (!isAdmin) return fail("Only the person who made this group can remove suggestions.", 403);
      if (proposal) await deleteProposal(id, proposal.id);
      if (group.meeting?.proposalId === body.proposalId) await setMeeting(id, null);
      break;
    }
    case "confirm": {
      if (!proposal) return fail("That suggestion was removed.", 404);
      if (!isAdmin && !everyoneSaidYes(group, proposal.id)) {
        return fail("Everyone has to say yes first, or the group's creator can confirm it.", 403);
      }
      const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
      const link = text(body.link, 300);
      if (link && !/^https?:\/\//i.test(link)) return fail("The meeting link should start with https://");
      await setMeeting(id, {
        proposalId: proposal.id,
        date: proposal.date,
        start: proposal.start,
        end: proposal.end,
        ...(text(body.location, 120) ? { location: text(body.location, 120) } : {}),
        ...(link ? { link } : {}),
        confirmedAt: new Date().toISOString(),
      });
      break;
    }
    case "unconfirm": {
      if (!isAdmin) return fail("Only the person who made this group can change the meeting.", 403);
      await setMeeting(id, null);
      break;
    }
    case "size": {
      if (!isAdmin) return fail("Only the person who made this group can change that.", 403);
      const count = Number(body.expectedCount);
      if (!Number.isInteger(count) || count < 2 || count > 30) return fail("Pick between 2 and 30 people.");
      await updateSettings(id, { expectedCount: count });
      break;
    }
    default:
      return fail("Unknown action.");
  }

  return Response.json({ group: toPublic((await getGroup(id))!) });
}

function everyoneSaidYes(group: StoredGroup, proposalId: string) {
  const votes = group.proposals.find((p) => p.id === proposalId)?.votes ?? {};
  return group.members.length > 0 && group.members.every((m) => votes[m.id] === "yes");
}

function fail(error: string, status = 400) {
  return Response.json({ error }, { status });
}
