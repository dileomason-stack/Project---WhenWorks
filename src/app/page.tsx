"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Spinner } from "@/components/ui";
import { formatTime } from "@/lib/schedule";
import { DAY_SHORT, type MeetingMode } from "@/lib/types";

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60);

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<MeetingMode>("in_person");
  const [meetingMinutes, setMeetingMinutes] = useState(60);
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [dayStart, setDayStart] = useState(8 * 60);
  const [dayEnd, setDayEnd] = useState(22 * 60);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mode, meetingMinutes, days, dayStart, dayEnd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/g/${data.id}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't create the group. Try again.");
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">GroupSync</h1>
      <p className="mt-3 text-lg text-stone-600">
        Make a group link, send it to the group chat, and everyone uploads a screenshot of their schedule. You&apos;ll see
        exactly when you&apos;re all free.
      </p>

      <Card className="mt-8">
        <form onSubmit={create} className="space-y-6">
          <label className="block">
            <span className="text-sm font-semibold">Group name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSC 101 project group"
              maxLength={80}
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </label>

          <div>
            <span className="text-sm font-semibold">Meeting type</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["in_person", "In person", "Meet up somewhere"],
                  ["online", "Online call", "Video call link"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setMode(value)}
                  className={`rounded-xl border px-3 py-2.5 text-left ${
                    mode === value ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-stone-500">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold">How long is the meeting?</span>
            <select
              value={meetingMinutes}
              onChange={(e) => setMeetingMinutes(Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </label>

          <div>
            <span className="text-sm font-semibold">Which days could work?</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DAY_SHORT.map((label, d) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => toggleDay(d)}
                  className={`w-12 rounded-lg border py-2 text-sm font-medium ${
                    days.includes(d) ? "border-emerald-500 bg-emerald-600 text-white" : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-semibold">Between</span>
            <div className="mt-1.5 flex items-center gap-2">
              <select
                value={dayStart}
                onChange={(e) => setDayStart(Number(e.target.value))}
                className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
              >
                {HOURS.slice(0, 24).map((m) => (
                  <option key={m} value={m} disabled={m >= dayEnd}>
                    {formatTime(m)}
                  </option>
                ))}
              </select>
              <span className="text-stone-500">and</span>
              <select
                value={dayEnd}
                onChange={(e) => setDayEnd(Number(e.target.value))}
                className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5"
              >
                {HOURS.slice(1).map((m) => (
                  <option key={m} value={m} disabled={m <= dayStart}>
                    {m === 24 * 60 ? "midnight" : formatTime(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={creating || !name.trim() || days.length === 0} className="w-full py-3 text-base">
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
