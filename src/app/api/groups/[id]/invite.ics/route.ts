import { zonedTimeToUtc } from "@/lib/dates";
import { getGroup } from "@/lib/store";

// The confirmed meeting as a calendar file. Opening it on an iPhone or Mac adds it to Apple Calendar;
// Outlook and most other calendar apps accept it too.
export async function GET(request: Request, ctx: RouteContext<"/api/groups/[id]/invite.ics">) {
  const { id } = await ctx.params;
  const group = await getGroup(id);
  const meeting = group?.meeting;
  if (!group || !meeting) return new Response("No meeting has been set for this group yet.", { status: 404 });

  const tz = group.timeZone ?? "America/Los_Angeles";
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const groupUrl = new URL(`/g/${id}`, request.url).toString();
  const description = [meeting.link ? `Join: ${meeting.link}` : "", `Group page: ${groupUrl}`].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhenWorks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id}-${meeting.proposalId}@whenworks`,
    `DTSTAMP:${stamp(new Date(meeting.confirmedAt))}`,
    `DTSTART:${stamp(zonedTimeToUtc(meeting.date, meeting.start, tz))}`,
    `DTEND:${stamp(zonedTimeToUtc(meeting.date, meeting.end, tz))}`,
    `SUMMARY:${escape(group.name)}`,
    `DESCRIPTION:${escape(description)}`,
    ...(meeting.location || meeting.link ? [`LOCATION:${escape(meeting.location ?? meeting.link!)}`] : []),
    ...(meeting.link ? [`URL:${meeting.link}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${group.name.replace(/[^\w -]/g, "").trim() || "meeting"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
