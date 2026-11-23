import { db } from "@/lib/db"
import { fromNoctoriumServer } from "@/lib/rpc"
import { listeningStats, readLimit, readOffset, readRange, type Sql } from "@/lib/stats"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * One listener's stats and what they play now, for Noctorium's own servers only (the Telegram stats bot), which
 * prove themselves with RPC_SECRET and say which user. Same figures as /api/stats.
 */
export async function GET(request: Request) {
  if (!fromNoctoriumServer(request)) return jsonError("Not allowed.", 401)
  const params = new URL(request.url).searchParams
  const user = Number(params.get("user"))
  if (!Number.isInteger(user) || user <= 0) return jsonError("Say which user.", 400)

  const [stats, playing] = await Promise.all([
    listeningStats(db() as unknown as Sql, user, {
      range: readRange(params.get("range")),
      offsetMinutes: readOffset(params.get("tz")),
      limit: readLimit(params.get("limit")),
    }),
    db()`SELECT track FROM now_playing WHERE user_id = ${user} AND updated_at > now() - interval '20 minutes'`,
  ])
  return Response.json({ stats, nowPlaying: (playing[0] as { track?: unknown } | undefined)?.track ?? null })
}
