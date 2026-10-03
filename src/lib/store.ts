import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { Group, Meeting, Proposal, StoredGroup, StoredMember, Vote } from "./types";

// Groups are stored in the Neon Postgres database connected to the Vercel project when it's set up
// (DATABASE_URL), and in a local JSON file otherwise (for running on your own computer).
//
// Each person's schedule, each suggested time and each vote is its own row, so people saving at the
// same moment can't overwrite each other.

export function newId(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

export function toPublic(group: StoredGroup): Group {
  const { adminKey: _adminKey, ...rest } = group;
  void _adminKey;
  return {
    ...rest,
    members: group.members.map(({ id, name, busy, updatedAt, shareDetails, timeZone }) => ({
      id,
      name,
      // Event names stay private unless the person chose to share them.
      busy: shareDetails ? busy : busy.map(({ label: _label, ...b }) => (void _label, b)),
      updatedAt,
      shareDetails: !!shareDetails,
      ...(timeZone ? { timeZone } : {}),
    })),
  };
}

type Settings = Omit<StoredGroup, "members" | "proposals" | "meeting">;

function settingsOf(group: StoredGroup): Settings {
  const { members: _m, proposals: _p, meeting: _meeting, ...settings } = group;
  void _m;
  void _p;
  void _meeting;
  return settings;
}

// --- Postgres ---

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

let schemaReady: Promise<unknown> | null = null;
function ensureSchema() {
  schemaReady ??= (async () => {
    await sql!`CREATE TABLE IF NOT EXISTS groups (
      id text PRIMARY KEY,
      settings jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql!`ALTER TABLE groups ADD COLUMN IF NOT EXISTS meeting jsonb`;
    await sql!`CREATE TABLE IF NOT EXISTS members (
      group_id text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      id text NOT NULL,
      data jsonb NOT NULL,
      added_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, id)
    )`;
    await sql!`CREATE TABLE IF NOT EXISTS proposals (
      group_id text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      id text NOT NULL,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, id)
    )`;
    await sql!`CREATE TABLE IF NOT EXISTS votes (
      group_id text NOT NULL,
      proposal_id text NOT NULL,
      member_id text NOT NULL,
      vote text NOT NULL,
      PRIMARY KEY (group_id, proposal_id, member_id),
      FOREIGN KEY (group_id, proposal_id) REFERENCES proposals(group_id, id) ON DELETE CASCADE
    )`;
    await sql!`CREATE TABLE IF NOT EXISTS screenshot_reads (
      who text NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql!`CREATE INDEX IF NOT EXISTS screenshot_reads_who_at ON screenshot_reads (who, at)`;
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

async function db() {
  await ensureSchema();
  return sql!;
}

// --- Local file ---

const DATA_FILE = path.join(process.cwd(), "data", "groups.json");
let queue: Promise<unknown> = Promise.resolve();

async function readFile(): Promise<Record<string, StoredGroup>> {
  try {
    const all: Record<string, StoredGroup> = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    for (const g of Object.values(all)) {
      g.proposals ??= [];
      g.meeting ??= null;
    }
    return all;
  } catch {
    return {};
  }
}

// Runs file changes one at a time so two saves at once don't overwrite each other.
function changeFile<T>(change: (all: Record<string, StoredGroup>) => T): Promise<T> {
  const run = async () => {
    const all = await readFile();
    const result = change(all);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(`${DATA_FILE}.tmp`, JSON.stringify(all, null, 2));
    await fs.rename(`${DATA_FILE}.tmp`, DATA_FILE);
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

// --- Groups ---

export async function getGroup(id: string): Promise<StoredGroup | null> {
  if (!sql) return (await readFile())[id] ?? null;
  const q = await db();
  const rows = await q`
    SELECT g.settings, g.meeting,
      COALESCE((SELECT json_agg(m.data ORDER BY m.added_at) FROM members m WHERE m.group_id = g.id), '[]') AS members,
      COALESCE((
        SELECT json_agg(p.data || jsonb_build_object('votes', COALESCE(
          (SELECT jsonb_object_agg(v.member_id, v.vote) FROM votes v WHERE v.group_id = p.group_id AND v.proposal_id = p.id),
          '{}'::jsonb)) ORDER BY p.created_at)
        FROM proposals p WHERE p.group_id = g.id
      ), '[]') AS proposals
    FROM groups g WHERE g.id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...(row.settings as Settings),
    members: row.members as StoredMember[],
    proposals: row.proposals as Proposal[],
    meeting: (row.meeting as Meeting | null) ?? null,
  };
}

export async function createGroup(group: StoredGroup): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      all[group.id] = group;
    });
    return;
  }
  const q = await db();
  await q`INSERT INTO groups (id, settings) VALUES (${group.id}, ${JSON.stringify(settingsOf(group))})`;
}

// Changes some of a group's settings (like how many people are in it).
export async function updateSettings(id: string, changes: Partial<Settings>): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      if (all[id]) Object.assign(all[id], changes);
    });
    return;
  }
  const q = await db();
  await q`UPDATE groups SET settings = settings || ${JSON.stringify(changes)}::jsonb, updated_at = now() WHERE id = ${id}`;
}

// Removes one setting from a group (like the group size, when the creator picks "Not sure yet").
export async function clearSetting(id: string, key: "expectedCount"): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      if (all[id]) delete all[id][key];
    });
    return;
  }
  const q = await db();
  await q`UPDATE groups SET settings = settings - ${key}::text WHERE id = ${id}`;
}

// Deletes a group along with everyone's schedules, suggested times and votes.
export async function deleteGroup(id: string): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      delete all[id];
    });
    return;
  }
  const q = await db();
  await q`DELETE FROM groups WHERE id = ${id}`;
}

// --- Schedules ---

// Adds or replaces one person's schedule in a group.
export async function saveMember(groupId: string, member: StoredMember): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      const group = all[groupId];
      if (!group) return;
      const index = group.members.findIndex((m) => m.id === member.id);
      if (index === -1) group.members.push(member);
      else group.members[index] = member;
    });
    return;
  }
  const q = await db();
  await q`
    INSERT INTO members (group_id, id, data) VALUES (${groupId}, ${member.id}, ${JSON.stringify(member)})
    ON CONFLICT (group_id, id) DO UPDATE SET data = EXCLUDED.data`;
  await q`UPDATE groups SET updated_at = now() WHERE id = ${groupId}`;
}

// Removes one person's schedule (and their votes) from a group.
export async function deleteMember(groupId: string, memberId: string): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      const group = all[groupId];
      if (!group) return;
      group.members = group.members.filter((m) => m.id !== memberId);
      for (const p of group.proposals) delete p.votes[memberId];
    });
    return;
  }
  const q = await db();
  await q`DELETE FROM votes WHERE group_id = ${groupId} AND member_id = ${memberId}`;
  await q`DELETE FROM members WHERE group_id = ${groupId} AND id = ${memberId}`;
}

// --- Picking a time ---

export async function addProposal(groupId: string, proposal: Proposal): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      all[groupId]?.proposals.push(proposal);
    });
    return;
  }
  const q = await db();
  const { votes, ...data } = proposal;
  await q`INSERT INTO proposals (group_id, id, data) VALUES (${groupId}, ${proposal.id}, ${JSON.stringify(data)})`;
  for (const [memberId, vote] of Object.entries(votes)) await setVote(groupId, proposal.id, memberId, vote);
}

export async function deleteProposal(groupId: string, proposalId: string): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      const group = all[groupId];
      if (group) group.proposals = group.proposals.filter((p) => p.id !== proposalId);
    });
    return;
  }
  const q = await db();
  await q`DELETE FROM proposals WHERE group_id = ${groupId} AND id = ${proposalId}`;
}

// Records someone's vote on a suggested time, or clears it when vote is null.
export async function setVote(groupId: string, proposalId: string, memberId: string, vote: Vote | null): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      const proposal = all[groupId]?.proposals.find((p) => p.id === proposalId);
      if (!proposal) return;
      if (vote) proposal.votes[memberId] = vote;
      else delete proposal.votes[memberId];
    });
    return;
  }
  const q = await db();
  if (vote) {
    await q`
      INSERT INTO votes (group_id, proposal_id, member_id, vote) VALUES (${groupId}, ${proposalId}, ${memberId}, ${vote})
      ON CONFLICT (group_id, proposal_id, member_id) DO UPDATE SET vote = EXCLUDED.vote`;
  } else {
    await q`DELETE FROM votes WHERE group_id = ${groupId} AND proposal_id = ${proposalId} AND member_id = ${memberId}`;
  }
}

export async function setMeeting(groupId: string, meeting: Meeting | null): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      if (all[groupId]) all[groupId].meeting = meeting;
    });
    return;
  }
  const q = await db();
  await q`UPDATE groups SET meeting = ${meeting ? JSON.stringify(meeting) : null}::jsonb, updated_at = now() WHERE id = ${groupId}`;
}

// --- Screenshot reading limit ---

const localReads = new Map<string, number[]>();

// Counts a screenshot read for one person (`who` is a scrambled id, never their real address) unless they
// already hit `limit` in the past hour. Returns whether it's allowed and, if not, when the oldest read
// in the window expires.
export async function takeScreenshotRead(who: string, limit: number): Promise<{ ok: boolean; retryAt?: Date }> {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (!sql) {
    const recent = (localReads.get(who) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= limit) return { ok: false, retryAt: new Date(recent[0] + 60 * 60 * 1000) };
    localReads.set(who, [...recent, Date.now()]);
    return { ok: true };
  }
  const q = await db();
  const rows = await q`
    SELECT count(*)::int AS n, min(at) AS oldest FROM screenshot_reads
    WHERE who = ${who} AND at > now() - interval '1 hour'`;
  if (rows[0].n >= limit) {
    return { ok: false, retryAt: new Date(new Date(rows[0].oldest).getTime() + 60 * 60 * 1000) };
  }
  await q`INSERT INTO screenshot_reads (who) VALUES (${who})`;
  // Now and then, clear out records older than a day so the table stays tiny.
  if (Math.random() < 0.05) await q`DELETE FROM screenshot_reads WHERE at < now() - interval '1 day'`;
  return { ok: true };
}
