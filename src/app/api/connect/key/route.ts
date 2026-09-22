import { connectKeyFor } from "@/lib/connect-key"
import { currentSession } from "@/lib/session"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * The key a listener's devices use to find and trust each other on a local network.
 *
 * Handed out only to somebody already holding a valid session token, which is the whole of the check: if
 * you can sign in as this account you are entitled to control this account's players. The key is the same
 * for every device on the account and is derived, not stored, so this endpoint reads nothing and writes
 * nothing.
 *
 * Devices are expected to ask once and keep the answer somewhere safe. Noctorium Connect works with no
 * internet at all once they have it, which is the point: two devices on the same wifi with the router's
 * uplink down should still see each other.
 */
export async function GET(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)

  return Response.json({ key: connectKeyFor(session.userId) }, {
    // Never a shared cache. This is a secret, and the only correct place for it is the device that asked.
    headers: { "Cache-Control": "no-store" },
  })
}
