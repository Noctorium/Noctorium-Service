import { db } from "@/lib/db"
import { pollDevice } from "@/lib/device"
import { issueToken } from "@/lib/session"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * The waiting app asks, every few seconds: 202 while nobody has allowed it yet; once they have, its account token
 * and user, exactly as a sign-in with a password gives them, and only this once.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!token) return jsonError("No poll token.", 400)
  const poll = await pollDevice(token)
  if (poll.state === "pending") return Response.json({ status: "pending" }, { status: 202 })
  if (poll.state === "expired") return jsonError("This code has expired. Start again for a new one.", 410)
  if (poll.state === "unknown") return jsonError("Unknown sign-in.", 404)
  const [user] = (await db()`SELECT id, email, display_name FROM users WHERE id = ${poll.userId}`) as {
    id: number
    email: string | null
    display_name: string
  }[]
  if (!user) return jsonError("Unknown sign-in.", 404)
  const email = user.email ?? ""
  return Response.json({
    token: await issueToken({ userId: Number(user.id), email }),
    user: { id: Number(user.id), email, displayName: user.display_name },
  })
}
