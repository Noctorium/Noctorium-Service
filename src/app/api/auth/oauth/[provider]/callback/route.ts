import { cookies } from "next/headers"
import { configured, profileFor, readState, type OAuthProvider } from "@/lib/oauth"
import { finish, redirect } from "@/lib/signed-in"

export const runtime = "nodejs"

/** Back from Discord or GitHub. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if ((provider !== "discord" && provider !== "github") || !configured(provider)) return new Response("Unknown way to sign in.", { status: 404 })
  const url = new URL(request.url)
  const jar = await cookies()
  const started = await readState(jar.get("noctorium_oauth")?.value, url.searchParams.get("state"))
  jar.delete({ name: "noctorium_oauth", path: "/api/auth/oauth" })
  const code = url.searchParams.get("code")
  if (!started || !code) return redirect(`/login?error=${encodeURIComponent(url.searchParams.get("error") ?? "expired")}`, request)
  try {
    return await finish(request, await profileFor(provider as OAuthProvider, code), started.intent, started.next)
  } catch (error) {
    console.error(`${provider} sign-in`, error)
    return redirect("/login?error=failed", request)
  }
}
