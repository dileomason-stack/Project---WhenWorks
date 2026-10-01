import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Group, StoredGroup, StoredMember } from "./types";

// Groups are stored in the Upstash Redis database connected to the Vercel project when it's set up,
// and in a local JSON file otherwise (for running on your own computer).
//
// In Redis, each group is two keys: `group:<id>` holds the settings, and the hash `group:<id>:members`
// holds one field per person. Saving a person only touches their own field, so two people saving at
// the same moment can't overwrite each other.

const TTL_SECONDS = 180 * 24 * 60 * 60; // Groups disappear six months after their last change.

export function newId(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

export function toPublic(group: StoredGroup): Group {
  return {
    ...group,
    members: group.members.map(({ id, name, busy, updatedAt }) => ({ id, name, busy, updatedAt })),
  };
}

// --- Redis ---

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const config = redisConfig()!;
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`storage ${res.status}`);
  const results: { result?: unknown; error?: string }[] = await res.json();
  const failed = results.find((r) => r.error);
  if (failed) throw new Error(`storage ${failed.error}`);
  return results.map((r) => r.result);
}

const groupKey = (id: string) => `group:${id}`;
const membersKey = (id: string) => `group:${id}:members`;

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
  if (!redisConfig()) return (await readFile())[id] ?? null;
  const [settings, members] = (await pipeline([
    ["GET", groupKey(id)],
    ["HVALS", membersKey(id)],
  ])) as [string | null, string[]];
  if (!settings) return null;
  const parsed = (members ?? []).map((m) => JSON.parse(m) as StoredMember);
  parsed.sort((a, b) => (a.addedAt ?? "").localeCompare(b.addedAt ?? ""));
  return { ...JSON.parse(settings), members: parsed };
}

export async function createGroup(group: StoredGroup): Promise<void> {
  if (!redisConfig()) {
    await changeFile((all) => {
      all[group.id] = group;
    });
    return;
  }
  const settings: Omit<StoredGroup, "members"> & { members?: unknown } = { ...group };
  delete settings.members;
  await pipeline([["SET", groupKey(group.id), JSON.stringify(settings), "EX", TTL_SECONDS]]);
}

// Adds or replaces one person's schedule in a group.
export async function saveMember(groupId: string, member: StoredMember): Promise<void> {
  if (!redisConfig()) {
    await changeFile((all) => {
      const group = all[groupId];
      if (!group) return;
      const index = group.members.findIndex((m) => m.id === member.id);
      if (index === -1) group.members.push(member);
      else group.members[index] = member;
    });
    return;
  }
  await pipeline([
    ["HSET", membersKey(groupId), member.id, JSON.stringify(member)],
    ["EXPIRE", groupKey(groupId), TTL_SECONDS],
    ["EXPIRE", membersKey(groupId), TTL_SECONDS],
  ]);
}
