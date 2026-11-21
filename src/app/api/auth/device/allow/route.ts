import { allowDevice, normalCode } from "@/lib/device"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"

export const runtime = "nodejs"

/** The Allow button on /device: the signed-in listener lets the app showing this code into their account. */
export async function POST(request: Request) {
  const session = await currentSession(request)
  const form = await request.formData()
  const code = normalCode(String(form.get("code") ?? ""))
  if (!code) return redirect("/device?error=code", request)
  if (!session) return redirect(`/login?next=${encodeURIComponent(`/device?code=${code}`)}`, request)
  const ok = await allowDevice(code, session.userId)
  return redirect(`/device?code=${code}&${ok ? "allowed=1" : "error=expired"}`, request)
}
