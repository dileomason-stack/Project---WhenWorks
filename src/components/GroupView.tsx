"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import UploadSchedule from "./UploadSchedule";
import WeekGrid from "./WeekGrid";
import { Button, Card, Spinner } from "./ui";
import { bestPartialWindows, everyoneFreeWindows, formatRange, freeRangesFor } from "@/lib/schedule";
import { DAY_NAMES, DAY_SHORT, type BusyBlock, type Group } from "@/lib/types";

interface Owned {
  memberId: string;
  editKey: string;
}

const storageKey = (groupId: string) => `whenworks:${groupId}`;

// The schedules this browser added to the group, so they can be edited later. The first one is yours;
// the rest are friends' schedules you uploaded for them.
function loadOwned(groupId: string): Owned[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(groupId)) ?? "null");
    if (Array.isArray(raw?.members)) return raw.members;
    if (raw?.memberId) return [raw]; // Saved by an older version of the site.
  } catch {
    // Blocked or broken storage; start fresh.
  }
  return [];
}

function storeOwned(groupId: string, owned: Owned[]) {
  try {
    localStorage.setItem(storageKey(groupId), JSON.stringify({ members: owned }));
  } catch {
    // Private browsing can block storage; they just won't be able to edit later.
  }
}

export default function GroupView({ id }: { id: string }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [owned, setOwned] = useState<Owned[]>([]);
  // Which schedule is open for editing: a member id, "new" for someone else's, or null.
  const [editing, setEditing] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/groups/${id}`, { cache: "no-store" });
    if (res.status === 404) return setNotFound(true);
    if (res.ok) setGroup(await res.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's saved schedules on first load
    setOwned(loadOwned(id));
    refresh();
    // Checks for new schedules every few seconds so the page updates as people upload.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  const memberById = (memberId?: string) => group?.members.find((m) => m.id === memberId) ?? null;
  const myMember = memberById(owned[0]?.memberId);
  const addedForOthers = owned.slice(1).flatMap((o) => memberById(o.memberId) ?? []);
  const ownedIds = new Set(owned.map((o) => o.memberId));

  async function save(name: string, busy: BusyBlock[], existing: Owned | null) {
    const res = await fetch(`/api/groups/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, busy, memberId: existing?.memberId, editKey: existing?.editKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!existing) {
      const entry = { memberId: data.memberId, editKey: data.editKey };
      // Your own schedule always goes first; anyone else's is added after it.
      const next = myMember ? [...owned, entry] : [entry, ...owned.slice(1)];
      setOwned(next);
      storeOwned(id, next);
    }
    setGroup(data.group);
    setEditing(null);
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
        <Button variant="secondary" onClick={share}>
          {copied ? "Link copied!" : "Share group link"}
        </Button>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          {!myMember ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Add your schedule</h2>
              <UploadSchedule key="self" onSave={(name, busy) => save(name, busy, null)} />
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
                onSave={(name, busy) => save(name, busy, editingOwned)}
                onCancel={() => setEditing(null)}
              />
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

          <People group={group} meId={myMember?.id} ownedIds={ownedIds} focusId={focusId} setFocusId={setFocusId} />
        </div>

        <div className="space-y-6">
          <Results group={group} />
          {group.members.length > 0 && (
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Week at a glance</h2>
              <WeekGrid group={group} focusId={focusId} />
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function People({
  group,
  meId,
  ownedIds,
  focusId,
  setFocusId,
}: {
  group: Group;
  meId?: string;
  ownedIds: Set<string>;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}) {
  const focus = group.members.find((m) => m.id === focusId);
  return (
    <Card>
      <h2 className="text-lg font-semibold">
        {group.members.length === 0
          ? "Nobody has added a schedule yet"
          : `${group.members.length} ${group.members.length === 1 ? "person has" : "people have"} added a schedule`}
      </h2>
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

function Results({ group }: { group: Group }) {
  const everyone = useMemo(() => everyoneFreeWindows(group), [group]);
  const partial = useMemo(() => (everyone.length ? [] : bestPartialWindows(group)), [group, everyone.length]);
  const names = new Map(group.members.map((m) => [m.id, m.name]));
  const total = group.members.length;

  if (total < 2) {
    return (
      <Card className="bg-emerald-50/50">
        <h2 className="text-lg font-semibold">Times everyone is free</h2>
        <p className="mt-1 text-sm text-stone-600">
          {total === 0
            ? "Add your schedule, then share the link. Free times show up here once two or more people have added theirs."
            : "Waiting for more people. Share the link in your group chat!"}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">
        {everyone.length ? `Times all ${total} of you are free` : "No time works for everyone yet"}
      </h2>
      <p className="text-sm text-stone-500">
        {everyone.length
          ? `Only showing times with at least ${group.meetingMinutes} minutes free.`
          : "These times work for the most people:"}
      </p>
      <ul className="mt-3 space-y-2">
        {(everyone.length ? everyone : partial).map((w, i) => {
          const missing = group.members.filter((m) => !w.freeIds.includes(m.id));
          return (
            <li
              key={i}
              className={`rounded-xl border px-4 py-3 ${everyone.length ? "border-emerald-200 bg-emerald-50" : "border-stone-200"}`}
            >
              <div className="font-semibold">
                {DAY_NAMES[w.day]} · {formatRange(w.start, w.end)}
              </div>
              {missing.length > 0 && (
                <div className="text-sm text-stone-500">
                  {w.freeIds.length} of {total} free · {missing.map((m) => names.get(m.id)).join(", ")} can&apos;t make it
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!everyone.length && partial.length === 0 && (
        <p className="mt-3 text-sm text-stone-600">Nobody has a long enough gap in the hours you picked.</p>
      )}
    </Card>
  );
}
