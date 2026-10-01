"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import UploadSchedule from "./UploadSchedule";
import OverlapView from "./OverlapView";
import PlanCard from "./PlanCard";
import WeekGrid from "./WeekGrid";
import { Button, Card, Spinner } from "./ui";
import { addDays, formatShortDate, mondayOf, toISODate } from "@/lib/dates";
import { forgetGroup, rememberGroup } from "@/lib/recent";
import { formatRange, freeRangesFor, groupForWeek } from "@/lib/schedule";
import { DAY_SHORT, type BusyBlock, type Group } from "@/lib/types";

interface Owned {
  memberId: string;
  editKey: string;
}

// What this browser remembers about a group: your own schedule, friends' schedules you uploaded for
// them (so you can edit them later), and the admin key if you created the group.
interface Saved {
  self: Owned | null;
  others: Owned[];
  adminKey?: string;
}

const storageKey = (groupId: string) => `whenworks:${groupId}`;

function loadSaved(groupId: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(groupId)) ?? "null");
    if (raw && "others" in raw) return { self: raw.self ?? null, others: raw.others ?? [], adminKey: raw.adminKey };
    // Saved by older versions of the site.
    if (Array.isArray(raw?.members)) return { self: raw.members[0] ?? null, others: raw.members.slice(1), adminKey: raw.adminKey };
    if (raw?.memberId) return { self: raw, others: [] };
  } catch {
    // Blocked or broken storage; start fresh.
  }
  return { self: null, others: [] };
}

function storeSaved(groupId: string, saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(storageKey(groupId), JSON.stringify(saved));
    else localStorage.removeItem(storageKey(groupId));
  } catch {
    // Private browsing can block storage; they just won't be able to edit later.
  }
}

