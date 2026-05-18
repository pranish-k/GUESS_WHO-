// In-memory store. Resets when serverless function cold-starts but fine for casual 2-player use.
const games = global.__games || (global.__games = {});

const POOL = [
  // Musicians
  "Taylor Swift", "Beyoncé", "Drake", "Rihanna", "Bad Bunny",
  "Lady Gaga", "Adele", "Bruno Mars", "Billie Eilish", "Ariana Grande",
  // Actors
  "Tom Hanks", "Keanu Reeves", "Zendaya", "Timothée Chalamet", "Pedro Pascal",
  "Margot Robbie", "Ryan Gosling", "Emma Stone", "Will Smith", "Dwayne Johnson",
  // Athletes
  "LeBron James", "Cristiano Ronaldo", "Lionel Messi", "Serena Williams", "Steph Curry",
  // Public figures
  "Barack Obama", "Oprah Winfrey", "Elon Musk", "Kim Kardashian", "MrBeast",
  // Disney / animation
  "Elsa", "Moana", "Mickey Mouse", "Shrek", "Buzz Lightyear",
  "SpongeBob", "Homer Simpson", "Pikachu", "Mario", "Bugs Bunny",
  // Superheroes
  "Spider-Man", "Iron Man", "Batman", "Wonder Woman", "Captain America",
  // Movies / books / TV
  "Harry Potter", "Hermione Granger", "Gandalf", "Yoda", "Darth Vader",
  "Walter White", "Eleven", "Sherlock Holmes", "Katniss Everdeen", "James Bond"
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

export default function handler(req, res) {
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
    return res.status(200).json({ ok: true, pin, youSee: guestName, role: "host" });
  }

  if (action === "join") {
    const pin = (req.query.pin || (req.body && req.body.pin) || "").toString().trim();
    if (!games[pin]) return res.status(404).json({ ok: false, error: "No game with that PIN" });
    if (games[pin].guestJoined) return res.status(409).json({ ok: false, error: "Game already full" });
    games[pin].guestJoined = true;
    return res.status(200).json({ ok: true, pin, youSee: games[pin].hostName, role: "guest" });
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
