import { timingSafeEqual } from "node:crypto"
import { lastFmSession, link, linkState } from "@/lib/scrobblers"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"

export const runtime = "nodejs"

/** Back from Last.fm with a token: made into a session and linked to the account that asked, and no other. */
export async function GET(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const session = await currentSession(request)
  if (!session) return redirect("/login?next=/dashboard", request)
  const url = new URL(request.url)
  const state = url.searchParams.get("state") ?? ""
  const token = url.searchParams.get("token")
  const [, expires] = state.split(".")
  const expected = Buffer.from(linkState(session.userId, Number(expires)))
  const given = Buffer.from(state)
  const valid = given.length === expected.length && timingSafeEqual(given, expected) && Number(expires) > Date.now() / 1000
  if ((await params).site !== "lastfm" || !valid || !token) return redirect("/dashboard?scrobbler=refused", request)
  try {
    const lastfm = await lastFmSession(token)
    await link(session.userId, "lastfm", lastfm.username, lastfm.key)
    return redirect("/dashboard?scrobbler=linked", request)
  } catch {
    return redirect("/dashboard?scrobbler=refused", request)
  }
}
