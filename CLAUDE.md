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

- Events repeat weekly unless they have a `date` (one-time; only counts in that week). The calendar shows one
  week at a time (`groupForWeek` in `src/lib/schedule.ts`); dates are "YYYY-MM-DD" helpers in `src/lib/dates.ts`.
- Picking a time: `/api/groups/[id]/plan` handles propose / vote / confirm / unconfirm / size. Votes are per
  member and need that member's edit key; the creator's `adminKey` can confirm anytime, others once everyone
  said yes. The confirmed meeting has a Google Calendar link and `/api/groups/[id]/invite.ics` (Apple/Outlook).
  Online groups get a "Create a Google Meet" button (opens meet.google.com/new; the user pastes the link back) with a free Jitsi link as a fallback. Auto-creating Meet links would need Google OAuth + app verification, deliberately skipped. Times use the creator's `timeZone`.
- Event names are private by default: `toPublic` strips labels unless the member set `shareDetails`; owners
  load their own full schedule from `/api/groups/[id]/members/mine` with their edit key.
- Screenshot reading is capped at 10 per hour per person (hashed IP, `screenshot_reads` table) so nobody can
  burn through the free Gemini allowance.
- The creator can change group settings (`settings` action); the form fields are shared in `GroupFields`.
- Time zones: the group has a home `timeZone` (creator's choice) that the meeting hours, proposals and invites
  use; each schedule stores the `timeZone` it was entered in. `groupForWeek` converts other zones into the
  group's for that specific week (DST-safe, splitting events that cross midnight). Viewers in another zone get
  a second time column and "… in <their city>" next to proposals and the meeting.
- The home page lists "Your groups" from localStorage (`src/lib/recent.ts`).

Possible next: Google Calendar / Apple .ics import as a backup to screenshots.
