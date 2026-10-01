"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { forgetGroup, listRecent, type RecentGroup } from "@/lib/recent";
import { Button, Card, Spinner } from "@/components/ui";
import GroupFields from "@/components/GroupFields";
import { DEFAULT_SETTINGS, type GroupSettings } from "@/lib/groupSettings";

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<GroupSettings>(DEFAULT_SETTINGS);
  const [recent, setRecent] = useState<RecentGroup[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved list only exists in the browser
    setRecent(listRecent());
  }, []);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      try {
        // Remember that this browser made the group, so it can delete it later.
        localStorage.setItem(`whenworks:${data.id}`, JSON.stringify({ members: [], adminKey: data.adminKey }));
      } catch {
        // Private browsing can block storage; the group still works, it just can't be deleted from here.
      }
      router.push(`/g/${data.id}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't create the group. Try again.");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">WhenWorks</h1>
      <p className="mt-3 text-lg text-stone-600">
        Make a group link, send it to the group chat, and everyone uploads a screenshot of their schedule. You&apos;ll see
        exactly when you&apos;re all free.
      </p>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-stone-600">Your groups</h2>
          <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {recent.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <Link href={`/g/${g.id}`} className="min-w-0 flex-1 truncate px-4 py-3 font-medium hover:bg-stone-50">
                  {g.name}
                </Link>
                <button
                  onClick={() => {
                    forgetGroup(g.id);
                    setRecent(listRecent());
                  }}
                  className="px-4 py-3 text-sm text-stone-400 hover:text-stone-700"
                  aria-label={`Remove ${g.name} from this list`}
                  title="Remove from this list (doesn't delete the group)"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <h2 className="mt-8 text-sm font-semibold text-stone-600">Start a new group</h2>
        </section>
      )}

      <Card className={recent.length ? "mt-2" : "mt-8"}>
        <form onSubmit={create} className="space-y-6">
          <GroupFields value={settings} onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))} autoFocus />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={creating || !settings.name.trim() || settings.days.length === 0} className="w-full py-3 text-base">
            {creating && <Spinner />} Create group link
          </Button>
        </form>
      </Card>

      <ol className="mt-10 space-y-3 text-sm text-stone-600">
        <li><b className="text-stone-800">1.</b> Create the group and upload your own schedule screenshot.</li>
        <li><b className="text-stone-800">2.</b> Paste the link in your group chat.</li>
        <li><b className="text-stone-800">3.</b> As people add theirs, the times you&apos;re all free light up.</li>
      </ol>
    </main>
  );
}
