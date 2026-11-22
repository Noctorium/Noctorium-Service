import { redirect } from "next/navigation"
import { telegramBot } from "@/lib/telegram-login"
import Waiter from "./waiter"

export const dynamic = "force-dynamic"

/** Where "Continue with Telegram" goes: the bot's link, and a wait for the listener to confirm in Telegram. */
export default async function TelegramSignIn({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  const bot = telegramBot()
  if (!bot || !code || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) redirect("/login")
  return (
    <main className="wrap narrow">
      <div className="brand">
        <span className="mark">N</span> Noctorium
      </div>
      <h1>Sign in with Telegram</h1>
      <Waiter link={`https://t.me/${bot.name}?start=${code}`} />
    </main>
  )
}
