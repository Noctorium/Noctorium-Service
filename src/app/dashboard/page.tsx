import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { SESSION_COOKIE, readToken } from "@/lib/session"
import SignOut from "./sign-out"

export const dynamic = "force-dynamic"

/** Whole numbers with thin separators, so six figures stay readable at a glance. */
const count = (value: number) => value.toLocaleString("en-US")

export default async function Dashboard() {
  const jar = await cookies()
  const session = await readToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) redirect("/login")

  const sql = db()
  const [profile] = (await sql`SELECT display_name FROM users WHERE id = ${session.userId} LIMIT 1`) as {
    display_name: string
  }[]
  if (!profile) redirect("/login")

  const [totals] = (await sql`
    SELECT
      COUNT(*)::bigint                             AS streams,
      COUNT(DISTINCT (provider, track_id))::bigint AS unique_tracks,
      COUNT(DISTINCT artist)::bigint               AS artists,
      COALESCE(SUM(ms_played), 0)::bigint          AS ms_played
    FROM plays WHERE user_id = ${session.userId}
  `) as { streams: string; unique_tracks: string; artists: string; ms_played: string }[]

  const top = (await sql`
    SELECT title, artist, COUNT(*)::bigint AS streams
    FROM plays WHERE user_id = ${session.userId}
    GROUP BY title, artist ORDER BY streams DESC, title ASC LIMIT 10
  `) as { title: string; artist: string; streams: string }[]

  const [linkRow] = (await sql`
    SELECT (SELECT discord_name FROM discord_links WHERE user_id = ${session.userId}) AS discord,
           (SELECT telegram_name FROM telegram_links WHERE user_id = ${session.userId}) AS telegram
  `) as { discord: string | null; telegram: string | null }[]
  const links = { discord: linkRow?.discord ?? null, telegram: linkRow?.telegram ?? null }

  const streams = Number(totals.streams)
  const hours = Number(totals.ms_played) / 3_600_000

  return (
    <main className="wrap">
      <div className="row">
        <div className="brand">
          <span className="mark">N</span> Noctorium
        </div>
        <SignOut />
      </div>

      <h1>{profile.display_name}</h1>
      <p className="lede">Everything the player has recorded for you.</p>

      <div className="grid">
        <div className="stat">
          <div className="n">{count(streams)}</div>
          <div className="k">Songs streamed</div>
        </div>
        <div className="stat">
          <div className="n">{count(Number(totals.unique_tracks))}</div>
          <div className="k">Different songs</div>
        </div>
        <div className="stat">
          <div className="n">{hours < 10 ? hours.toFixed(1) : count(Math.round(hours))}</div>
          <div className="k">Hours listened</div>
        </div>
        <div className="stat">
          <div className="n">{count(Number(totals.artists))}</div>
          <div className="k">Artists</div>
        </div>
      </div>

      <h2>Most played</h2>
      {top.length === 0 ? (
        <div className="empty">
          Nothing recorded yet. Sign in to the same account inside the player and press play.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Song</th>
              <th>Artist</th>
              <th className="num">Plays</th>
            </tr>
          </thead>
          <tbody>
            {top.map((row) => (
              <tr key={`${row.title}-${row.artist}`}>
                <td>{row.title}</td>
                <td className="muted">{row.artist}</td>
                <td className="num">{count(Number(row.streams))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Show what you play</h2>
      <p className="muted">
        Your Discord status and your Telegram bio show the song you are playing in Noctorium — from your phone or any
        device signed in to this account, with no computer needed.
      </p>
      <table>
        <tbody>
          {(["discord", "telegram"] as const).map((service) => {
            const linked = links[service]
            return (
              <tr key={service}>
                <td>{service === "discord" ? "Discord status" : "Telegram bio"}</td>
                <td className="muted">{linked ? `Connected as ${linked}` : "Not connected"}</td>
                <td className="num">
                  <a href={`/api/rpc/connect?service=${service}&action=${linked ? "disconnect" : "connect"}`}>
                    {linked ? "Disconnect" : "Connect"}
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
