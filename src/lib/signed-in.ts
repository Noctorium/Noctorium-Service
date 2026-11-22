import { link, signInWith, type ProviderProfile } from "./identity"
import { safeNext, type Intent } from "./oauth"
import { currentSession, issueToken, sessionCookie } from "./session"

/** A redirect that also sets (or keeps) the session cookie. */
function redirect(to: string, request: Request, cookie?: string): Response {
  const headers = new Headers({ location: new URL(to, request.url).toString() })
  if (cookie) headers.append("set-cookie", cookie)
  return new Response(null, { status: 303, headers })
}

function cookieFor(token: string): string {
  const c = sessionCookie(token)
  return [`${c.name}=${c.value}`, `Path=${c.path}`, `Max-Age=${c.maxAge}`, "HttpOnly", "SameSite=Lax", ...(c.secure ? ["Secure"] : [])].join("; ")
}

/**
 * What happens once Discord or Telegram has said who somebody is: signing them in (to the account it is
 * linked to, or a new one) and going on to `next`; or, when they were linking it from the dashboard, adding it to the
 * account they are signed in to.
 */
export async function finish(request: Request, profile: ProviderProfile, intent: Intent, next: string): Promise<Response> {
  if (intent === "link") {
    const session = await currentSession(request)
    if (!session) return redirect("/login", request)
    const result = await link(session.userId, profile)
    return redirect(`/dashboard?${result === "taken" ? "taken" : "linked"}=${profile.provider}`, request)
  }
  const user = await signInWith(profile)
  const token = await issueToken({ userId: user.id, email: user.email })
  return redirect(safeNext(next), request, cookieFor(token))
}

export { redirect }
