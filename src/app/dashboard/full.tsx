"use client"

import { useEffect, useState } from "react"
import type { Stats } from "@/lib/stats"

const RANGES = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["365d", "Year"],
  ["all", "All time"],
] as const

const SERVICES: Record<string, [string, string]> = {
  YOUTUBE_MUSIC: ["YouTube Music", "#ff4e45"],
  YOUTUBE_VIDEO: ["YouTube Music", "#ff4e45"],
  SOUNDCLOUD: ["SoundCloud", "#ff7a1a"],
  SPOTIFY: ["Spotify", "#1ed760"],
  BANDCAMP: ["Bandcamp", "#629aa9"],
  VK: ["VK", "#4c9bff"],
  LOCAL: ["Your files", "#b47cff"],
}
const service = (code: string): [string, string] =>
  SERVICES[code] ?? [code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " "), "#9a8fad"]

const count = (value: number) => value.toLocaleString("en-US")
const hours = (minutes: number) => (minutes < 600 ? (minutes / 60).toFixed(1) : count(Math.round(minutes / 60)))
const days = (n: number) => `${count(n)} ${n === 1 ? "day" : "days"}`
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Bars as tall as their share of the tallest, each with its label under it and its figure in a tooltip. */
function Bars({ bars, height = 120 }: { bars: { label: string; value: number; title: string }[]; height?: number }) {
  const most = Math.max(1, ...bars.map((b) => b.value))
  return (
    <div className="bars" style={{ height: height + 22 }}>
      {bars.map((b, i) => (
        <div className="bar" key={i} title={b.title}>
          <div className="fill" style={{ height: Math.max(2, (b.value / most) * height) }} />
          <div className="k">{b.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Everything the service works out, over the span picked: the same figures and charts as Noctorium Stats. */
export default function FullStats() {
  const [range, setRange] = useState<string>("30d")
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setError(null)
    // Days and hours on this browser's clock, as the apps ask for them on theirs.
    const tz = -new Date().getTimezoneOffset()
    fetch(`/api/stats?range=${range}&tz=${tz}&limit=10`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: Stats) => live && setStats(s))
      .catch(() => live && setError("The statistics could not be loaded. Try again in a moment."))
    return () => {
      live = false
    }
  }, [range])

  const shown = stats?.range === range ? stats : null
  const monthly = shown?.timeline.bucket === "month"
  const total = shown?.streams ?? 0

  return (
    <>
      <div className="chips">
        {RANGES.map(([code, label]) => (
          <button key={code} className={code === range ? "chip on" : "chip"} onClick={() => setRange(code)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {!shown && !error && <p className="muted">Loading…</p>}

      {shown && (
        <>
          <div className="grid">
            <div className="stat"><div className="n">{count(shown.streams)}</div><div className="k">Songs streamed</div></div>
            <div className="stat"><div className="n">{hours(shown.msPlayed / 60_000)}</div><div className="k">Hours listened</div></div>
            <div className="stat"><div className="n">{count(shown.uniqueTracks)}</div><div className="k">Different songs</div></div>
            <div className="stat"><div className="n">{count(shown.artists)}</div><div className="k">Artists</div></div>
            <div className="stat"><div className="n">{days(shown.streak.current)}</div><div className="k">Current streak</div></div>
            <div className="stat"><div className="n">{days(shown.streak.longest)}</div><div className="k">Longest streak</div></div>
          </div>

          {total === 0 ? (
            <div className="empty">Nothing recorded in this span. Sign in to the same account inside the player and press play.</div>
          ) : (
            <>
              <h2>{monthly ? "Month by month" : "Day by day"}</h2>
              <Bars
                bars={shown.timeline.points.map((p) => ({
                  label: "",
                  value: p.minutes,
                  title: `${p.start}: ${count(p.streams)} plays, ${count(p.minutes)} min`,
                }))}
              />

              <div className="two">
                <div>
                  <h2>Hour of the day</h2>
                  <Bars
                    height={90}
                    bars={shown.hourly.map((h) => ({
                      label: h.hour % 6 === 0 ? String(h.hour) : "",
                      value: h.minutes,
                      title: `${h.hour}:00: ${count(h.streams)} plays`,
                    }))}
                  />
                </div>
                <div>
                  <h2>Day of the week</h2>
                  <Bars
                    height={90}
                    bars={shown.weekdays.map((d) => ({
                      label: WEEKDAYS[d.day - 1] ?? "",
                      value: d.minutes,
                      title: `${WEEKDAYS[d.day - 1]}: ${count(d.streams)} plays`,
                    }))}
                  />
                </div>
              </div>

              <h2>By service</h2>
              {Object.entries(
                shown.byProvider.reduce<Record<string, number>>((all, p) => {
                  const name = service(p.provider)[0]
                  all[name] = (all[name] ?? 0) + p.streams
                  return all
                }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([name, streams]) => {
                  const colour = Object.values(SERVICES).find(([n]) => n === name)?.[1] ?? "#9a8fad"
                  return (
                    <div className="share" key={name}>
                      <div className="row"><span>{name}</span><span className="muted">{Math.round((streams * 100) / total)}%</span></div>
                      <div className="track"><div style={{ width: `${(streams * 100) / total}%`, background: colour }} /></div>
                    </div>
                  )
                })}

              <div className="two">
                <div>
                  <h2>Top songs</h2>
                  <table>
                    <tbody>
                      {shown.topTracks.map((t, i) => (
                        <tr key={`${t.title}-${t.artist}`}>
                          <td className="muted num">{i + 1}</td>
                          <td>{t.title}<div className="muted small">{t.artist}</div></td>
                          <td className="num">{count(t.streams)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h2>Top artists</h2>
                  <table>
                    <tbody>
                      {shown.topArtists.map((a, i) => (
                        <tr key={a.artist}>
                          <td className="muted num">{i + 1}</td>
                          <td>{a.artist}<div className="muted small">{count(a.tracks)} {a.tracks === 1 ? "song" : "songs"} · {count(a.minutes)} min</div></td>
                          <td className="num">{count(a.streams)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <h2>Recently played</h2>
              <table>
                <tbody>
                  {shown.recent.map((p) => (
                    <tr key={`${p.playedAt}-${p.title}`}>
                      <td>{p.title}<div className="muted small">{p.artist} · {service(p.provider)[0]}</div></td>
                      <td className="num muted">{new Date(p.playedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  )
}
