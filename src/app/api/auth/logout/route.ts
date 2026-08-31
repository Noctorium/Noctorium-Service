import { clearedSessionCookie } from "@/lib/session"

export const runtime = "nodejs"

/** Clears the browser's cookie. A player's bearer token is discarded on its own side. */
export async function POST() {
  const cookie = clearedSessionCookie()
  const parts = [`${cookie.name}=`, `Path=${cookie.path}`, "Max-Age=0", "HttpOnly", "SameSite=Lax"]
  if (cookie.secure) parts.push("Secure")
  return Response.json({ ok: true }, { headers: { "Set-Cookie": parts.join("; ") } })
}