export default function GroupView({ id }: { id: string }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState<Saved>({ self: null, others: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const router = useRouter();
  // Which schedule is open for editing: a member id, "new" for someone else's, or null.
  const [editing, setEditing] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"free" | "overlap">("free");
  // Which week the calendar shows: 0 = this week, 1 = next week, and so on.
  const [weekOffset, setWeekOffset] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/groups/${id}`, { cache: "no-store" });
    if (res.status === 404) {
      forgetGroup(id);
      return setNotFound(true);
    }
    if (res.ok) {
      const data: Group = await res.json();
      setGroup(data);
      rememberGroup(id, data.name);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's saved schedules on first load
    setSaved(loadSaved(id));
    refresh();
    // Checks for new schedules every few seconds so the page updates as people upload.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  const memberById = (memberId?: string) => group?.members.find((m) => m.id === memberId) ?? null;
  const myMember = memberById(saved.self?.memberId);
  const addedForOthers = saved.others.flatMap((o) => memberById(o.memberId) ?? []);
  const owned = [...(saved.self ? [saved.self] : []), ...saved.others];
  const ownedIds = new Set(owned.map((o) => o.memberId));

  function updateSaved(next: Saved) {
    setSaved(next);
    storeSaved(id, next);
  }

  async function save(name: string, busy: BusyBlock[], existing: Owned | null, forOther: boolean) {
    const res = await fetch(`/api/groups/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, busy, memberId: existing?.memberId, editKey: existing?.editKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!existing) {
      const entry = { memberId: data.memberId, editKey: data.editKey };
      updateSaved(forOther ? { ...saved, others: [...saved.others, entry] } : { ...saved, self: entry });
    }
    setGroup(data.group);
    setEditing(null);
  }

  async function removeSchedule(owner: Owned) {
    setActionError("");
    const res = await fetch(`/api/groups/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(owner),
    });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    updateSaved({
      ...saved,
      self: saved.self?.memberId === owner.memberId ? null : saved.self,
      others: saved.others.filter((o) => o.memberId !== owner.memberId),
    });
    setGroup(data.group);
    setEditing(null);
  }

  async function deleteGroup() {
    setActionError("");
    setDeleting(true);
    const res = await fetch(`/api/groups/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey: saved.adminKey }),
    });
    if (!res.ok) {
      setDeleting(false);
      return setActionError((await res.json()).error);
    }
    storeSaved(id, null);
    forgetGroup(id);
    router.push("/");
  }

  // Suggesting, voting on and confirming meeting times (see /api/groups/[id]/plan).
  async function plan(action: string, payload: Record<string, unknown> = {}) {
    setActionError("");
    const res = await fetch(`/api/groups/${id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminKey: saved.adminKey, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    setGroup(data.group);
  }

  async function suggest(date: string, start: number) {
    await plan("propose", { date, start, end: Math.min(start + group!.meetingMinutes, 24 * 60), voters: owned });
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: group?.name, text: `Add your schedule for ${group?.name}`, url });
        return;
      } catch {
        // Closed the share sheet; fall back to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">This group link doesn&apos;t exist</h1>
        <p className="mt-2 text-stone-600">Double-check the link, or make a new group.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-emerald-700 hover:underline">
          Make a group →
        </Link>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="flex flex-1 items-center justify-center text-stone-500">
        <Spinner />
      </main>
    );
  }

  const editingMember = editing && editing !== "new" ? memberById(editing) : null;
  const editingOwned = owned.find((o) => o.memberId === editing) ?? null;
  const isEditingSelf = !!myMember && editing === myMember.id;
  const weekStart = addDays(mondayOf(toISODate(new Date())), 7 * weekOffset);
  const weekGroup = groupForWeek(group, weekStart);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-semibold text-emerald-700">
            WhenWorks
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {group.mode === "online" ? "Online call" : "In person"} · {group.meetingMinutes} min ·{" "}
            {group.days.map((d) => DAY_SHORT[d]).join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            + New group
          </Link>
          <Button variant="secondary" onClick={share}>
            {copied ? "Link copied!" : "Share group link"}
          </Button>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          {!myMember ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Add your schedule</h2>
              <UploadSchedule key="self" onSave={(name, busy) => save(name, busy, null, false)} />
            </div>
          ) : editing ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">
                {isEditingSelf
                  ? "Update your schedule"
                  : editingMember
                    ? `Update ${editingMember.name}'s schedule`
                    : "Add someone else's schedule"}
              </h2>
              {editing === "new" && (
                <p className="-mt-1 mb-3 text-sm text-stone-500">
                  Did someone send you a screenshot instead of opening the link? Upload it here with their name.
                </p>
              )}
              <UploadSchedule
                key={editing}
                forOther={!isEditingSelf}
                initialName={editingMember?.name}
                initialBusy={editingMember?.busy}
                onSave={(name, busy) => save(name, busy, editingOwned, !isEditingSelf)}
                onCancel={() => setEditing(null)}
              />
              {editingOwned && (
                <button
                  onClick={() => removeSchedule(editingOwned)}
                  className="mt-3 w-full text-center text-sm font-medium text-red-600 hover:underline"
                >
                  Remove {isEditingSelf ? "your" : `${editingMember?.name ?? "this"}'s`} schedule from the group
                </button>
              )}
            </div>
          ) : (
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">You&apos;re in as {myMember.name}</div>
                  <div className="text-sm text-stone-500">
                    {group.members.length === 1
                      ? "Now share the link so others can add theirs."
                      : "Your schedule is saved."}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setEditing(myMember.id)}>
                  Edit
                </Button>
              </div>

              {addedForOthers.length > 0 && (
                <div className="border-t border-stone-100 pt-3">
                  <div className="mb-1 text-sm font-semibold text-stone-600">Schedules you added for others</div>
                  <ul className="divide-y divide-stone-100">
                    {addedForOthers.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>{m.name}</span>
                        <button
                          onClick={() => setEditing(m.id)}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-stone-100 pt-3">
                <Button variant="secondary" onClick={() => setEditing("new")} className="w-full">
                  + Add someone else&apos;s schedule
                </Button>
                <p className="mt-1.5 text-center text-xs text-stone-500">
                  For when a friend sends you their screenshot instead of using the link.
                </p>
              </div>
            </Card>
          )}

          <People
            group={weekGroup}
            meId={myMember?.id}
            ownedIds={ownedIds}
            focusId={focusId}
            setFocusId={setFocusId}
            isAdmin={!!saved.adminKey}
            plan={plan}
          />
        </div>

        <div className="space-y-6">
          {(group.members.length > 1 || group.proposals.length > 0 || group.meeting) && (
            <PlanCard group={group} owners={owned} isAdmin={!!saved.adminKey} plan={plan} />
          )}
          {group.members.length > 0 && (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Week at a glance</h2>
                {group.members.length > 1 && (
                  <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-sm">
                    {(
                      [
                        ["free", "Free time"],
                        ["overlap", "Overlap"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setView(value)}
                        className={`rounded-md px-3 py-1 font-medium ${view === value ? "bg-white shadow-sm" : "text-stone-500"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4 flex items-center justify-between rounded-xl border border-stone-200 px-1 py-1">
                <button
                  onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                  disabled={weekOffset === 0}
                  className="rounded-lg px-3 py-1.5 text-lg leading-none text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                  aria-label="Previous week"
                >
                  ‹
                </button>
                <div className="text-center text-sm">
                  <div className="font-semibold">
                    {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `In ${weekOffset} weeks`}
                  </div>
                  <div className="text-xs text-stone-500">
                    {formatShortDate(weekStart)} – {formatShortDate(addDays(weekStart, 6))}
                  </div>
                </div>
                <button
                  onClick={() => setWeekOffset((w) => Math.min(12, w + 1))}
                  className="rounded-lg px-3 py-1.5 text-lg leading-none text-stone-600 hover:bg-stone-100"
                  aria-label="Next week"
                >
                  ›
                </button>
              </div>
              {view === "overlap" && group.members.length > 1 ? (
                <OverlapView group={weekGroup} weekStart={weekStart} />
              ) : (
                <WeekGrid
                  group={weekGroup}
                  focusId={focusId}
                  weekStart={weekStart}
                  proposals={group.proposals}
                  onSuggest={group.meeting ? undefined : suggest}
                />
              )}
            </Card>
          )}
        </div>
      </div>
      {actionError && <p className="mt-6 text-center text-sm text-red-600">{actionError}</p>}

      {saved.adminKey && (
        <div className="mt-12 border-t border-stone-200 pt-6 text-center">
          {confirmDelete ? (
            <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">
                Delete <b>{group.name}</b>? Everyone&apos;s schedules will be removed and the link will stop working. This
                can&apos;t be undone.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={deleteGroup} disabled={deleting}>
                  {deleting && <Spinner />} Delete for everyone
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-red-600 hover:underline">
              Delete this group
            </button>
          )}
          <p className="mt-2 text-xs text-stone-400">Only you see this because you made the group.</p>
        </div>
      )}
    </main>
  );
}

function People({
  group,
  meId,
  ownedIds,
  focusId,
  setFocusId,
  isAdmin,
  plan,
}: {
  group: Group;
  meId?: string;
  ownedIds: Set<string>;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  isAdmin: boolean;
  plan: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const focus = group.members.find((m) => m.id === focusId);
  const [copied, setCopied] = useState(false);
  const count = group.members.length;
  const expected = group.expectedCount;
  const missing = expected ? Math.max(0, expected - count) : null;

  async function copyReminder() {
    const text = `Hey! Add your schedule for ${group.name} so we can find a time that works for everyone (it takes a minute, just upload a screenshot): ${window.location.origin}/g/${group.id}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">
        {expected
          ? `${count} of ${expected} people added`
          : count === 0
            ? "Nobody has added a schedule yet"
            : `${count} ${count === 1 ? "person has" : "people have"} added a schedule`}
      </h2>
      {expected && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (count / expected) * 100)}%` }} />
        </div>
      )}
      {missing !== 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={copyReminder} className="py-1.5">
            {copied ? "Copied! Paste it in the group chat" : "Copy a reminder for the group chat"}
          </Button>
          {missing !== null && <span className="text-sm text-stone-500">Waiting on {missing} more</span>}
        </div>
      )}
      {isAdmin && !expected && (
        <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
          How many people are in the group?
          <select
            defaultValue=""
            onChange={(e) => e.target.value && plan("size", { expectedCount: Number(e.target.value) })}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1"
          >
            <option value="">Pick</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {group.members.length > 0 && (
        <>
          <p className="text-sm text-stone-500">Tap someone to see when they&apos;re free.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {group.members.map((m) => (
              <button
                key={m.id}
                onClick={() => setFocusId(focusId === m.id ? null : m.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  focusId === m.id ? "border-sky-500 bg-sky-50 text-sky-900" : "border-stone-200 hover:bg-stone-50"
                }`}
              >
                <span className="text-emerald-600">✓</span> {m.name}
                {m.id === meId ? (
                  <span className="text-stone-400">(you)</span>
                ) : (
                  ownedIds.has(m.id) && <span className="text-stone-400">(added by you)</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {focus && (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <div className="mb-2 text-sm font-semibold">{focus.name} is free:</div>
          <ul className="space-y-1 text-sm">
            {group.days.map((d) => {
              const ranges = freeRangesFor(group, focus.busy, d);
              return (
                <li key={d} className="flex gap-3">
                  <span className="w-10 shrink-0 font-medium text-stone-500">{DAY_SHORT[d]}</span>
                  <span>{ranges.length ? ranges.map((r) => formatRange(r.start, r.end)).join(", ") : "Busy all day"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
