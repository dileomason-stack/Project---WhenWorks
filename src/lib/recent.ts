// The groups this browser has opened, newest first, so the home page can list them.

export interface RecentGroup {
  id: string;
  name: string;
  visitedAt: string;
}

const KEY = "whenworks:recent";

export function listRecent(): RecentGroup[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function store(list: RecentGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // Storage blocked; the list just won't be remembered.
  }
}

export function rememberGroup(id: string, name: string) {
  store([{ id, name, visitedAt: new Date().toISOString() }, ...listRecent().filter((g) => g.id !== id)]);
}

export function forgetGroup(id: string) {
  store(listRecent().filter((g) => g.id !== id));
}
