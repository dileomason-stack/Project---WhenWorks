@AGENTS.md

# GroupSync

A When2meet alternative for class group projects. Someone creates a group link, everyone uploads a
screenshot of their schedule, Gemini reads the busy times, each person checks/fixes them, and the page
highlights when everyone is free. There is deliberately no paint-your-availability grid.

- Run: `npm run dev`, then open http://localhost:3000
- Screenshot reading needs `GEMINI_API_KEY` in `.env.local` (free tier, see `.env.example`).
- Schedules are a repeating week: days 0 = Mon … 6 = Sun, times in minutes after midnight (`src/lib/types.ts`).
- Free-time math lives in `src/lib/schedule.ts` (15-minute slots; a slot is free only if fully free).
- Storage is a local JSON file (`data/groups.json`, gitignored) behind `src/lib/store.ts`; swap it for a
  hosted database before deploying, since Vercel's disk doesn't persist.
- Each member gets a secret `editKey`, kept in their browser's localStorage, so only they can edit their schedule.

Planned next: Google Calendar / Apple .ics import as backups, voting on a time, then calendar invites
(plus a Google Meet link for online groups), then deploy to Vercel.
