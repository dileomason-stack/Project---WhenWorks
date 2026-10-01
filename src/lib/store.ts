import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Group, StoredGroup } from "./types";

// Local storage in a JSON file. This gets swapped for a real database when the site goes online.
const DATA_FILE = path.join(process.cwd(), "data", "groups.json");

let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Record<string, StoredGroup>> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeAll(groups: Record<string, StoredGroup>) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(groups, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

// Runs changes one at a time so two people saving at once don't overwrite each other.
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export function newId(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

export async function getGroup(id: string): Promise<StoredGroup | null> {
  return (await readAll())[id] ?? null;
}

export function updateGroup<T>(id: string, change: (group: StoredGroup) => T): Promise<T | null> {
  return serialized(async () => {
    const all = await readAll();
    const group = all[id];
    if (!group) return null;
    const result = change(group);
    await writeAll(all);
    return result;
  });
}

export function createGroup(group: StoredGroup): Promise<void> {
  return serialized(async () => {
    const all = await readAll();
    all[group.id] = group;
    await writeAll(all);
  });
}

export function toPublic(group: StoredGroup): Group {
  return {
    ...group,
    members: group.members.map(({ id, name, busy, updatedAt }) => ({ id, name, busy, updatedAt })),
  };
}
