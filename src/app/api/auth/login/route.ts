import { db } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/password"
import { issueToken, sessionCookie } from "@/lib/session"
import { cleanEmail, emailKey, jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * A hash of a password nobody has, used when the address is unknown.
 *
 * Without it, an unknown address would answer immediately while a known one would take as long as scrypt
 * does, and the difference would tell anyone asking which addresses have accounts. Verifying against this
 * costs the same as verifying against a real one.
 */
let absentHash: string | null = null
async function costOfAMiss(password: string): Promise<void> {
  absentHash ??= await hashPassword("no account holds this password")
  await verifyPassword(password, absentHash)
}

export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return jsonError("Send a JSON body.", 400)

  const email = cleanEmail(body.email)
  const password = typeof body.password === "string" ? body.password : null
  // The same words whichever half is wrong: naming which one confirms an address to a stranger.
  const refusal = "That email address and password do not match an account."
  if (!email || !password) return jsonError(refusal, 401)

  const found = await db()`
    SELECT id, email, display_name, password_hash FROM users WHERE email_key = ${emailKey(email)} LIMIT 1
  `
  if (found.length === 0) {
    await costOfAMiss(password)
    return jsonError(refusal, 401)
  }

  const user = found[0] as { id: number; email: string; display_name: string; password_hash: string }
  if (!(await verifyPassword(password, user.password_hash))) return jsonError(refusal, 401)

  const token = await issueToken({ userId: Number(user.id), email: user.email })
  const cookie = sessionCookie(token)
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path}`, `Max-Age=${cookie.maxAge}`, "HttpOnly", "SameSite=Lax"]
  if (cookie.secure) parts.push("Secure")

  return Response.json(
    { token, user: { id: Number(user.id), email: user.email, displayName: user.display_name } },
    { headers: { "Set-Cookie": parts.join("; ") } },
  )
}
