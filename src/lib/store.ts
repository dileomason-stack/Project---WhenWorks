import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Group, StoredGroup, StoredMember } from "./types";

import { neon } from "@neondatabase/serverless";

// Groups are stored in the Neon Postgres database connected to the Vercel project when it's set up
// (DATABASE_URL), and in a local JSON file otherwise (for running on your own computer).
//
// Each person's schedule is its own row, so two people saving at the same moment can't overwrite each other.

export function newId(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

export function toPublic(group: StoredGroup): Group {
  return {
    ...group,
    members: group.members.map(({ id, name, busy, updatedAt }) => ({ id, name, busy, updatedAt })),
  };
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
    await sql!`CREATE TABLE IF NOT EXISTS members (
      group_id text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      id text NOT NULL,
      data jsonb NOT NULL,
      added_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, id)
    )`;
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

// --- Local file ---

const DATA_FILE = path.join(process.cwd(), "data", "groups.json");
let queue: Promise<unknown> = Promise.resolve();

async function readFile(): Promise<Record<string, StoredGroup>> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
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

// --- Shared interface ---

export async function getGroup(id: string): Promise<StoredGroup | null> {
  if (!sql) return (await readFile())[id] ?? null;
  await ensureSchema();
  const rows = await sql`
    SELECT g.settings,
      COALESCE((SELECT json_agg(m.data ORDER BY m.added_at) FROM members m WHERE m.group_id = g.id), '[]') AS members
    FROM groups g WHERE g.id = ${id}`;
  if (rows.length === 0) return null;
  return { ...(rows[0].settings as Omit<StoredGroup, "members">), members: rows[0].members as StoredMember[] };
}

export async function createGroup(group: StoredGroup): Promise<void> {
  if (!sql) {
    await changeFile((all) => {
      all[group.id] = group;
    });
    return;
  }
  await ensureSchema();
  const settings: Omit<StoredGroup, "members"> & { members?: unknown } = { ...group };
  delete settings.members;
  await sql`INSERT INTO groups (id, settings) VALUES (${group.id}, ${JSON.stringify(settings)})`;
}

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
  await ensureSchema();
  await sql`
    INSERT INTO members (group_id, id, data) VALUES (${groupId}, ${member.id}, ${JSON.stringify(member)})
    ON CONFLICT (group_id, id) DO UPDATE SET data = EXCLUDED.data`;
  await sql`UPDATE groups SET updated_at = now() WHERE id = ${groupId}`;
}
