import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { ProviderProfile } from "./identity"

/**
 * Telegram's Login Widget: Telegram signs who signed in with the bot's token, and the answer arrives as query
 * parameters. Checked as Telegram documents it (core.telegram.org/widgets/login#checking-authorization): every field
 * but `hash`, sorted, one `key=value` per line, signed with HMAC-SHA256 under SHA-256 of the bot token.
 */

const MAX_AGE_SECONDS = 24 * 60 * 60

export const telegramBot = () =>
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_NAME
    ? { token: process.env.TELEGRAM_BOT_TOKEN, name: process.env.TELEGRAM_BOT_NAME.replace(/^@/, "") }
    : null

const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"]

export function telegramProfile(params: URLSearchParams, botToken: string, now = Date.now()): ProviderProfile | null {
  const hash = params.get("hash")
  const id = params.get("id")
  const authDate = Number(params.get("auth_date"))
  if (!hash || !id || !/^\d+$/.test(id) || !authDate) return null
  if (now / 1000 - authDate > MAX_AGE_SECONDS) return null
  const check = FIELDS.filter((k) => params.has(k))
    .sort()
    .map((k) => `${k}=${params.get(k)}`)
    .join("\n")
  const expected = createHmac("sha256", createHash("sha256").update(botToken).digest()).update(check).digest("hex")
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null
  const username = params.get("username")
  const name = [params.get("first_name"), params.get("last_name")].filter(Boolean).join(" ") || (username ? `@${username}` : "Telegram")
  return { provider: "telegram", id, name, email: null }
}
