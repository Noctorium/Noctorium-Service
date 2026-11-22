import { configured } from "@/lib/oauth"
import { telegramBot } from "@/lib/telegram-login"
import { ProviderIcon } from "./brand"

type Provider = "discord" | "telegram"

const NAMES: Record<Provider, string> = { discord: "Discord", telegram: "Telegram" }

/** The providers whose keys are set, so a half-set-up provider is never a button that fails. */
export const readyProviders = (): Provider[] =>
  (["discord", "telegram"] as const).filter((p) => (p === "telegram" ? telegramBot() !== null : configured(p)))

/** Whether any provider is set up, so "or" is only written above buttons that are there. */
export const hasProviders = () => readyProviders().length > 0

/** Where a provider's sign-in (or, from the dashboard, its linking) starts. */
export const startUrl = (provider: Provider, intent: "signin" | "link", next: string) => {
  const query = `intent=${intent}&next=${encodeURIComponent(next)}`
  return provider === "telegram" ? `/api/auth/telegram/start?${query}` : `/api/auth/oauth/${provider}?${query}`
}

/** "Continue with" Discord or Telegram: side by side, each in its own colours, with its mark. */
export default function Providers({ next, intent = "signin" }: { next: string; intent?: "signin" | "link" }) {
  const ready = readyProviders()
  if (!ready.length) return null
  return (
    <div className="providers">
      {ready.map((provider) => (
        <a key={provider} className={`provider ${provider}`} href={startUrl(provider, intent, next)}>
          <ProviderIcon provider={provider} />
          {NAMES[provider]}
        </a>
      ))}
    </div>
  )
}
