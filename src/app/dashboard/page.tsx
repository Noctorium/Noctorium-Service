import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { SESSION_COOKIE, readToken } from "@/lib/session"
import SignOut from "./sign-out"
import FullStats from "./full"
import Brand from "../brand"

export const dynamic = "force-dynamic"

const avatarUrl = (key: string) => `${process.env.ACCOUNT_URL ?? "https://account.noctorium.xyz"}/avatar/${key}`

export default async function Dashboard() {
  const jar = await cookies()
  const session = await readToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) redirect("https://account.noctorium.xyz/login")

  const sql = db()
  const [profile] = (await sql`SELECT display_name, avatar_key FROM users WHERE id = ${session.userId} LIMIT 1`) as {
    display_name: string
    avatar_key: string | null
  }[]
  if (!profile) redirect("https://account.noctorium.xyz/login")

  return (
    <main className="wrap">
      <div className="row">
        <Brand />
        <SignOut />
      </div>

      <h1 className="who">
        {profile.avatar_key ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" src={avatarUrl(profile.avatar_key)} width={44} height={44} alt="" />
        ) : (
          <span className="avatar" aria-hidden>{(profile.display_name.trim()[0] ?? "?").toUpperCase()}</span>
        )}
        {profile.display_name}
      </h1>
      <p className="lede">Everything the player has recorded for you.</p>

      <FullStats />

      <p className="muted" style={{ marginTop: 28 }}>
        How you sign in, two-step verification, your Discord status and Telegram bio, and Last.fm and ListenBrainz are on{" "}
        <a href="https://account.noctorium.xyz/dashboard">your account page</a>.
      </p>
    </main>
  )
}
