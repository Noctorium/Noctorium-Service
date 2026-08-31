import { db } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { issueToken, sessionCookie } from "@/lib/session"
import { checkPassword, cleanDisplayName, cleanEmail, emailKey, jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

/** Creates an account and signs it in, for the website and the desktop player alike. */
export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return jsonError("Send a JSON body.", 400)

  const email = cleanEmail(body.email)
  if (!email) return jsonError("Enter a valid email address.", 400)

  const password = checkPassword(body.password)
  if ("error" in password) return jsonError(password.error, 400)

  const displayName = cleanDisplayName(body.displayName, email.split("@")[0])
  const passwordHash = await hashPassword(password.password)
  const key = emailKey(email)

  // The unique index decides, not a prior SELECT: two simultaneous signups would both pass a check and
  // only one can win the insert. `ON CONFLICT DO NOTHING` returns no row, which is how a taken address
  // is detected without a race.
  const created = await db()`
    INSERT INTO users (email, email_key, display_name, password_hash)
    VALUES (${email}, ${key}, ${displayName}, ${passwordHash})
    ON CONFLICT (email_key) DO NOTHING
    RETURNING id, email, display_name
  `
  if (created.length === 0) return jsonError("That email address already has an account.", 409)

  const user = created[0] as { id: number; email: string; display_name: string }
  const token = await issueToken({ userId: Number(user.id), email: user.email })

  return Response.json(
    { token, user: { id: Number(user.id), email: user.email, displayName: user.display_name } },
    { status: 201, headers: { "Set-Cookie": serialise(token) } },
  )
}

function serialise(token: string): string {
  const cookie = sessionCookie(token)
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path}`, `Max-Age=${cookie.maxAge}`, "HttpOnly", "SameSite=Lax"]
  if (cookie.secure) parts.push("Secure")
  return parts.join("; ")
}
