import { SignJWT, jwtVerify } from "jose"
import type { ProviderProfile } from "./identity"

/**
 * Discord and GitHub sign-in, by OAuth2. Who started it, and what for, travels in a short signed state (a JWT under
 * AUTH_SECRET) kept in a cookie and compared with the `state` Discord or GitHub hands back.
 */

export type OAuthProvider = "discord" | "github"
export type Intent = "signin" | "link"

const BASE = () => process.env.SERVICE_URL ?? "https://service.noctorium.xyz"
export const callbackUrl = (provider: OAuthProvider) => `${BASE()}/api/auth/oauth/${provider}/callback`

function credentials(provider: OAuthProvider) {
  const prefix = provider === "discord" ? "DISCORD" : "GITHUB"
  const id = process.env[`${prefix}_CLIENT_ID`]
  const secret = process.env[`${prefix}_CLIENT_SECRET`]
  return id && secret ? { id, secret } : null
}

/** Whether a provider's keys are set; until they are, its button is not shown. */
export const configured = (provider: OAuthProvider) => credentials(provider) !== null

export function authorizeUrl(provider: OAuthProvider, state: string): string {
  const keys = credentials(provider)!
  const url = new URL(provider === "discord" ? "https://discord.com/oauth2/authorize" : "https://github.com/login/oauth/authorize")
  url.search = new URLSearchParams({
    client_id: keys.id,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: provider === "discord" ? "identify email" : "read:user user:email",
    state,
  }).toString()
  return url.toString()
}

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "")

/** Only a path on this site, so a crafted link cannot send somebody elsewhere after signing in. */
export const safeNext = (next: string | null | undefined) => (next && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : "/dashboard")

export async function signState(state: string, intent: Intent, next: string): Promise<string> {
  return new SignJWT({ state, intent, next: safeNext(next) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret())
}

export async function readState(cookie: string | undefined, state: string | null): Promise<{ intent: Intent; next: string } | null> {
  if (!cookie || !state) return null
  try {
    const { payload } = await jwtVerify(cookie, secret(), { algorithms: ["HS256"] })
    if (payload.state !== state) return null
    return { intent: payload.intent === "link" ? "link" : "signin", next: safeNext(String(payload.next)) }
  } catch {
    return null
  }
}

/** Swaps Discord's or GitHub's code for who signed in. */
export async function profileFor(provider: OAuthProvider, code: string): Promise<ProviderProfile> {
  const keys = credentials(provider)!
  const tokenReply = await fetch(provider === "discord" ? "https://discord.com/api/v10/oauth2/token" : "https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: keys.id,
      client_secret: keys.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(provider),
    }),
  })
  const token = await tokenReply.json()
  if (!tokenReply.ok || !token.access_token) throw new Error(`${provider} token: ${tokenReply.status}`)
  const auth = { authorization: `Bearer ${token.access_token}`, accept: "application/json", "user-agent": "Noctorium" }

  if (provider === "discord") {
    const user = await (await fetch("https://discord.com/api/v10/users/@me", { headers: auth })).json()
    return { provider, id: String(user.id), name: user.global_name || user.username, email: user.verified && user.email ? user.email : null }
  }
  const user = await (await fetch("https://api.github.com/user", { headers: auth })).json()
  const emails = (await (await fetch("https://api.github.com/user/emails", { headers: auth })).json()) as { email: string; primary: boolean; verified: boolean }[]
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined
  return { provider, id: String(user.id), name: user.name || user.login, email: primary?.email ?? null }
}
