import { after } from "next/server"
import { db } from "@/lib/db"
import { readNowPlaying, tell, type RpcService } from "@/lib/rpc"
import { currentSession } from "@/lib/session"
import { jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * What a signed-in player is playing now, or `{"track": null}` when it stops or pauses.
 *
 * Passed on to the RPC servers of whatever the listener has linked -- Discord, Telegram -- after the reply, so a
 * slow Discord never holds up the player. Answers 204 whether or not anything is linked.
 */
export async function POST(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)
  const body = await readJson(request)
  if (!body) return jsonError("Send a JSON body.", 400)
  const track = readNowPlaying(body.track)

  const [linked] = (await db()`
    SELECT EXISTS (SELECT 1 FROM discord_links WHERE user_id = ${session.userId}) AS discord,
           EXISTS (SELECT 1 FROM telegram_links WHERE user_id = ${session.userId}) AS telegram
  `) as { discord: boolean; telegram: boolean }[]
  const services = (["discord", "telegram"] as RpcService[]).filter((s) => linked?.[s])
  if (services.length) after(() => Promise.all(services.map((s) => tell(s, session.userId, track))))
  return new Response(null, { status: 204 })
}
