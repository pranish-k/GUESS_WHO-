# Guess Who? — FaceTime edition

A two-player Guess Who game for playing over FaceTime. Each phone shows the *other* player's secret identity.

## Deploy to Vercel

The easiest way:

1. Put these files in a GitHub repo (or just upload directly).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo (or drag-and-drop the folder).
3. Click **Deploy**. No settings to change.
4. Vercel gives you a URL like `your-app.vercel.app`. Share it.

That's it. No build step, no environment variables, no database.

### Or with Vercel CLI

```bash
npm i -g vercel
cd guess-who
vercel
```

Follow the prompts. When it asks about settings, just hit enter to accept defaults.

## How it works

- `index.html` — the whole UI, served as a static page.
- `api/game.js` — a tiny serverless function that holds game state in memory (50 names baked in).
- One player taps "Start a new game" → gets a 4-digit PIN.
- The other taps "Join" → enters PIN → both phones reveal each other's secret identity.
- Play yes/no questions on FaceTime until someone guesses themselves right.

## Notes

- Game state lives in serverless function memory. It'll get cleared if Vercel cold-starts the function — fine for casual 2-player use, but don't start a game and walk away for an hour.
- Games older than 2 hours auto-clear so memory doesn't pile up.
