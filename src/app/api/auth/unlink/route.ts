import { PROVIDERS, unlink, type Provider } from "@/lib/identity"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"

export const runtime = "nodejs"

/** Unlink on the dashboard: takes Discord or Telegram off the account, unless it is the last way in. */
export async function POST(request: Request) {
  const session = await currentSession(request)
  if (!session) return redirect("/login", request)
  const provider = String((await request.formData()).get("provider") ?? "") as Provider
  if (!PROVIDERS.includes(provider)) return redirect("/dashboard", request)
  const result = await unlink(session.userId, provider)
  return redirect(`/dashboard?${result === "last" ? "last" : "unlinked"}=${provider}`, request)
}
