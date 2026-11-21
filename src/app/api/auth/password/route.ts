import { db } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { currentSession } from "@/lib/session"
import { redirect } from "@/lib/signed-in"
import { checkPassword, cleanEmail, emailKey } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * For an account made with Discord, GitHub or Telegram: adds an email and password, so it can sign in with those too.
 * The email must not belong to another account.
 */
export async function POST(request: Request) {
  const session = await currentSession(request)
  if (!session) return redirect("/login", request)
  const form = await request.formData()
  const checked = checkPassword(form.get("password"))
  if ("error" in checked) return redirect(`/dashboard?password=${encodeURIComponent(checked.error)}`, request)
  const sql = db()
  const [user] = (await sql`SELECT email FROM users WHERE id = ${session.userId}`) as { email: string | null }[]
  let email = user?.email ?? null
  if (!email) {
    email = cleanEmail(form.get("email"))
    if (!email) return redirect(`/dashboard?password=${encodeURIComponent("Enter an email address to sign in with.")}`, request)
    const taken = (await sql`SELECT 1 FROM users WHERE email_key = ${emailKey(email)} AND id <> ${session.userId}`) as unknown[]
    if (taken.length) return redirect(`/dashboard?password=${encodeURIComponent("Another account already uses that email address.")}`, request)
  }
  await sql`
    UPDATE users SET email = ${email}, email_key = ${emailKey(email)}, password_hash = ${await hashPassword(checked.password)}
    WHERE id = ${session.userId}
  `
  return redirect("/dashboard?password=set", request)
}
