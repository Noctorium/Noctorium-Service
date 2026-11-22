import { randomBytes } from "node:crypto"
import { authorizeUrl, configured, signState, type OAuthProvider } from "@/lib/oauth"

export const runtime = "nodejs"

/** Starts signing in (or linking) with Discord: ?intent=signin|link&next=/somewhere */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (provider !== "discord" || !configured(provider)) return new Response("Unknown way to sign in.", { status: 404 })
  const url = new URL(request.url)
  const state = randomBytes(16).toString("base64url")
  const signed = await signState(state, url.searchParams.get("intent") === "link" ? "link" : "signin", url.searchParams.get("next") ?? "/dashboard")
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return new Response(null, {
    status: 303,
    headers: {
      location: authorizeUrl(provider as OAuthProvider, state),
      "set-cookie": `noctorium_oauth=${signed}; Path=/api/auth/oauth; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
    },
  })
}
