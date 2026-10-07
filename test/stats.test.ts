import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { PGlite } from "@electric-sql/pglite"
import { listeningStats, readLimit, readOffset, readRange, streaks, timeline, type Sql } from "../src/lib/stats.ts"

/**
 * The statistics against a real Postgres -- PGlite, in memory, with the service's own schema -- since the part
 * worth checking is the SQL: the ranges, the listener's own clock, and the gaps a chart must not show.
 */
async function database() {
  const pg = new PGlite()
  await pg.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))
  await pg.query("INSERT INTO users (email, email_key, display_name, password_hash) VALUES ('a@noctorium.test', 'a@noctorium.test', 'A', 'x')")
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    pg.query(strings.reduce((text, part, index) => `${text}$${index}${part}`), values).then((result) => result.rows)) as Sql
  const play = (id: string, title: string, artist: string, provider: string, playedAt: string, ms = 180_000) =>
    pg.query(
      "INSERT INTO plays (user_id, client_id, provider, track_id, title, artist, ms_played, played_at) VALUES (1, $1, $2, $3, $4, $5, $6, $7)",
      [id, provider, `${provider}:${title}`, title, artist, ms, playedAt],
    )
  return { sql, play }
}

const now = new Date("2026-10-07T12:00:00Z")

test("all time, asked as the player always has, counts everything", async () => {
  const { sql, play } = await database()
  await play("1", "Harbour Lights", "Night Tram", "YOUTUBE_MUSIC", "2025-01-10T20:00:00Z", 240_000)
  await play("2", "Harbour Lights", "Night Tram", "YOUTUBE_MUSIC", "2026-10-06T21:00:00Z", 240_000)
  await play("3", "Slow Ferry", "Morning Ferry", "BANDCAMP", "2026-10-07T08:00:00Z", 120_000)
  const stats = await listeningStats(sql, 1, { range: "all", offsetMinutes: 0, limit: 10, now })
  assert.equal(stats.streams, 3)
  assert.equal(stats.uniqueTracks, 2)
  assert.equal(stats.artists, 2)
  assert.equal(stats.msPlayed, 600_000)
  assert.equal(stats.firstPlay, "2025-01-10T20:00:00.000Z")
  assert.deepEqual(stats.topTracks[0], { title: "Harbour Lights", artist: "Night Tram", provider: "YOUTUBE_MUSIC", streams: 2, minutes: 8 })
  assert.deepEqual(stats.topArtists[0], { artist: "Night Tram", streams: 2, minutes: 8, tracks: 1 })
  assert.equal(stats.timeline.bucket, "month", "almost two years of days is drawn by the month")
  assert.equal(stats.timeline.points[0].start, "2025-01-01")
  assert.equal(stats.timeline.points.at(-1)?.start, "2026-10-01")
  assert.equal(stats.recent[0].title, "Slow Ferry")
})

test("a range leaves out what came before it, and every day of it is there", async () => {
  const { sql, play } = await database()
  await play("1", "Old", "Night Tram", "YOUTUBE_MUSIC", "2026-09-20T20:00:00Z")
  await play("2", "New", "Night Tram", "YOUTUBE_MUSIC", "2026-10-05T20:00:00Z")
  const week = await listeningStats(sql, 1, { range: "7d", offsetMinutes: 0, limit: 10, now })
  assert.equal(week.streams, 1)
  assert.equal(week.from, "2026-10-01T00:00:00.000Z", "today and the six days before it")
  assert.equal(week.timeline.bucket, "day")
  assert.deepEqual(week.timeline.points.map((p) => p.start), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"])
  assert.equal(week.timeline.points.find((p) => p.start === "2026-10-05")?.streams, 1)
  assert.equal(week.timeline.points.filter((p) => p.streams === 0).length, 6)
})

test("days and hours are the listener's own, not the server's", async () => {
  const { sql, play } = await database()
  // Half past eleven at night in New York is the next morning in UTC.
  await play("1", "Late", "Night Tram", "YOUTUBE_MUSIC", "2026-10-06T03:30:00Z")
  const utc = await listeningStats(sql, 1, { range: "7d", offsetMinutes: 0, limit: 10, now })
  const newYork = await listeningStats(sql, 1, { range: "7d", offsetMinutes: -240, limit: 10, now })
  assert.equal(utc.hourly[3].streams, 1)
  assert.equal(newYork.hourly[23].streams, 1)
  assert.equal(newYork.timeline.points.find((p) => p.start === "2026-10-05")?.streams, 1)
  // A Monday in New York, a Tuesday in UTC: ISO weekdays, Monday first.
  assert.equal(newYork.weekdays[0].streams, 1)
  assert.equal(utc.weekdays[1].streams, 1)
})

test("no listening at all is zeros and empty lists, not an error", async () => {
  const { sql } = await database()
  const stats = await listeningStats(sql, 1, { range: "30d", offsetMinutes: 60, limit: 10, now })
  assert.equal(stats.streams, 0)
  assert.equal(stats.firstPlay, null)
  assert.deepEqual(stats.topTracks, [])
  assert.equal(stats.timeline.points.length, 30)
  assert.equal(stats.hourly.length, 24)
  assert.equal(stats.weekdays.length, 7)
  assert.deepEqual(stats.streak, { current: 0, longest: 0 })
})

test("a streak runs to today, or to yesterday while today is still to come", () => {
  assert.deepEqual(streaks(["2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-07"), { current: 3, longest: 3 })
  assert.deepEqual(streaks(["2026-10-05", "2026-10-06"], "2026-10-07"), { current: 2, longest: 2 })
  assert.deepEqual(streaks(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-06"], "2026-10-07"), { current: 1, longest: 4 })
  assert.deepEqual(streaks(["2026-10-01"], "2026-10-07"), { current: 0, longest: 1 })
})

test("months are filled in as days are", () => {
  const filled = timeline([{ start: "2026-01-15", streams: 2, minutes: 6 }], "2025-09-20", "2026-03-02", null)
  assert.equal(filled.bucket, "month")
  assert.deepEqual(filled.points.map((p) => p.start), ["2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"])
  assert.equal(filled.points[4].streams, 2)
  // Under four months of days stays by the day.
  assert.equal(timeline([], "2025-11-20", "2026-03-02", null).bucket, "day")
})

test("what the request asks for is read forgivingly", () => {
  assert.equal(readRange("30d"), "30d")
  assert.equal(readRange("forever"), "all")
  assert.equal(readRange(null), "all")
  assert.equal(readOffset("-300"), -300)
  assert.equal(readOffset("100000"), 840)
  assert.equal(readOffset("abc"), 0)
  assert.equal(readLimit(null), 10)
  assert.equal(readLimit("500"), 50)
})
