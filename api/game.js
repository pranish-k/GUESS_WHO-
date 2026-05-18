// Game state is stored in Upstash Redis (REST API) so it survives serverless
// cold starts and multi-instance routing — required for replaying many rounds
// on one PIN. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the
// Vercel project env. Without them the game cannot keep shared state.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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

// --- Redis REST helpers ---------------------------------------------------

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error("Redis error " + r.status);
  const data = await r.json();
  return data.result;
}

const KEY = (pin) => "gw:game:" + pin;
const GAME_TTL = 60 * 60 * 6; // 6h — plenty for a long replay session

async function loadGame(pin) {
  const raw = await redis(["GET", KEY(pin)]);
  return raw ? JSON.parse(raw) : null;
}

async function saveGame(game) {
  await redis(["SET", KEY(game.pin), JSON.stringify(game), "EX", GAME_TTL]);
}

// --- game helpers ---------------------------------------------------------

function pickTwo() {
  const a = Math.floor(Math.random() * POOL.length);
  let b = Math.floor(Math.random() * POOL.length);
  while (b === a) b = Math.floor(Math.random() * POOL.length);
  return [POOL[a], POOL[b]];
}

async function genPin() {
  for (let i = 0; i < 25; i++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!(await redis(["EXISTS", KEY(pin)]))) return pin;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Fetch a freely-licensed lead image from Wikipedia. The pool is real people,
// so this resolves to a real photo; the avatar is a last-resort safety net.
function avatarFallback(name) {
  return "https://api.dicebear.com/9.x/initials/svg?seed=" +
    encodeURIComponent(name) + "&backgroundColor=ff6b35,ffd166";
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
    // slot "host" is asked about by "guest", and vice versa
    host: { name: nameA, image: imgA },
    guest: { name: nameB, image: imgB }
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
    // Only reveal the identity once BOTH players are present — this is what
    // makes the reveal happen at the same time on both phones.
    youSeeName: bothIn ? otherSlot.name : null,
    youSeeImage: bothIn ? otherSlot.image : null
  };
}

// --- handler --------------------------------------------------------------

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "Server not configured: missing Upstash Redis env vars"
    });
  }

  const action = req.query.action || (req.body && req.body.action);
  const pin = (req.query.pin || (req.body && req.body.pin) || "").toString().trim();

  try {
    if (action === "create") {
      const newPin = await genPin();
      const game = {
        pin: newPin,
        hostJoined: true,
        guestJoined: false,
        roundId: 1,
        round: await dealRound(),
        created: Date.now()
      };
      await saveGame(game);
      return res.status(200).json({ ok: true, ...viewFor(game, "host") });
    }

    if (action === "join") {
      const game = await loadGame(pin);
      if (!game) return res.status(404).json({ ok: false, error: "No game with that PIN" });
      if (game.guestJoined) return res.status(409).json({ ok: false, error: "Game already full" });
      game.guestJoined = true;
      await saveGame(game);
      return res.status(200).json({ ok: true, ...viewFor(game, "guest") });
    }

    if (action === "state") {
      const role = (req.query.role || "").toString();
      const game = await loadGame(pin);
      if (!game) return res.status(404).json({ ok: false, error: "Game not found" });
      return res.status(200).json({ ok: true, ...viewFor(game, role) });
    }

    // Either player can start the next round on the same PIN — no re-entering.
    if (action === "next") {
      const role = (req.query.role || "").toString();
      const game = await loadGame(pin);
      if (!game) return res.status(404).json({ ok: false, error: "Game not found" });
      game.roundId += 1;
      game.round = await dealRound();
      await saveGame(game);
      return res.status(200).json({ ok: true, ...viewFor(game, role) });
    }

    if (action === "end") {
      await redis(["DEL", KEY(pin)]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error — try again" });
  }
}
