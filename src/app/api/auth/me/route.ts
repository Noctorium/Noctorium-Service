import { db } from "@/lib/db"
import { currentSession } from "@/lib/session"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/** Who the caller is. The player uses this to tell a still-good saved token from a stale one. */
export async function GET(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)

  const found = await db()`SELECT id, email, display_name, created_at FROM users WHERE id = ${session.userId} LIMIT 1`
  if (found.length === 0) return jsonError("Not signed in.", 401)

  const user = found[0] as { id: number; email: string; display_name: string; created_at: string }
  return Response.json({
    user: {
      id: Number(user.id),
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
  })
}
