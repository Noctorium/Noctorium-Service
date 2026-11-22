import { after } from "next/server"
import { readSong, relay, scrobbleCounts, SITES, type Site } from "@/lib/scrobblers"
import { currentSession } from "@/lib/session"
import { jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * A listen from an app that does not scrobble itself -- Noctorium Lite, the iPhone, the web player -- sent on to the
 * Last.fm and ListenBrainz linked to the account: `{"track", "startedAt" (seconds), "heardMs", "skip"?: ["listenbrainz"]}`.
 * Checked against Last.fm's own rule here too, so a listen that is not one is never scrobbled. Answers 204 at once.
 */
export async function POST(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)
  const body = await readJson(request)
  const song = readSong(body?.track)
  const startedAt = Number(body?.startedAt)
  const heardMs = Number(body?.heardMs)
  const now = Date.now() / 1000
  // Last.fm takes scrobbles up to two weeks old, and none from the future.
  if (!song || !Number.isFinite(startedAt) || startedAt > now + 60 || startedAt < now - 14 * 86_400) {
    return jsonError("Send the track, when it started and how much was heard.", 400)
  }
  if (!scrobbleCounts(heardMs, song.durationMs ?? 0)) return new Response(null, { status: 204 })
  const skip = (Array.isArray(body?.skip) ? body.skip : []).filter((s): s is Site => SITES.includes(s as Site))
  after(() => relay(session.userId, song, Math.floor(startedAt), skip))
  return new Response(null, { status: 204 })
}
