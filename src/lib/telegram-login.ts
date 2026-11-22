import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { db } from "./db.ts"
import type { ProviderProfile } from "./identity"

/**
 * Signing in with Telegram, in the Telegram app: the browser opens t.me/<bot>?start=<code>, the listener presses Start
 * and then Confirm in the chat, and the bot -- told by Telegram who pressed it -- vouches for the code. The browser,
 * which alone holds the poll secret (in a cookie), then signs in. No phone number is typed anywhere.
 *
 * Confirm is there because a code is only a link: without it, somebody could send a listener their own code, and one
 * tap on Start would sign the sender's browser in as the listener.
 */

export const TELEGRAM_SECONDS = 10 * 60
export const POLL_COOKIE = "noctorium_telegram"

export const telegramBot = () =>
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_NAME
    ? { token: process.env.TELEGRAM_BOT_TOKEN, name: process.env.TELEGRAM_BOT_NAME.replace(/^@/, "") }
    : null

/** What Telegram sends with every update, so only Telegram can call the webhook: derived from the bot token. */
export const webhookSecret = (botToken: string) =>
  createHmac("sha256", botToken).update("noctorium-telegram-webhook").digest("base64url")

export function secretMatches(sent: string | null, botToken: string): boolean {
  const expected = Buffer.from(webhookSecret(botToken))
  const given = Buffer.from(sent ?? "")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The poll secret this browser was given, from its cookie. */
export const pollTokenFrom = (request: Request) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${POLL_COOKIE}=`))
    ?.slice(POLL_COOKIE.length + 1) || null

const hashOf = (secret: string) => createHash("sha256").update(secret).digest("base64url")

type From = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }

const profileOf = (from: From): ProviderProfile => ({
  provider: "telegram",
  id: String(from.id),
  name: [from.first_name, from.last_name].filter(Boolean).join(" ") || (from.username ? `@${from.username}` : "Telegram"),
  email: null,
})

/** What an update from Telegram asks for: a code to confirm, a confirmation, or nothing for us. */
export type Asked =
  | { kind: "start"; chat: number; code: string | null }
  | { kind: "confirm"; code: string; profile: ProviderProfile; callback: string; chat: number; message: number }
  | { kind: "other" }

export function readUpdate(update: unknown): Asked {
  const u = (update ?? {}) as {
    message?: { text?: string; chat?: { id: number; type?: string }; from?: From }
    callback_query?: { id: string; data?: string; from?: From; message?: { message_id: number; chat: { id: number } } }
  }
  const query = u.callback_query
  if (query?.data?.startsWith("ok:") && query.from && !query.from.is_bot && query.message) {
    return {
      kind: "confirm",
      code: query.data.slice(3),
      profile: profileOf(query.from),
      callback: query.id,
      chat: query.message.chat.id,
      message: query.message.message_id,
    }
  }
  const message = u.message
  const start = message?.text?.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/)
  if (start && message?.chat && message.chat.type === "private" && message.from && !message.from.is_bot) {
    return { kind: "start", chat: message.chat.id, code: start[1] ?? null }
  }
  return { kind: "other" }
}

export async function beginTelegramLogin(intent: "signin" | "link", next: string): Promise<{ code: string; pollToken: string }> {
  const code = randomBytes(16).toString("base64url")
  const pollToken = randomBytes(32).toString("base64url")
  await db()`
    INSERT INTO telegram_logins (code, poll_hash, intent, next, expires_at)
    VALUES (${code}, ${hashOf(pollToken)}, ${intent}, ${next}, now() + make_interval(secs => ${TELEGRAM_SECONDS}))
  `
  await db()`DELETE FROM telegram_logins WHERE expires_at < now() - interval '1 hour'`
  return { code, pollToken }
}

export async function codeIsWaiting(code: string): Promise<boolean> {
  const rows = (await db()`SELECT 1 FROM telegram_logins WHERE code = ${code} AND telegram_id IS NULL AND expires_at > now()`) as unknown[]
  return rows.length > 0
}

/** The bot vouches that [profile] confirmed [code]. False when the code is unknown, expired or already confirmed. */
export async function vouch(code: string, profile: ProviderProfile): Promise<boolean> {
  const rows = (await db()`
    UPDATE telegram_logins SET telegram_id = ${profile.id}, name = ${profile.name}
    WHERE code = ${code} AND telegram_id IS NULL AND expires_at > now()
    RETURNING code
  `) as unknown[]
  return rows.length > 0
}

export type Collected =
  | { state: "pending" }
  | { state: "expired" }
  | { state: "unknown" }
  | { state: "confirmed"; profile: ProviderProfile; intent: "signin" | "link"; next: string }

/** What the browser holding [pollToken] gets. With [take], a confirmed sign-in is used up, so it opens only once. */
export async function collect(pollToken: string, take: boolean): Promise<Collected> {
  const sql = db()
  const [row] = (await sql`
    SELECT code, telegram_id, name, intent, next, expires_at < now() AS expired FROM telegram_logins WHERE poll_hash = ${hashOf(pollToken)}
  `) as { code: string; telegram_id: string | null; name: string | null; intent: string; next: string; expired: boolean }[]
  if (!row) return { state: "unknown" }
  if (!row.telegram_id) return row.expired ? { state: "expired" } : { state: "pending" }
  if (take) {
    const taken = (await sql`DELETE FROM telegram_logins WHERE code = ${row.code} AND telegram_id IS NOT NULL RETURNING code`) as unknown[]
    if (!taken.length) return { state: "unknown" }
  }
  return {
    state: "confirmed",
    profile: { provider: "telegram", id: row.telegram_id, name: row.name ?? "Telegram", email: null },
    intent: row.intent === "link" ? "link" : "signin",
    next: row.next,
  }
}

/** One call to the Bot API. */
export async function botCall(botToken: string, method: string, body: object): Promise<{ ok: boolean; result?: unknown }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: unknown }
}

let webhookReady: Promise<void> | null = null

/**
 * Points the bot's updates at this service, once per server: so setting the bot up is only its token and name, with
 * nothing to register by hand. Tried again on the next sign-in if Telegram could not be reached.
 */
export function ensureWebhook(botToken: string, url: string): Promise<void> {
  webhookReady ??= (async () => {
    const info = (await botCall(botToken, "getWebhookInfo", {})).result as { url?: string } | undefined
    if (info?.url === url) return
    const set = await botCall(botToken, "setWebhook", {
      url,
      secret_token: webhookSecret(botToken),
      allowed_updates: ["message", "callback_query"],
    })
    if (!set.ok) throw new Error("Telegram would not take the webhook.")
  })().catch((error) => {
    webhookReady = null
    throw error
  })
  return webhookReady
}
