import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"
import { db } from "./db.ts"

/**
 * Last.fm and ListenBrainz, linked to a Noctorium account once and then used everywhere: the apps that scrobble
 * themselves take the link when they sign in, and the service scrobbles for those that do not (Lite, iOS, the web
 * player). The session key and the token are kept sealed with AES-256-GCM, under a key derived from AUTH_SECRET.
 *
 * Last.fm is asked through Noctorium's own Last.fm application, the one every app uses, so a session made here works in
 * all of them and one made in an app works here. Its key and secret are already in every app's public source.
 */

export type Site = "lastfm" | "listenbrainz"
export const SITES: Site[] = ["lastfm", "listenbrainz"]
export const SITE_NAMES: Record<Site, string> = { lastfm: "Last.fm", listenbrainz: "ListenBrainz" }

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/"
const LISTENBRAINZ_API = "https://api.listenbrainz.org"

export const lastFmApp = () => ({
  key: process.env.LASTFM_API_KEY ?? "394c9c370aa8da3149db90cd4d9261a0",
  secret: process.env.LASTFM_SHARED_SECRET ?? "42b92ec5de8336e67701467d51b03e49",
})

// --- Sealing ---

const sealKey = () => createHmac("sha256", process.env.AUTH_SECRET ?? "").update("noctorium-scrobblers").digest()

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv)
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

