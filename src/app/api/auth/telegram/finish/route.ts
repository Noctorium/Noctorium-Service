import { finish, redirect } from "@/lib/signed-in"
import { collect, POLL_COOKIE, pollTokenFrom } from "@/lib/telegram-login"

export const runtime = "nodejs"

/** Once confirmed in Telegram: signs this browser in (or links Telegram to its account), once, and forgets the code. */
export async function GET(request: Request) {
  const token = pollTokenFrom(request)
  const result = token ? await collect(token, true) : { state: "unknown" as const }
  const response =
    result.state === "confirmed"
      ? await finish(request, result.profile, result.intent, result.next)
      : redirect("/login?error=telegram", request)
  response.headers.append("set-cookie", `${POLL_COOKIE}=; Path=/api/auth/telegram; Max-Age=0; HttpOnly; SameSite=Lax`)
  return response
}
