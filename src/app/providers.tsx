import { configured } from "@/lib/oauth"
import { telegramBot } from "@/lib/telegram-login"

/** Whether any provider is set up, so "or" is only written above buttons that are there. */
export const hasProviders = () => configured("discord") || configured("github") || telegramBot() !== null

/**
 * "Continue with Discord / GitHub / Telegram": only the ones whose keys are set, so a half-set-up provider is never a
 * button that fails. Telegram's opens the login bot in the Telegram app.
 */
export default function Providers({ next, intent = "signin", telegramOnly = false }: { next: string; intent?: "signin" | "link"; telegramOnly?: boolean }) {
  const query = `intent=${intent}&next=${encodeURIComponent(next)}`
  const bot = telegramBot()
  const oauth = telegramOnly ? [] : (["discord", "github"] as const).filter(configured)
  if (!oauth.length && !bot) return null
  return (
    <div className="providers">
      {oauth.map((provider) => (
        <a key={provider} className={`provider ${provider}`} href={`/api/auth/oauth/${provider}?${query}`}>
          {provider === "discord" ? "Continue with Discord" : "Continue with GitHub"}
        </a>
      ))}
      {bot && (
        <a className="provider telegram" href={`/api/auth/telegram/start?${query}`}>
          Continue with Telegram
        </a>
      )}
    </div>
  )
}
