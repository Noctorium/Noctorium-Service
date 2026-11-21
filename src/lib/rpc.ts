import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * The service's side of the now-playing status on Discord and Telegram.
 *
 * The two RPC servers never see a Noctorium password or token. The service vouches for a user with a ticket
 * signed with RPC_SECRET, which the RPC server checks and then forgets; and it tells them what somebody is playing
 * with the same secret as a bearer token, over HTTPS.
 */

export type RpcService = "discord" | "telegram"
export type TicketPurpose = "connect" | "disconnect"

/** What a player says is playing. Everything is optional but the title, and every field is bounded. */
export type NowPlaying = {
  title: string
  artist: string
  album?: string
  artworkUrl?: string
  url?: string
  provider?: string
  durationMs?: number
  positionMs?: number
}

const TICKET_SECONDS = 10 * 60

function secret(): string {
  const value = process.env.RPC_SECRET
  if (!value || value.length < 32) throw new Error("RPC_SECRET is missing or too short; set it to at least 32 random characters.")
  return value
}

export function rpcUrl(service: RpcService): string {
  return service === "discord"
    ? process.env.DISCORD_RPC_URL ?? "https://discord.noctorium.xyz"
    : process.env.TELEGRAM_RPC_URL ?? "https://telegram.noctorium.xyz"
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`noctorium-rpc-ticket:${payload}`).digest("base64url")

/** A ticket saying "this is Noctorium user N, for this purpose, for the next ten minutes". */
export function ticketFor(userId: number, service: RpcService, purpose: TicketPurpose, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, s: service, p: purpose, e: Math.floor(now / 1000) + TICKET_SECONDS })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

/** The user a ticket names, if it is genuine, unexpired, and for this service and purpose. */
export function readTicket(ticket: string, service: RpcService, purpose: TicketPurpose, now = Date.now()): number | null {
  const [payload, signature] = ticket.split(".")
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { u, s, p, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (s !== service || p !== purpose || typeof e !== "number" || e * 1000 < now) return null
    return Number.isInteger(u) && u > 0 ? u : null
  } catch {
    return null
  }
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined)
const https = (value: unknown) => {
  const s = text(value, 512)
  return s && /^https:\/\//.test(s) ? s : undefined
}
const ms = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 24 * 3600_000 ? Math.round(value) : undefined)

/** A player's now-playing, cleaned; null for "nothing is playing" or anything that is not a track. */
export function readNowPlaying(value: unknown): NowPlaying | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const title = text(v.title, 200)
  if (!title) return null
  return {
    title,
    artist: text(v.artist, 200) ?? "",
    album: text(v.album, 200),
    artworkUrl: https(v.artworkUrl),
    url: https(v.url),
    provider: text(v.provider, 40),
    durationMs: ms(v.durationMs),
    positionMs: ms(v.positionMs),
  }
}

/** Tells one RPC server what [userId] is playing now (null: nothing). Failures are logged, never thrown. */
export async function tell(service: RpcService, userId: number, track: NowPlaying | null): Promise<void> {
  try {
    const reply = await fetch(`${rpcUrl(service)}/api/update`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret()}` },
      body: JSON.stringify({ userId, track }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!reply.ok) console.error(`Noctorium: the ${service} RPC server answered ${reply.status}`)
  } catch (error) {
    console.error(`Noctorium: the ${service} RPC server could not be reached`, error)
  }
}
