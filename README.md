# Guess Who? — FaceTime edition 🥒

A two-player Guess Who game for playing over FaceTime, in a cucumber +
watercolour theme. Each phone shows the *other* player's secret identity
(a real person, with photo + name) — that's who *they* are, and the person
looking at it answers yes/no questions about it.

- Both phones reveal at the same time once both players are in.
- Real public figures only — photos come from Wikipedia.
- Tap **Next round** to deal new people on the same PIN, again and again,
  with no need to re-enter anything.

## Deploy to Vercel

No accounts, no database, no environment variables, no payment.

1. Import this repo at [vercel.com/new](https://vercel.com/new).
2. Click **Deploy**. There's nothing to configure.
3. Vercel gives you a URL like `your-app.vercel.app`. Share it.

### Or with Vercel CLI

```bash
npm i -g vercel
vercel
```

Hit enter through the prompts to accept defaults.

## How it works

- `index.html` — the whole UI, served as a static page. Both players poll the
  API every 2s; the reveal only fills in once both are present, so it appears
  on both phones together (within ~2s).
- `api/game.js` — a serverless function that holds game state in memory. It
  deals two distinct identities per round and resolves each name to a
  freely-licensed Wikipedia photo.
- One player taps **Start a new game** → gets a 4-digit PIN.
- The other taps **Join** → enters PIN → both phones reveal each other's
  identity at the same time.
- Play yes/no questions on FaceTime. When you're both done guessing, either of
  you taps **Next round** — same PIN, new people, on both phones.

## Notes

- **State is in serverless memory.** Each warm instance has its own copy and a
  cold start clears it. To stay playable, the server *recovers* a forgotten
  game instead of erroring — worst case after a cold start is that you get
  re-dealt new people and keep going, never a dead "game not found" wall.
  Perfectly fine for casual back-and-forth play; just don't expect a paused
  game to survive an hour untouched.
- "Simultaneous" reveal is poll-based (~2s), not a live socket — close enough
  for FaceTime play, not frame-perfect.
- Games auto-expire from memory after 6 hours.
- The name pool is real public figures so every card has a real photo; a
  generated initials avatar is a last-resort fallback if Wikipedia has no
  image for a name.
