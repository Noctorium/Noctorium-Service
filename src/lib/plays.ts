/**
 * Reading and storing listens.
 *
 * Kept apart from the route so both halves can be exercised directly. The insert in particular is worth
 * pinning down: it binds a batch of rows through generated placeholders, and an off-by-one there does not
 * fail loudly — it shifts every value one column along and quietly writes a title into an artist.
 */

/** A player offline for a while has a backlog; a batch keeps that to one request without being unbounded. */
export const MAX_BATCH = 200

/** Twenty-four hours. Anything longer is a stuck timer, not a listen, and would distort the totals. */
export const MAX_MS_PLAYED = 24 * 60 * 60 * 1000

/** The columns a play is written to, in the order the insert binds them. */
export const PLAY_COLUMNS = ["user_id", "client_id", "provider", "track_id", "title", "artist", "ms_played", "played_at"] as const

export type Play = {
  clientId: string
  provider: string
  trackId: string
  title: string
  artist: string
  msPlayed: number
  playedAt: string
}

function text(field: unknown, max: number): string | null {
  if (typeof field !== "string") return null
  const trimmed = field.trim()
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed
}

/** One listen out of whatever the client sent, or null if it is not usable. */
export function readPlay(value: unknown, now: number = Date.now()): Play | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>

  const clientId = text(row.clientId, 100)
  const provider = text(row.provider, 40)
  const trackId = text(row.trackId, 200)
  const title = text(row.title, 300)
  if (!clientId || !provider || !trackId || !title) return null

  // A track with no credited artist is still a listen; it is only the name that is missing.
  const artist = typeof row.artist === "string" && row.artist.trim().length > 0 ? row.artist.trim().slice(0, 300) : "Unknown artist"

  const msPlayed = Number(row.msPlayed)
  if (!Number.isFinite(msPlayed) || msPlayed < 0 || msPlayed > MAX_MS_PLAYED) return null

  const playedAtMs = Date.parse(String(row.playedAt))
  if (!Number.isFinite(playedAtMs)) return null
  // A clock running fast would otherwise park listens in the future, outside every range a chart asks for.
  if (playedAtMs > now + 60 * 60 * 1000) return null

  return {
    clientId,
    provider,
    trackId,
    title,
    artist,
    msPlayed: Math.round(msPlayed),
    playedAt: new Date(playedAtMs).toISOString(),
  }
}

/**
 * The batch insert, as statement text plus the values bound to it.
 *
 * Every value is a bound parameter; nothing from the request is ever part of the statement text. The
 * placeholder count is derived from [PLAY_COLUMNS] rather than written out, so the two cannot drift apart.
 */
export function buildPlaysInsert(plays: Play[], userId: number): { text: string; values: unknown[] } {
  const width = PLAY_COLUMNS.length
  const values = plays.flatMap((play) => [
    userId,
    play.clientId,
    play.provider,
    play.trackId,
    play.title,
    play.artist,
    play.msPlayed,
    play.playedAt,
  ])
  const rows = plays
    .map((_, index) => {
      const base = index * width
      const placeholders = Array.from({ length: width }, (_unused, column) => `$${base + column + 1}`)
      return `(${placeholders.join(", ")})`
    })
    .join(", ")

  return {
    text: `INSERT INTO plays (${PLAY_COLUMNS.join(", ")})
     VALUES ${rows}
     ON CONFLICT (user_id, client_id) DO NOTHING
     RETURNING id`,
    values,
  }
}
