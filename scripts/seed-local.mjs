// Fills a local service (npm run dev:local) with accounts to make the apps against. Never point it at the live one.
//
// Two made-up listeners, both with test addresses that cannot reach anybody:
//   - LISTENER: a year and a bit of listening across every service, heavier in the evenings and at weekends,
//     with quiet days and a run of days in a row up to today, so every chart and the streak have something to show;
//   - EMPTY: an account with nothing played, for the screens that have to say so.
// Every artist and song here is invented. Running it again adds nothing: each listen has the same id every time,
// and the service throws a repeated one away.
const SERVICE = process.env.NOCTORIUM_SERVICE_URL ?? "http://localhost:3000"
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SERVICE)) {
  console.error(`seed-local: ${SERVICE} is not a local service; refusing to seed it.`)
  process.exit(1)
}

export const LISTENER = { email: "listener@noctorium.test", password: "local-listening-2026", displayName: "Robin Vale" }
export const EMPTY = { email: "quiet@noctorium.test", password: "local-listening-2026", displayName: "Sam Quiet" }

const ARTISTS = [
  ["Night Tram", "YOUTUBE_MUSIC", ["Harbour Lights", "Platform Nine", "Glass Weather", "Last Stop", "Sodium Sky"]],
  ["Paper Satellites", "SOUNDCLOUD", ["Paper Moonrise", "Orbit Song", "Low Signal", "Static Bloom"]],
  ["The Lamplighters", "YOUTUBE_MUSIC", ["Sodium Lamps", "Kerosene", "Long Wick"]],
  ["Signal Box", "SPOTIFY", ["Under the Viaduct", "Static on the Line", "Semaphore"]],
  ["Morning Ferry", "BANDCAMP", ["Slow Ferry", "Tidal Clock", "Foghorn Waltz", "Crossing"]],
  ["Halvard Moss", "SOUNDCLOUD", ["Copper Fields", "Thaw"]],
  ["Juniper Kaye", "SPOTIFY", ["Halfway to Morning", "Lantern Song", "Cold Brass"]],
  ["Saltmarsh", "BANDCAMP", ["Tape Hiss Lullaby", "Brine"]],
  ["Little Kestrel", "YOUTUBE_MUSIC", ["A Thousand Kites", "Updraft", "Hover"]],
  ["Odile Brandt", "VK", ["Low Tide Static", "Северный ветер", "Перрон"]],
  ["The Quiet Hours", "SOUNDCLOUD", ["Lanterns Over the Harbour", "Four in the Morning"]],
  ["Marrow & Fern", "VK", ["Paper Satellites", "Moss Garden"]],
]

/** A small seeded random, so the same history comes out every time. */
function random(seed) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

function history() {
  const next = random(2026)
  const plays = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (let back = 420; back >= 0; back--) {
    const date = new Date(today.getTime() - back * 86_400_000)
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
    // The last twelve days every day, for a streak; before that, about two days in three.
    if (back > 11 && next() < 0.33) continue
    const count = Math.floor(next() * (weekend ? 14 : 8)) + 1
    for (let i = 0; i < count; i++) {
      // Mostly evenings, some mornings, the odd song at three in the morning.
      const roll = next()
      const hour = roll < 0.55 ? 18 + Math.floor(next() * 6) : roll < 0.85 ? 7 + Math.floor(next() * 4) : Math.floor(next() * 24)
      // Favourites: the first artists are played far more than the last.
      const [artist, provider, songs] = ARTISTS[Math.floor(Math.pow(next(), 1.8) * ARTISTS.length)]
      const title = songs[Math.floor(Math.pow(next(), 1.4) * songs.length)]
      const at = new Date(date.getTime() + hour * 3_600_000 + Math.floor(next() * 3_600_000))
      if (at > new Date()) continue
      plays.push({
        clientId: `seed-${back}-${i}`,
        provider,
        trackId: `${provider.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9а-я]+/g, "-")}`,
        title,
        artist,
        msPlayed: Math.floor(60_000 + next() * 240_000),
        playedAt: at.toISOString(),
      })
    }
  }
  return plays
}

async function call(path, body, token) {
  const response = await fetch(`${SERVICE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function signIn(account) {
  const login = await call("/api/auth/login", { email: account.email, password: account.password })
  if (login.status === 200) return login.body.token
  const signup = await call("/api/auth/signup", account)
  if (signup.status !== 200 && signup.status !== 201) throw new Error(`signup ${account.email}: ${signup.status} ${JSON.stringify(signup.body)}`)
  return signup.body.token
}

await signIn(EMPTY)
const token = await signIn(LISTENER)
const plays = history()
let accepted = 0
for (let at = 0; at < plays.length; at += 200) {
  const sent = await call("/api/plays", { plays: plays.slice(at, at + 200) }, token)
  if (sent.status !== 200) throw new Error(`plays: ${sent.status} ${JSON.stringify(sent.body)}`)
  accepted += sent.body.accepted ?? 0
}
console.log(`seed-local: ${LISTENER.email} has ${plays.length} listens (${accepted} new); ${EMPTY.email} has none.`)
