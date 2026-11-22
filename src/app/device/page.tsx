import { cookies } from "next/headers"
import Link from "next/link"
import Providers, { hasProviders } from "../providers"
import { db } from "@/lib/db"
import { deviceIsWaiting, normalCode } from "@/lib/device"
import { SESSION_COOKIE, readToken } from "@/lib/session"
import Brand from "../brand"

export const dynamic = "force-dynamic"

/**
 * Where an app sends somebody to sign it in: they sign in here with any way they have -- Discord, GitHub, Telegram or
 * email -- check the code is the one the app shows, and allow it. The app then signs itself in.
 */
export default async function Device({ searchParams }: { searchParams: Promise<{ code?: string; allowed?: string; error?: string }> }) {
  const { code: typed, allowed, error } = await searchParams
  const code = normalCode(typed)
  const session = await readToken((await cookies()).get(SESSION_COOKIE)?.value)
  const here = `/device${code ? `?code=${code}` : ""}`

  const page = (body: React.ReactNode) => (
    <main className="wrap narrow">
      <Brand />
      <h1>Sign in an app</h1>
      {body}
    </main>
  )

  if (allowed) {
    return page(
      <div className="card">
        <p>Done — the app is signing in now. You can close this page and go back to it.</p>
      </div>,
    )
  }

  if (!code) {
    return page(
      <form className="card" method="get">
        {error && <div className="error">That code is not right. Check the one the app shows.</div>}
        <label htmlFor="code">The code the app shows</label>
        <input id="code" name="code" placeholder="ABCD-EFGH" autoComplete="off" autoCapitalize="characters" required />
        <button type="submit">Continue</button>
      </form>,
    )
  }

  if (!session) {
    return page(
      <>
        <p className="muted">Sign in to your Noctorium account to let the app showing <b>{code}</b> in.</p>
        {hasProviders() && (
          <>
            <Providers next={here} />
            <div className="or">or</div>
          </>
        )}
        <p style={{ textAlign: "center" }}>
          <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in with email</Link> ·{" "}
          <Link href={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link>
        </p>
      </>,
    )
  }

  if (error || !(await deviceIsWaiting(code))) {
    return page(
      <div className="card">
        <p>That code has expired or was already used. Start signing in again in the app for a new one.</p>
      </div>,
    )
  }

  const [user] = (await db()`SELECT display_name FROM users WHERE id = ${session.userId}`) as { display_name: string }[]
  return page(
    <form className="card" method="post" action="/api/auth/device/allow">
      <p className="muted">Check the app shows this code:</p>
      <div className="code">{code}</div>
      <p>
        Let it use your Noctorium account, <b>{user?.display_name ?? "you"}</b>? It will see your listening statistics and
        record what you play, as signing in on it with your password would.
      </p>
      <input type="hidden" name="code" value={code} />
      <button type="submit">Allow</button>
      <p className="muted" style={{ marginTop: 14 }}>
        Not the code the app shows? Don&apos;t allow it, and close this page.
      </p>
    </form>,
  )
}
