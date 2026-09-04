import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

/**
 * Who is signed in, for both the website and the desktop player.
 *
 * The two need different carriers for the same token. A browser gets an httpOnly cookie, which script on
 * the page cannot read and so cannot leak; the player is not a browser and has nowhere to put a cookie, so
 * it gets the token in the reply and sends it back as a bearer header. Both are the same signed token and
 * are verified by the same code, so there is only one way in to get wrong.
 */
export const SESSION_COOKIE = "spiceity_session"

/** Long enough that the player is not signing in every week, short enough that a leaked token expires. */
const LIFETIME_SECONDS = 60 * 60 * 24 * 90

export type Session = { userId: number; email: string }

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET
  // Refusing to start without one is deliberate. A default would silently make every token forgeable.
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET is missing or too short; set it to at least 32 random characters.")
  }
  return new TextEncoder().encode(value)
}

export async function issueToken(session: Session): Promise<string> {
  return new SignJWT({ email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(session.userId))
    .setIssuedAt()
    .setExpirationTime(`${LIFETIME_SECONDS}s`)
    .sign(secret())
}

/** The session a token stands for, or null if it is missing, expired, altered or signed by someone else. */
export async function readToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] })
    const userId = Number(payload.sub)
    const email = typeof payload.email === "string" ? payload.email : null
    if (!Number.isInteger(userId) || userId <= 0 || !email) return null
    return { userId, email }
  } catch {
    return null
  }
}

/**
 * The session behind a request, from either carrier.
 *
 * The bearer header is preferred so that a player's token is never confused with a cookie the browser
 * attached on its own.
 */
export async function currentSession(request: Request): Promise<Session | null> {
  const header = request.headers.get("authorization")
  if (header?.toLowerCase().startsWith("bearer ")) {
    const fromHeader = await readToken(header.slice(7).trim())
    if (fromHeader) return fromHeader
  }
  const jar = await cookies()
  return readToken(jar.get(SESSION_COOKIE)?.value)
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  }
}

export function clearedSessionCookie() {
  return { ...sessionCookie(""), value: "", maxAge: 0 }
}
