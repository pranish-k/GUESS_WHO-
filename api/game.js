// In-memory store. Resets when serverless function cold-starts but fine for casual 2-player use.
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

function pickTwo() {
  const a = Math.floor(Math.random() * POOL.length);
  let b = Math.floor(Math.random() * POOL.length);
  while (b === a) b = Math.floor(Math.random() * POOL.length);
  return [POOL[a], POOL[b]];
}

function genPin() {
  // Make sure PIN isn't already in use
  for (let i = 0; i < 20; i++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!games[pin]) return pin;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Clean up games older than 2 hours so memory doesn't grow
function cleanup() {
  const now = Date.now();
  for (const pin of Object.keys(games)) {
    if (now - games[pin].created > 2 * 60 * 60 * 1000) {
      delete games[pin];
    }
  }
}

// Fetch a freely-licensed lead image from Wikipedia for a given name.
// Falls back to a generated avatar when Wikipedia has no usable free image
// (common for copyrighted fictional characters like Pikachu or Iron Man).
function avatarFallback(name) {
  return "https://api.dicebear.com/9.x/avataaars/svg?seed=" +
    encodeURIComponent(name) + "&backgroundColor=ff6b35,ffd166,b9a994";
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

export default async function handler(req, res) {
  cleanup();

  const action = req.query.action || (req.body && req.body.action);

  if (action === "create") {
    const pin = genPin();
    const [hostName, guestName] = pickTwo();
    games[pin] = {
      pin,
      hostName,   // host's secret identity (guest will see this)
      guestName,  // guest's secret identity (host will see this)
      guestJoined: false,
      created: Date.now()
    };
    // The host sees the guest's identity (picture + name).
    const youSeeImage = await fetchImage(guestName);
    return res.status(200).json({ ok: true, pin, youSeeImage, youSeeName: guestName, role: "host" });
  }

  if (action === "join") {
    const pin = (req.query.pin || (req.body && req.body.pin) || "").toString().trim();
    if (!games[pin]) return res.status(404).json({ ok: false, error: "No game with that PIN" });
    if (games[pin].guestJoined) return res.status(409).json({ ok: false, error: "Game already full" });
    games[pin].guestJoined = true;
    // The guest sees the host's identity (picture + name).
    const youSeeImage = await fetchImage(games[pin].hostName);
    return res.status(200).json({ ok: true, pin, youSeeImage, youSeeName: games[pin].hostName, role: "guest" });
  }

  if (action === "status") {
    const pin = (req.query.pin || "").toString().trim();
    if (!games[pin]) return res.status(404).json({ ok: false, error: "Game not found" });
    return res.status(200).json({
      ok: true,
      guestJoined: games[pin].guestJoined
    });
  }

  if (action === "end") {
    const pin = (req.query.pin || (req.body && req.body.pin) || "").toString().trim();
    if (games[pin]) delete games[pin];
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: "Unknown action" });
}
