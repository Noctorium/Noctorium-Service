import { db } from "@/lib/db"
import { currentSession } from "@/lib/session"
import { listeningStats, readLimit, readOffset, readRange, type Sql } from "@/lib/stats"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * What the listener has listened to: see listeningStats.
 *
 * `range` is 7d, 30d, 90d, 365d or all (the default, which is how the player has always asked); `tz` is the
 * caller's offset from UTC in minutes east, for days and hours on the listener's own clock; `limit` is how many
 * songs and artists the top lists hold, ten unless asked.
 */
export async function GET(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)

  const params = new URL(request.url).searchParams
  const stats = await listeningStats(db() as unknown as Sql, session.userId, {
    range: readRange(params.get("range")),
    offsetMinutes: readOffset(params.get("tz")),
    limit: readLimit(params.get("limit")),
  })
  return Response.json(stats)
}