export function unseal(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url")
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

// --- What is linked ---

export type Linked = { site: Site; username: string; secret: string }

export async function link(userId: number, site: Site, username: string, secret: string): Promise<void> {
  await db()`
    INSERT INTO scrobblers (user_id, site, username, secret) VALUES (${userId}, ${site}, ${username}, ${seal(secret)})
    ON CONFLICT (user_id, site) DO UPDATE SET username = EXCLUDED.username, secret = EXCLUDED.secret, linked_at = now()
  `
}

export async function unlink(userId: number, site: Site): Promise<void> {
  await db()`DELETE FROM scrobblers WHERE user_id = ${userId} AND site = ${site}`
}

/** Every link of [userId]'s, opened; one whose seal no longer opens (a changed AUTH_SECRET) is left out. */
export async function linked(userId: number): Promise<Linked[]> {
  const rows = (await db()`SELECT site, username, secret FROM scrobblers WHERE user_id = ${userId}`) as {
    site: Site
    username: string
    secret: string
  }[]
  return rows.flatMap((row) => {
    const secret = unseal(row.secret)
    return secret ? [{ site: row.site, username: row.username, secret }] : []
  })
}

// --- Last.fm ---

/** Last.fm's signature: every parameter but `format`, sorted by name, `name` then `value`, the secret last, MD5. */
export function lastFmSignature(parameters: Record<string, string>, secret: string): string {
  const source = Object.keys(parameters).sort().map((k) => k + parameters[k]).join("") + secret
  return createHash("md5").update(source, "utf8").digest("hex")
}

async function lastFm(parameters: Record<string, string>): Promise<Record<string, unknown>> {
  const app = lastFmApp()
  const signed = { ...parameters, api_key: app.key }
  const body = new URLSearchParams({ ...signed, api_sig: lastFmSignature(signed, app.secret), format: "json" })
  const reply = await fetch(LASTFM_API, { method: "POST", body, headers: { "user-agent": "Noctorium" } })
  const answer = (await reply.json().catch(() => ({}))) as Record<string, unknown>
  if (answer.error) throw new Error(`Last.fm error ${answer.error}: ${answer.message ?? "refused"}`)
  if (!reply.ok) throw new Error(`Last.fm answered ${reply.status}`)
  return answer
}

/** Who asked, until when, signed: so Last.fm's answer can only link the account that asked for it. */
export function linkState(userId: number, expires: number): string {
  const body = `${userId}.${expires}`
  return `${body}.${createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`lastfm-link:${body}`).digest("base64url")}`
}

/** Where the dashboard sends somebody to allow Noctorium on Last.fm; Last.fm comes back to [callback] with a token. */
export const lastFmAuthUrl = (callback: string) =>
  `https://www.last.fm/api/auth/?api_key=${lastFmApp().key}&cb=${encodeURIComponent(callback)}`

export async function lastFmSession(token: string): Promise<{ username: string; key: string }> {
  const answer = (await lastFm({ method: "auth.getSession", token })) as { session?: { name?: string; key?: string } }
  if (!answer.session?.name || !answer.session.key) throw new Error("Last.fm gave no session")
  return { username: answer.session.name, key: answer.session.key }
}

/** A song, as both sites are told it. */
export type Song = { title: string; artist: string; album?: string; durationMs?: number; url?: string }

const songParameters = (song: Song) => ({
  artist: song.artist,
  track: song.title,
  ...(song.album ? { album: song.album } : {}),
  ...(song.durationMs && song.durationMs > 0 ? { duration: String(Math.round(song.durationMs / 1000)) } : {}),
})

// --- ListenBrainz ---

export async function listenBrainzUser(token: string): Promise<string | null> {
  const reply = await fetch(`${LISTENBRAINZ_API}/1/validate-token`, { headers: { authorization: `Token ${token}` } })
  const answer = (await reply.json().catch(() => ({}))) as { valid?: boolean; user_name?: string }
  return answer.valid && answer.user_name ? answer.user_name : null
}

async function listenBrainz(token: string, type: "playing_now" | "single", song: Song, listenedAt?: number) {
  const listen = {
    ...(listenedAt ? { listened_at: listenedAt } : {}),
    track_metadata: {
      artist_name: song.artist,
      track_name: song.title,
      ...(song.album ? { release_name: song.album } : {}),
      additional_info: {
        media_player: "Noctorium",
        submission_client: "Noctorium",
        ...(song.url ? { origin_url: song.url } : {}),
        ...(song.durationMs ? { duration_ms: Math.round(song.durationMs) } : {}),
      },
    },
  }
  const reply = await fetch(`${LISTENBRAINZ_API}/1/submit-listens`, {
    method: "POST",
    headers: { authorization: `Token ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ listen_type: type, payload: [listen] }),
  })
  if (!reply.ok) throw new Error(`ListenBrainz answered ${reply.status}`)
}

// --- Scrobbling for the apps that do not ---

/** Last.fm's rule, which ListenBrainz follows: songs over half a minute, once half or four minutes are heard. */
export const scrobbleCounts = (heardMs: number, durationMs: number) =>
  durationMs > 30_000 && heardMs >= Math.min(durationMs / 2, 240_000)

/**
 * Tells every linked site what [userId] is playing ([startedAt] null), or that a listen is done. [skip] are the sites
 * the asking app already told itself, such as the web player's own ListenBrainz. A failing site does not stop another.
 */
export async function relay(userId: number, song: Song, startedAt: number | null, skip: Site[] = []): Promise<void> {
  const links = (await linked(userId)).filter((l) => !skip.includes(l.site))
  await Promise.allSettled(
    links.map((l) =>
      l.site === "lastfm"
        ? lastFm({
            method: startedAt ? "track.scrobble" : "track.updateNowPlaying",
            sk: l.secret,
            ...songParameters(song),
            ...(startedAt ? { timestamp: String(startedAt) } : {}),
          })
        : listenBrainz(l.secret, startedAt ? "single" : "playing_now", song, startedAt ?? undefined),
    ),
  )
}

/** A song as a request sends it, or null when it is not one. */
export function readSong(value: unknown): Song | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined)
  const title = text(v.title, 300)
  const artist = text(v.artist, 300)
  if (!title || !artist) return null
  const durationMs = typeof v.durationMs === "number" && v.durationMs > 0 ? Math.min(v.durationMs, 6 * 3_600_000) : undefined
  return { title, artist, album: text(v.album, 300), durationMs, url: text(v.url, 2000) }
}
