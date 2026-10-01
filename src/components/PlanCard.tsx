"use client";

import { useState } from "react";
import { Button, Card, Spinner } from "./ui";
import { formatLongDate, zonedTimeToUtc } from "@/lib/dates";
import { formatRange } from "@/lib/schedule";
import type { Group, Proposal, Vote } from "@/lib/types";

export interface Owner {
  memberId: string;
  editKey: string;
}

interface Props {
  group: Group;
  owners: Owner[]; // Schedules this browser added (yours first), which it can vote for.
  isAdmin: boolean;
  plan: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}

// Suggested times, votes, and the confirmed meeting with its calendar buttons.
export default function PlanCard({ group, owners, isAdmin, plan }: Props) {
  if (group.meeting) return <MeetingCard group={group} isAdmin={isAdmin} plan={plan} />;

  return (
    <Card>
      <h2 className="text-lg font-semibold">Pick a time</h2>
      {group.proposals.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500">
          Tap a green time in the calendar below and press <b>Suggest this time</b>. Everyone can then vote on it.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {group.proposals.map((p) => (
            <ProposalRow key={p.id} group={group} proposal={p} owners={owners} isAdmin={isAdmin} plan={plan} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProposalRow({
  group,
  proposal,
  owners,
  isAdmin,
  plan,
}: {
  group: Group;
  proposal: Proposal;
  owners: Owner[];
  isAdmin: boolean;
  plan: Props["plan"];
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const yes = group.members.filter((m) => proposal.votes[m.id] === "yes");
  const no = group.members.filter((m) => proposal.votes[m.id] === "no");
  const waiting = group.members.filter((m) => !proposal.votes[m.id]);
  const everyoneYes = group.members.length > 0 && yes.length === group.members.length;
  const ownerById = new Map(owners.map((o) => [o.memberId, o]));
  const canConfirm = everyoneYes || isAdmin;

  async function vote(owner: Owner, value: Vote | null) {
    setBusy(true);
    await plan("vote", { proposalId: proposal.id, memberId: owner.memberId, editKey: owner.editKey, vote: value });
    setBusy(false);
  }

  return (
    <li className={`rounded-xl border p-3 ${everyoneYes ? "border-emerald-300 bg-emerald-50" : "border-stone-200"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">
          {formatLongDate(proposal.date)} · {formatRange(proposal.start, proposal.end)}
        </div>
        <div className="text-xs text-stone-500">
          {yes.length} yes{no.length > 0 && ` · ${no.length} no`}
          {waiting.length > 0 && ` · ${waiting.length} waiting`}
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {group.members.map((m) => {
          const v = proposal.votes[m.id];
          const owner = ownerById.get(m.id);
          return (
            <li
              key={m.id}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                v === "yes"
                  ? "border-emerald-300 bg-white text-emerald-800"
                  : v === "no"
                    ? "border-red-200 bg-white text-red-700"
                    : "border-stone-200 bg-white text-stone-500"
              }`}
            >
              <span aria-hidden>{v === "yes" ? "✓" : v === "no" ? "✕" : "…"}</span>
              {m.name}
              {owner && (
                <span className="ml-1 flex gap-0.5">
                  <button
                    disabled={busy}
                    onClick={() => vote(owner, v === "yes" ? null : "yes")}
                    className={`rounded px-1 font-semibold ${v === "yes" ? "bg-emerald-600 text-white" : "hover:bg-emerald-50"}`}
                    aria-label={`${m.name} can make it`}
                  >
                    Yes
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => vote(owner, v === "no" ? null : "no")}
                    className={`rounded px-1 font-semibold ${v === "no" ? "bg-red-600 text-white" : "hover:bg-red-50"}`}
                    aria-label={`${m.name} can't make it`}
                  >
                    No
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {confirming ? (
        <ConfirmForm group={group} proposal={proposal} plan={plan} onCancel={() => setConfirming(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canConfirm && (
            <Button onClick={() => setConfirming(true)} className="py-1.5">
              {everyoneYes ? "Everyone's in, lock it in" : "Lock in this time"}
            </Button>
          )}
          {!everyoneYes && !isAdmin && (
            <span className="text-xs text-stone-500">Once everyone says yes, anyone can lock it in.</span>
          )}
          {isAdmin && (
            <button
              onClick={() => plan("unpropose", { proposalId: proposal.id })}
              className="ml-auto text-xs font-medium text-stone-500 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ConfirmForm({
  group,
  proposal,
  plan,
  onCancel,
}: {
  group: Group;
  proposal: Proposal;
  plan: Props["plan"];
  onCancel: () => void;
}) {
  const online = group.mode === "online";
  const [location, setLocation] = useState("");
  // A free Jitsi room works without anyone signing up; people can swap in their own Zoom or Meet link.
  const [link, setLink] = useState(
    () => `https://meet.jit.si/WhenWorks-${group.name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24)}-${group.id}`,
  );
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    await plan("confirm", { proposalId: proposal.id, ...(online ? { link } : { location }) });
    setSaving(false);
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-white p-3">
      {online ? (
        <label className="block text-sm">
          <span className="font-semibold">Video call link</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-stone-500">
            A free Jitsi call (no account needed). Paste a Zoom or Google Meet link instead if you prefer.
          </span>
        </label>
      ) : (
        <label className="block text-sm">
          <span className="font-semibold">Where are you meeting?</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Library 2nd floor, Kennedy Library"
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} className="py-1.5">
          Cancel
        </Button>
        <Button onClick={confirm} disabled={saving || (online && !link.trim())} className="flex-1 py-1.5">
          {saving && <Spinner />} Confirm meeting
        </Button>
      </div>
    </div>
  );
}

function MeetingCard({ group, isAdmin, plan }: { group: Group; isAdmin: boolean; plan: Props["plan"] }) {
  const meeting = group.meeting!;
  const [copied, setCopied] = useState(false);
  const tz = group.timeZone ?? "America/Los_Angeles";
  const when = `${formatLongDate(meeting.date)}, ${formatRange(meeting.start, meeting.end)}`;
  const groupUrl = typeof window === "undefined" ? "" : `${window.location.origin}/g/${group.id}`;

  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const googleUrl =
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: group.name,
      dates: `${stamp(zonedTimeToUtc(meeting.date, meeting.start, tz))}/${stamp(zonedTimeToUtc(meeting.date, meeting.end, tz))}`,
      details: [meeting.link ? `Join: ${meeting.link}` : "", `Group page: ${groupUrl}`].filter(Boolean).join("\n"),
      location: meeting.location ?? meeting.link ?? "",
    }).toString();

  const message = [
    `📅 ${group.name}: ${when}`,
    meeting.location ? `📍 ${meeting.location}` : "",
    meeting.link ? `💻 ${meeting.link}` : "",
    `Add it to your calendar: ${groupUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-emerald-300 bg-emerald-50">
      <div className="text-sm font-semibold text-emerald-800">Meeting set ✓</div>
      <div className="mt-1 text-xl font-bold">{when}</div>
      {meeting.location && <div className="mt-1 text-stone-700">📍 {meeting.location}</div>}
      {meeting.link && (
        <a href={meeting.link} target="_blank" rel="noreferrer" className="mt-1 block truncate font-medium text-emerald-800 underline">
          💻 {meeting.link}
        </a>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
        >
          Add to Google Calendar
        </a>
        <a
          href={`/api/groups/${group.id}/invite.ics`}
          className="rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
        >
          Add to Apple / Outlook
        </a>
      </div>
      <Button variant="secondary" onClick={copy} className="mt-2 w-full">
        {copied ? "Copied! Paste it in your group chat" : "Copy message for the group chat"}
      </Button>

      {isAdmin && (
        <button
          onClick={() => plan("unconfirm")}
          className="mt-3 block w-full text-center text-xs font-medium text-stone-500 hover:text-stone-800"
        >
          Change the time
        </button>
      )}
    </Card>
  );
}
