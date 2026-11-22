import { redirect } from "@/lib/signed-in"
import { beginTelegramLogin, ensureWebhook, POLL_COOKIE, TELEGRAM_SECONDS, telegramBot } from "@/lib/telegram-login"

export const runtime = "nodejs"

const BASE = () => process.env.SERVICE_URL ?? "https://service.noctorium.xyz"

/**
 * "Continue with Telegram": makes a code, keeps its poll secret in a cookie only this browser has, and goes to the page
 * that opens the bot in Telegram and waits.
 */
export async function GET(request: Request) {
  const bot = telegramBot()
  if (!bot) return new Response("Telegram sign-in is not set up.", { status: 404 })
  const url = new URL(request.url)
  try {
    await ensureWebhook(bot.token, `${BASE()}/api/telegram/webhook`)
  } catch {
    return redirect("/login?error=telegram", request)
  }
  const intent = url.searchParams.get("intent") === "link" ? "link" : "signin"
  const { code, pollToken } = await beginTelegramLogin(intent, url.searchParams.get("next") ?? "/dashboard")
  const response = redirect(`/telegram?code=${code}`, request)
  const secure = url.protocol === "https:" ? "; Secure" : ""
  response.headers.append(
    "set-cookie",
    `${POLL_COOKIE}=${pollToken}; Path=/api/auth/telegram; Max-Age=${TELEGRAM_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  )
  return response
}
