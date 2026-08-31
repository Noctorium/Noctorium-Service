import { createHash } from "node:crypto"

/**
 * Throttling for the endpoints reachable without signing in.
 *
 * The count lives in Postgres because serverless instances share nothing: an in-process counter would be
 * reset by every cold start and would not be seen by the other instances running alongside it, so it would
 * throttle almost nothing. The database is the only thing all of them agree on.
 *
 * The window is fixed rather than sliding. A fixed window lets through up to twice the limit if the
 * attempts straddle a boundary, which is a real weakness but an unimportant one here — the point is to turn
 * unlimited guessing into a few attempts a minute, and it does that in a single statement against one row.
 */

export type Limit = { limit: number; windowSeconds: number }

/** Guessing one account's password. Low, because a person who knows their own password needs a few tries. */
export const PER_ACCOUNT_SIGN_IN: Limit = { limit: 8, windowSeconds: 15 * 60 }

/** Guessing across many accounts from one place. Higher: a household or office shares an address. */
export const PER_ADDRESS_SIGN_IN: Limit = { limit: 40, windowSeconds: 15 * 60 }

/** Creating accounts in bulk. Nobody legitimately needs more than a handful in an hour. */
export const PER_ADDRESS_SIGN_UP: Limit = { limit: 8, windowSeconds: 60 * 60 }

/**
 * The caller's address, as the platform reports it.
 *
 * `x-forwarded-for` can be set by anyone when a service is reachable directly, but on Vercel the proxy
 * writes it and the function is not otherwise addressable, so the first entry is the real client.
 */
export function callerAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  return first || request.headers.get("x-real-ip")?.trim() || "unknown"
}

/**
 * A bucket key.
 *
 * The value is hashed so this table never becomes a second record of who has been typing which email
 * address — including addresses that were only ever guessed at and have no account.
 */
export function bucket(kind: string, value: string): string {
  const digest = createHash("sha256").update(value.toLowerCase()).digest("base64url").slice(0, 32)
  return `${kind}:${digest}`
}

/** The reply for a caller who has run out of attempts. */
export function tooManyAttempts(retryAfterSeconds: number): Response {
  const minutes = Math.ceil(retryAfterSeconds / 60)
  return Response.json(
    { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  )
}
