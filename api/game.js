// In-memory game store. No database, no accounts, no env vars.
//
// Serverless caveat: each warm instance has its own memory, and a cold start
// wipes it. To stay playable anyway, a `state`/`next` call for a PIN the
// current instance doesn't know about will REBUILD the game (recover) rather
// than error. Worst case after a cold start: you get re-dealt new people and
// keep playing — never a dead "game not found" wall.
const games = global.__games || (global.__games = {});

// Real people only — every name resolves to a real freely-licensed
// photo on Wikipedia, so no avatar fallbacks are needed in practice.
const POOL = [
  // Musicians
  "Taylor Swift", "Beyoncé", "Drake", "Rihanna", "Bad Bunny",
  "Lady Gaga", "Adele", "Bruno Mars", "Billie Eilish", "Ariana Grande",
  "Ed Sheeran", "Justin Bieber", "Snoop Dogg", "Dolly Parton", "Shakira",
  // Actors
  "Tom Hanks", "Keanu Reeves", "Zendaya", "Timothée Chalamet", "Pedro Pascal",
  "Margot Robbie", "Ryan Gosling", "Emma Stone", "Will Smith", "Dwayne Johnson",
  "Jennifer Lawrence", "Leonardo DiCaprio", "Scarlett Johansson", "Denzel Washington", "Tom Cruise",
  // Athletes
  "LeBron James", "Cristiano Ronaldo", "Lionel Messi", "Serena Williams", "Steph Curry",
  "Usain Bolt", "Simone Biles", "Roger Federer", "Tom Brady", "Naomi Osaka",
  // Public figures
  "Barack Obama", "Oprah Winfrey", "Elon Musk", "Kim Kardashian", "MrBeast",
  "Bill Gates", "Greta Thunberg", "Michelle Obama", "Gordon Ramsay", "David Attenborough"
];

// --- game helpers ---------------------------------------------------------

function pickTwo() {
  const a = Math.floor(Math.random() * POOL.length);
  let b = Math.floor(Math.random() * POOL.length);
  while (b === a) b = Math.floor(Math.random() * POOL.length);
  return [POOL[a], POOL[b]];
}

function genPin() {
  for (let i = 0; i < 25; i++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!games[pin]) return pin;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Drop games older than 6h so memory doesn't grow on a long-lived instance.
function cleanup() {
  const now = Date.now();
  for (const pin of Object.keys(games)) {
    if (now - games[pin].created > 6 * 60 * 60 * 1000) delete games[pin];
  }
}

// Fetch a freely-licensed lead image from Wikipedia. The pool is real people,
// so this resolves to a real photo; the avatar is a last-resort safety net.
function avatarFallback(name) {
  return "https://api.dicebear.com/9.x/initials/svg?seed=" +
    encodeURIComponent(name) + "&backgroundColor=5fae4a,aede7e";
}

async function fetchImage(name) {
  try {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json" +
      "&prop=pageimages&piprop=original|thumbnail&pithumbsize=600&redirects=1" +
      "&titles=" + encodeURIComponent(name) + "&origin=*";
    const r = await fetch(url, { headers: { "User-Agent": "guess-who-game/1.0" } });
    if (!r.ok) return avatarFallback(name);
    const data = await r.json();
    const pages = data && data.query && data.query.pages;
    if (pages) {
      const page = Object.values(pages)[0];
      const img = page && (page.original || page.thumbnail);
      if (img && img.source) return img.source;
    }
  } catch (e) { /* fall through to avatar */ }
  return avatarFallback(name);
}

// Deal a fresh round: two distinct identities with their photos resolved.
async function dealRound() {
  const [nameA, nameB] = pickTwo();
  const [imgA, imgB] = await Promise.all([fetchImage(nameA), fetchImage(nameB)]);
  return {
    host: { name: nameA, image: imgA },   // asked about by "guest"
    guest: { name: nameB, image: imgB }   // asked about by "host"
  };
}

// What a given player sees: the OTHER player's identity (they answer about it).
function viewFor(game, role) {
  const otherSlot = role === "host" ? game.round.guest : game.round.host;
  const bothIn = game.hostJoined && game.guestJoined;
  return {
    pin: game.pin,
    role,
    roundId: game.roundId,
    bothIn,
    // Only reveal once BOTH are present — this is what makes the reveal
    // land on both phones at the same time.
    youSeeName: bothIn ? otherSlot.name : null,
    youSeeImage: bothIn ? otherSlot.image : null
  };
}

// Recover a game this instance forgot (cold start). We can't recover who had
// joined, so assume both are in — the players are clearly mid-session if
// they're polling — and deal a fresh round so play simply continues.
async function recoverGame(pin) {
  const game = {
    pin,
    hostJoined: true,
    guestJoined: true,
    roundId: 1,
    round: await dealRound(),
    created: Date.now(),
    recovered: true
  };
  games[pin] = game;
  return game;
}

// --- handler --------------------------------------------------------------

export default async function handler(req, res) {
  cleanup();

  const action = req.query.action || (req.body && req.body.action);
  const pin = (req.query.pin || (req.body && req.body.pin) || "").toString().trim();
  const role = (req.query.role || "").toString();

  try {
    if (action === "create") {
      const newPin = genPin();
      const game = {
        pin: newPin,
        hostJoined: true,
        guestJoined: false,
        roundId: 1,
        round: await dealRound(),
        created: Date.now()
      };
      games[newPin] = game;
      return res.status(200).json({ ok: true, ...viewFor(game, "host") });
    }

    if (action === "join") {
      let game = games[pin];
      if (!game) return res.status(404).json({ ok: false, error: "No game with that PIN" });
      if (game.guestJoined) return res.status(409).json({ ok: false, error: "Game already full" });
      game.guestJoined = true;
      return res.status(200).json({ ok: true, ...viewFor(game, "guest") });
    }

    if (action === "state") {
      // Recover instead of erroring if this instance forgot the game.
      let game = games[pin] || (pin ? await recoverGame(pin) : null);
      if (!game) return res.status(404).json({ ok: false, error: "Game not found" });
      return res.status(200).json({ ok: true, ...viewFor(game, role) });
    }

    if (action === "next") {
      let game = games[pin] || (pin ? await recoverGame(pin) : null);
      if (!game) return res.status(404).json({ ok: false, error: "Game not found" });
      game.roundId += 1;
      game.round = await dealRound();
      return res.status(200).json({ ok: true, ...viewFor(game, role) });
    }

    if (action === "end") {
      if (games[pin]) delete games[pin];
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error — try again" });
  }
}
