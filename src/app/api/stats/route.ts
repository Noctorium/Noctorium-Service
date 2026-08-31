import { db } from "@/lib/db"
import { currentSession } from "@/lib/session"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * What the listener has listened to.
 *
 * Counted from the play rows every time rather than kept as running totals. Totals that are maintained
 * drift the first time a write is lost or replayed and then stay wrong; a count is only ever as wrong as
 * the rows themselves.
 */
export async function GET(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)

  const sql = db()
  const [totals] = (await sql`
    SELECT
      COUNT(*)::bigint                                        AS streams,
      COUNT(DISTINCT (provider, track_id))::bigint            AS unique_tracks,
      COALESCE(SUM(ms_played), 0)::bigint                     AS ms_played,
      COUNT(DISTINCT artist)::bigint                          AS artists,
      MIN(played_at)                                          AS first_play,
      MAX(played_at)                                          AS last_play
    FROM plays WHERE user_id = ${session.userId}
  `) as {
    streams: string
    unique_tracks: string
    ms_played: string
    artists: string
    first_play: string | null
    last_play: string | null
  }[]

  const byProvider = (await sql`
    SELECT provider, COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${session.userId}
    GROUP BY provider ORDER BY streams DESC
  `) as { provider: string; streams: string; ms_played: string }[]

  const topTracks = (await sql`
    SELECT title, artist, provider, COUNT(*)::bigint AS streams
    FROM plays WHERE user_id = ${session.userId}
    GROUP BY title, artist, provider ORDER BY streams DESC, title ASC LIMIT 10
  `) as { title: string; artist: string; provider: string; streams: string }[]

  const msPlayed = Number(totals.ms_played)
  return Response.json({
    streams: Number(totals.streams),
    uniqueTracks: Number(totals.unique_tracks),
    artists: Number(totals.artists),
    msPlayed,
    hours: Math.round((msPlayed / 3_600_000) * 10) / 10,
    firstPlay: totals.first_play,
    lastPlay: totals.last_play,
    byProvider: byProvider.map((row) => ({
      provider: row.provider,
      streams: Number(row.streams),
      hours: Math.round((Number(row.ms_played) / 3_600_000) * 10) / 10,
    })),
    topTracks: topTracks.map((row) => ({
      title: row.title,
      artist: row.artist,
      provider: row.provider,
      streams: Number(row.streams),
    })),
  })
}
