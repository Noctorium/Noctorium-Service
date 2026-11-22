import { linked } from "@/lib/scrobblers"
import { currentSession } from "@/lib/session"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * What Last.fm and ListenBrainz the account has linked, with the session key and token: for an app signing in, which
 * then scrobbles there itself as if connected by hand. Sent only to the account's own token, never cached.
 */
export async function GET(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)
  const links = await linked(session.userId)
  const of = (site: "lastfm" | "listenbrainz") => links.find((l) => l.site === site)
  const lastfm = of("lastfm")
  const listenbrainz = of("listenbrainz")
  return Response.json(
    {
      lastfm: lastfm ? { username: lastfm.username, sessionKey: lastfm.secret } : null,
      listenbrainz: listenbrainz ? { username: listenbrainz.username, token: listenbrainz.secret } : null,
    },
    { headers: { "cache-control": "no-store" } },
  )
}
