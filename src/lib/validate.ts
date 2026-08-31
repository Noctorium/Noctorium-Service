/**
 * What the endpoints will accept.
 *
 * Everything arriving from a client is treated as unknown until checked here, and each check returns the
 * cleaned value rather than only a verdict, so a caller cannot accidentally go on using the raw input.
 */

/** Generous enough for real addresses, strict enough to reject something that is plainly not one. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export const MIN_PASSWORD_LENGTH = 10
/** scrypt hashes the whole input, so a very long password is a way to make the server do unbounded work. */
export const MAX_PASSWORD_LENGTH = 200

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 254 || !EMAIL.test(trimmed)) return null
  return trimmed
}

/** Addresses are compared case-insensitively so one person cannot hold both Sam@ and sam@. */
export function emailKey(email: string): string {
  return email.toLowerCase()
}

export function checkPassword(value: unknown): { password: string } | { error: string } {
  if (typeof value !== "string" || value.length === 0) return { error: "A password is required." }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return { error: `Use at most ${MAX_PASSWORD_LENGTH} characters.` }
  }
  return { password: value }
}

export function cleanDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim().replace(/\s+/g, " ")
  return trimmed.length === 0 ? fallback : trimmed.slice(0, 40)
}

/** Reads a JSON body without letting a malformed one become a 500. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}
