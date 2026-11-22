import { link, listenBrainzUser, SITES, unlink, type Site } from "@/lib/scrobblers"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"
import { jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

const siteOf = async (params: Promise<{ site: string }>): Promise<Site | null> => {
  const { site } = await params
  return SITES.includes(site as Site) ? (site as Site) : null
}

/**
 * An app saving to the account a connection it made itself, so every other app gets it too:
 * `{"username", "sessionKey"}` for Last.fm, `{"token"}` for ListenBrainz, whose token is checked with ListenBrainz first.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)
  const site = await siteOf(params)
  if (!site) return jsonError("Unknown site.", 404)
  const body = await readJson(request)
  if (!body) return jsonError("Send a JSON body.", 400)
  const text = (x: unknown) => (typeof x === "string" && x.trim() && x.length < 300 ? x.trim() : null)
  if (site === "listenbrainz") {
    const token = text(body.token)
    const username = token ? await listenBrainzUser(token) : null
    if (!token || !username) return jsonError("ListenBrainz does not know that token.", 400)
    await link(session.userId, site, username, token)
  } else {
    const username = text(body.username)
    const key = text(body.sessionKey)
    if (!username || !key) return jsonError("Send the Last.fm username and session key.", 400)
    await link(session.userId, site, username, key)
  }
  return new Response(null, { status: 204 })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)
  const site = await siteOf(params)
  if (!site) return jsonError("Unknown site.", 404)
  await unlink(session.userId, site)
  return new Response(null, { status: 204 })
}

/** The dashboard's forms: a ListenBrainz token to link, or `unlink`. */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const session = await currentSession(request)
  if (!session) return redirect("/login", request)
  const site = await siteOf(params)
  if (!site) return redirect("/dashboard", request)
  const form = await request.formData()
  if (form.get("unlink")) {
    await unlink(session.userId, site)
    return redirect(`/dashboard?scrobbler=unlinked`, request)
  }
  const token = String(form.get("token") ?? "").trim()
  const username = site === "listenbrainz" && token ? await listenBrainzUser(token) : null
  if (!username) return redirect("/dashboard?scrobbler=refused", request)
  await link(session.userId, site, username, token)
  return redirect("/dashboard?scrobbler=linked", request)
}
