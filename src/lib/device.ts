import { createHash, randomBytes, randomInt } from "node:crypto"
import { db } from "./db.ts"

/**
 * Signing an app in from a browser: the app asks for a code, shows it and opens /device; the listener signs in there
 * with any way they have -- Discord, GitHub, Telegram or email -- and allows it; the app, which alone holds the poll
 * secret, collects the account token. Only the secret's hash is kept, and a code lasts ten minutes and is used once.
 */

export const DEVICE_SECONDS = 10 * 60
export const POLL_INTERVAL_SECONDS = 3

/** No 0/O, 1/I/L, so a code read off a TV is typed right. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export function newCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)])
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`
}

/** A code as somebody may type it: any case, with or without the dash or spaces. */
export function normalCode(typed: string | null | undefined): string | null {
  const plain = (typed ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (plain.length !== 8 || [...plain].some((c) => !ALPHABET.includes(c))) return null
  return `${plain.slice(0, 4)}-${plain.slice(4)}`
}

const hashOf = (secret: string) => createHash("sha256").update(secret).digest("base64url")

export async function startDeviceLogin(): Promise<{ code: string; pollToken: string }> {
  const pollToken = randomBytes(32).toString("base64url")
  const code = newCode()
  await db()`
    INSERT INTO device_logins (code, poll_hash, expires_at)
    VALUES (${code}, ${hashOf(pollToken)}, now() + make_interval(secs => ${DEVICE_SECONDS}))
  `
  // Expired ones are swept as new ones are made, so the table never grows.
  await db()`DELETE FROM device_logins WHERE expires_at < now() - interval '1 hour'`
  return { code, pollToken }
}

/** The listener allows the device showing [code]. False when the code is unknown, expired or already used. */
export async function allowDevice(code: string, userId: number): Promise<boolean> {
  const rows = (await db()`
    UPDATE device_logins SET user_id = ${userId}
    WHERE code = ${code} AND user_id IS NULL AND expires_at > now()
    RETURNING code
  `) as unknown[]
  return rows.length > 0
}

export async function deviceIsWaiting(code: string): Promise<boolean> {
  const rows = (await db()`SELECT 1 FROM device_logins WHERE code = ${code} AND user_id IS NULL AND expires_at > now()`) as unknown[]
  return rows.length > 0
}

export type Poll = { state: "pending" } | { state: "allowed"; userId: number } | { state: "expired" } | { state: "unknown" }

/** What the app waiting with [pollToken] gets: once allowed, its user -- and the row is gone, so only once. */
export async function pollDevice(pollToken: string): Promise<Poll> {
  const sql = db()
  const [row] = (await sql`
    SELECT code, user_id, expires_at < now() AS expired FROM device_logins WHERE poll_hash = ${hashOf(pollToken)}
  `) as { code: string; user_id: number | null; expired: boolean }[]
  if (!row) return { state: "unknown" }
  if (row.user_id) {
    const taken = (await sql`DELETE FROM device_logins WHERE code = ${row.code} AND user_id IS NOT NULL RETURNING user_id`) as unknown[]
    return taken.length ? { state: "allowed", userId: Number(row.user_id) } : { state: "unknown" }
  }
  return row.expired ? { state: "expired" } : { state: "pending" }
}
