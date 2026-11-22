import { lastFmAuthUrl, linkState } from "@/lib/scrobblers"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"

export const runtime = "nodejs"

const BASE = () => process.env.SERVICE_URL ?? "https://service.noctorium.xyz"

/** The dashboard's "Connect Last.fm": to Last.fm's own page, which comes back to the callback with a token. */
export async function GET(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const session = await currentSession(request)
  if (!session) return redirect("/login?next=/dashboard", request)
  if ((await params).site !== "lastfm") return redirect("/dashboard", request)
  const state = linkState(session.userId, Math.floor(Date.now() / 1000) + 15 * 60)
  return redirect(lastFmAuthUrl(`${BASE()}/api/scrobblers/lastfm/callback?state=${state}`), request)
}
