import { collect, pollTokenFrom } from "@/lib/telegram-login"
import { jsonError } from "@/lib/validate"

export const runtime = "nodejs"

/** The waiting page asks every few seconds whether the listener has confirmed in Telegram yet. */
export async function GET(request: Request) {
  const token = pollTokenFrom(request)
  if (!token) return jsonError("No Telegram sign-in is waiting here.", 404)
  const result = await collect(token, false)
  if (result.state === "pending") return Response.json({ status: "pending" }, { status: 202 })
  if (result.state === "confirmed") return Response.json({ status: "confirmed" })
  if (result.state === "expired") return jsonError("This sign-in has expired. Start again.", 410)
  return jsonError("No Telegram sign-in is waiting here.", 404)
}
