import { configured } from "@/lib/oauth"
import { telegramBot } from "@/lib/telegram-login"

const SERVICE = process.env.SERVICE_URL ?? "https://service.noctorium.xyz"

/** Whether any provider is set up, so "or" is only written above buttons that are there. */
export const hasProviders = () => configured("discord") || configured("github") || telegramBot() !== null

/**
 * "Continue with Discord / GitHub / Telegram": only the ones whose keys are set, so a half-set-up provider is never a
 * button that fails. Telegram's is Telegram's own Login Widget, which signs who signed in with the bot's token.
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
        <div className="telegram-widget">
          <script
            async
            src="https://telegram.org/js/telegram-widget.js?22"
            data-telegram-login={bot.name}
            data-size="large"
            data-radius="10"
            data-auth-url={`${SERVICE}/api/auth/telegram?${query}`}
          />
        </div>
      )}
    </div>
  )
}
