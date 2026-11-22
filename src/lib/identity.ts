import { db } from "./db.ts"
import { cleanDisplayName, emailKey } from "./validate.ts"

/**
 * Discord and Telegram as ways into a Noctorium account.
 *
 * A provider's account opens the Noctorium account it is linked to, or a new one if it is linked to none. Accounts
 * are never joined by a matching email: an address a provider vouches for is not one this service has checked, and
 * merging on it is how an account is taken over. Linking a second way in is done on purpose, from the dashboard.
 */

export type Provider = "discord" | "telegram"
export const PROVIDERS: Provider[] = ["discord", "telegram"]

export const PROVIDER_NAMES: Record<Provider, string> = { discord: "Discord", telegram: "Telegram" }

/** What a provider says about who signed in. `email` only when the provider says it is verified. */
export type ProviderProfile = { provider: Provider; id: string; name: string; email: string | null }

export type SignedIn = { id: number; email: string; displayName: string; created: boolean }

/** The Noctorium account [profile] opens: the linked one, or a new one with no password. */
export async function signInWith(profile: ProviderProfile): Promise<SignedIn> {
  const sql = db()
  const [linked] = (await sql`
    SELECT u.id, u.email, u.display_name FROM identities i JOIN users u ON u.id = i.user_id
    WHERE i.provider = ${profile.provider} AND i.provider_user_id = ${profile.id} LIMIT 1
  `) as { id: number; email: string | null; display_name: string }[]
  if (linked) {
    await sql`UPDATE identities SET name = ${profile.name} WHERE provider = ${profile.provider} AND provider_user_id = ${profile.id}`
    return { id: Number(linked.id), email: linked.email ?? "", displayName: linked.display_name, created: false }
  }

  // The provider's address is kept only if no account has it already: that one may be somebody else's.
  const key = profile.email ? emailKey(profile.email) : null
  const taken = key ? ((await sql`SELECT 1 FROM users WHERE email_key = ${key} LIMIT 1`) as unknown[]).length > 0 : true
  const email = taken ? null : profile.email
  const name = cleanDisplayName(profile.name, PROVIDER_NAMES[profile.provider])
  const [user] = (await sql`
    INSERT INTO users (email, email_key, display_name, password_hash)
    VALUES (${email}, ${email ? key : null}, ${name}, NULL)
    RETURNING id, email, display_name
  `) as { id: number; email: string | null; display_name: string }[]
  await sql`
    INSERT INTO identities (provider, provider_user_id, user_id, name)
    VALUES (${profile.provider}, ${profile.id}, ${user.id}, ${profile.name})
  `
  return { id: Number(user.id), email: user.email ?? "", displayName: user.display_name, created: true }
}

/** Adds [profile] as a way into [userId]'s account. Refused when it already opens a different account. */
export async function link(userId: number, profile: ProviderProfile): Promise<"linked" | "taken"> {
  const sql = db()
  const [existing] = (await sql`
    SELECT user_id FROM identities WHERE provider = ${profile.provider} AND provider_user_id = ${profile.id} LIMIT 1
  `) as { user_id: number }[]
  if (existing && Number(existing.user_id) !== userId) return "taken"
  // One of each provider per account: linking another Discord replaces the first.
  await sql`DELETE FROM identities WHERE user_id = ${userId} AND provider = ${profile.provider}`
  await sql`
    INSERT INTO identities (provider, provider_user_id, user_id, name)
    VALUES (${profile.provider}, ${profile.id}, ${userId}, ${profile.name})
  `
  return "linked"
}

export type WaysIn = { password: boolean; email: string | null; linked: Partial<Record<Provider, string>> }

export async function waysIn(userId: number): Promise<WaysIn> {
  const sql = db()
  const [user] = (await sql`SELECT email, password_hash IS NOT NULL AS has_password FROM users WHERE id = ${userId}`) as {
    email: string | null
    has_password: boolean
  }[]
  const rows = (await sql`SELECT provider, name FROM identities WHERE user_id = ${userId}`) as { provider: Provider; name: string }[]
  return {
    password: Boolean(user?.has_password),
    email: user?.email ?? null,
    linked: Object.fromEntries(rows.map((r) => [r.provider, r.name])),
  }
}

/** Takes a provider off the account -- unless it is the last way in, which would lock the account. */
export async function unlink(userId: number, provider: Provider): Promise<"unlinked" | "last"> {
  const ways = await waysIn(userId)
  const others = Object.keys(ways.linked).filter((p) => p !== provider).length + (ways.password ? 1 : 0)
  if (others === 0) return "last"
  await db()`DELETE FROM identities WHERE user_id = ${userId} AND provider = ${provider}`
  return "unlinked"
}
