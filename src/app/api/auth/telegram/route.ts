import { finish, redirect } from "@/lib/signed-in"
import { telegramBot, telegramProfile } from "@/lib/telegram-login"

export const runtime = "nodejs"

/** Telegram's Login Widget lands here with who signed in, signed with the bot's token. */
export async function GET(request: Request) {
  const bot = telegramBot()
  if (!bot) return new Response("Telegram sign-in is not set up.", { status: 404 })
  const url = new URL(request.url)
  const profile = telegramProfile(url.searchParams, bot.token)
  if (!profile) return redirect("/login?error=telegram", request)
  return finish(request, profile, url.searchParams.get("intent") === "link" ? "link" : "signin", url.searchParams.get("next") ?? "/dashboard")
}
