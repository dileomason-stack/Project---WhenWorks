# WhenWorks

Find a time when everyone in your group project is free. Make a group link, send it to the group chat,
and everyone uploads a screenshot of their schedule. The site reads it, shows a calendar mockup to check
against the screenshot, and highlights the times when everyone is free.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste a free Gemini key from https://aistudio.google.com/apikey
npm run dev                  # open http://localhost:3000
```

## Deploying

Live at https://usewhenworks.vercel.app. Hosted on Vercel from this GitHub repo; every push to `main` redeploys. The Vercel project needs:

- `GEMINI_API_KEY` environment variable
- A Neon Postgres database connected through the Vercel Marketplace (adds `DATABASE_URL`). Tables are created automatically.
