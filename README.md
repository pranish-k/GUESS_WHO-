# Guess Who? — FaceTime edition

A two-player Guess Who game for playing over FaceTime. Each phone shows the
*other* player's secret identity (a real person, with photo + name) — that's
who *they* are, and the person looking at it answers yes/no questions about it.

- Both phones reveal at the same time once both players are in.
- Real public figures only — photos come from Wikipedia.
- Tap **Next round** to deal new people on the same PIN, again and again, with
  no need to re-enter anything.

## Setup (one-time): free Upstash Redis

The game keeps shared state in Upstash Redis so it survives serverless cold
starts and works across rounds. This is free and takes ~3 minutes.

1. Go to [upstash.com](https://upstash.com), sign up, create a **Redis** database (any region near you).
2. On the database page, find the **REST API** section.
3. Copy these two values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## Deploy to Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new).
2. Before (or right after) deploying, go to **Project → Settings →
   Environment Variables** and add the two values from Upstash:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. **Redeploy** so the env vars take effect.
4. Vercel gives you a URL like `your-app.vercel.app`. Share it.

If the env vars are missing, the app returns a clear "Server not configured"
error instead of silently failing.

## How it works

- `index.html` — the whole UI, served as a static page. Both players poll the
  API every 2s; the reveal only fills in once both are present, so it appears
  on both phones together (within ~2s).
- `api/game.js` — a serverless function. Stores each game in Redis keyed by
  PIN, deals two distinct identities per round, and resolves each name to a
  freely-licensed Wikipedia photo.
- One player taps **Start a new game** → gets a 4-digit PIN.
- The other taps **Join** → enters PIN → both phones reveal each other's
  identity at the same time.
- Play yes/no questions on FaceTime. When you're both done guessing, either of
  you taps **Next round** — same PIN, new people, on both phones.

## Notes

- "Simultaneous" reveal is poll-based (~2s), not a live socket — close enough
  for FaceTime play, not frame-perfect.
- Games auto-expire from Redis after 6 hours.
- The name pool is real public figures so every card has a real photo; a
  generated initials avatar is a last-resort fallback if Wikipedia has no
  image for a name.
