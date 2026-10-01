@AGENTS.md

# WhenWorks

A When2meet alternative for class group projects. Someone creates a group link, everyone uploads a
screenshot of their schedule, Gemini reads the busy times, each person checks/fixes them, and the page
highlights when everyone is free. There is deliberately no paint-your-availability grid.

- Run: `npm run dev`, then open http://localhost:3000
- Screenshot reading needs `GEMINI_API_KEY` in `.env.local` (free tier, see `.env.example`).
- Schedules are a repeating week: days 0 = Mon … 6 = Sun, times in minutes after midnight (`src/lib/types.ts`).
- Free-time math lives in `src/lib/schedule.ts` (15-minute slots; a slot is free only if fully free).
- Storage (`src/lib/store.ts`): Neon Postgres when `DATABASE_URL` is set (Vercel Marketplace), otherwise a
  local JSON file (`data/groups.json`, gitignored). Tables `groups` and `members` are created on first use;
  each person is one row, so concurrent saves don't clobber each other. (Not Upstash: the account's one free
  Upstash database belongs to the Homeroom project and holds its login records.)
- Each schedule gets a secret `editKey`. The browser that added it keeps the key in localStorage
  (`whenworks:<groupId>` → `{ members: [...] }`, first entry is "you"), so people can also add and edit
  schedules for friends who just send them a screenshot.
- Screenshot reading (`src/lib/gemini.ts`) races the newer Gemini flash models in parallel, then falls back
  to older ones, because the free tier is often overloaded. Uploads must stay under Vercel's 4.5 MB body limit.
- Deploys: GitHub repo → Vercel, every push to `main` redeploys (same setup as the Homeroom project).

Planned next: voting on a time, then calendar invites (plus a Google Meet link for online groups),
then Google Calendar / Apple .ics import as backups.
