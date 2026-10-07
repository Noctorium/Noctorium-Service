/**
 * A listener's statistics: what the website's dashboard, the player and the statistics apps all read.
 *
 * Counted from the play rows every time rather than kept as running totals -- totals that are maintained drift
 * the first time a write is lost or replayed and then stay wrong, and a count is only ever as wrong as the rows.
 *
 * Asked without a range, it answers as it always has, over everything, so the player's account page reads the
 * same. A range narrows every part of it but the streak, which is about the listener's whole history. Days,
 * hours and weekdays are the listener's own, from the offset the app sends, rather than the server's UTC: a
 * song at eleven at night belongs to that evening, not to the next morning in London.
 */

export type Range = "7d" | "30d" | "90d" | "365d" | "all"

/** How many days back each range reaches; all of it for "all". */
export const RANGE_DAYS: Record<Range, number | null> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365, all: null }

export function readRange(value: string | null): Range {
  return value && value in RANGE_DAYS ? (value as Range) : "all"
}

/** Minutes east of UTC, as the app's clock has them; nothing past the furthest real time zones. */
export function readOffset(value: string | null): number {
  const minutes = value ? Number(value) : 0
  return Number.isInteger(minutes) ? Math.max(-840, Math.min(840, minutes)) : 0
}

/** How many rows the top lists hold: ten unless asked, never more than fifty. */
export function readLimit(value: string | null): number {
  const limit = value ? Number(value) : NaN
  return Number.isInteger(limit) ? Math.max(1, Math.min(50, limit)) : 10
}

/** Both ways the database is asked: a tagged template with bound values, and a statement with parameters. */
export type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
}

const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10
const minutes = (ms: number) => Math.round(ms / 60_000)
const iso = (value: unknown): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
/** A day as YYYY-MM-DD, from whatever the driver hands back for a date or a timestamp. */
const day = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

export type Point = { start: string; streams: number; minutes: number }

export type Stats = {
  range: Range
  from: string | null
  streams: number
  uniqueTracks: number
  artists: number
  msPlayed: number
  hours: number
  firstPlay: string | null
  lastPlay: string | null
  byProvider: { provider: string; streams: number; hours: number }[]
  topTracks: { title: string; artist: string; provider: string; streams: number; minutes: number }[]
  topArtists: { artist: string; streams: number; minutes: number; tracks: number }[]
  timeline: { bucket: "day" | "month"; points: Point[] }
  hourly: { hour: number; streams: number; minutes: number }[]
  weekdays: { day: number; streams: number; minutes: number }[]
  recent: { title: string; artist: string; provider: string; playedAt: string; msPlayed: number }[]
  streak: { current: number; longest: number }
}

export async function listeningStats(
  sql: Sql,
  userId: number,
  options: { range: Range; offsetMinutes: number; limit: number; now?: Date },
): Promise<Stats> {
  const { range, offsetMinutes: offset, limit } = options
  const now = options.now ?? new Date()
  const days = RANGE_DAYS[range]
  // The start of the listener's own day that many days ago, so "7 days" is today and the six before it.
  const localToday = startOfLocalDay(now, offset)
  const from = days == null ? null : new Date(localToday.getTime() - (days - 1) * 86_400_000 - offset * 60_000)
  const since = (from ?? new Date(0)).toISOString()

  const [totals] = (await sql`
    SELECT
      COUNT(*)::bigint                             AS streams,
      COUNT(DISTINCT (provider, track_id))::bigint AS unique_tracks,
      COALESCE(SUM(ms_played), 0)::bigint          AS ms_played,
      COUNT(DISTINCT artist)::bigint               AS artists,
      MIN(played_at)                               AS first_play,
      MAX(played_at)                               AS last_play
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
  `) as Record<string, unknown>[]

  const byProvider = await sql`
    SELECT provider, COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY provider ORDER BY streams DESC
  `

  const topTracks = await sql`
    SELECT title, artist, provider, COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY title, artist, provider ORDER BY streams DESC, title ASC LIMIT ${limit}
  `

  const topArtists = await sql`
    SELECT artist, COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played,
           COUNT(DISTINCT (provider, track_id))::bigint AS tracks
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY artist ORDER BY streams DESC, artist ASC LIMIT ${limit}
  `

  // The listener's own clock: the stored instant moved by their offset, then read as a plain time.
  const daily = await sql`
    SELECT date_trunc('day', (played_at AT TIME ZONE 'UTC') + ${offset}::int * interval '1 minute')::date AS day,
           COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY 1 ORDER BY 1
  `

  const hourly = await sql`
    SELECT EXTRACT(HOUR FROM (played_at AT TIME ZONE 'UTC') + ${offset}::int * interval '1 minute')::int AS hour,
           COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY 1
  `

  const weekdays = await sql`
    SELECT EXTRACT(ISODOW FROM (played_at AT TIME ZONE 'UTC') + ${offset}::int * interval '1 minute')::int AS day,
           COUNT(*)::bigint AS streams, COALESCE(SUM(ms_played), 0)::bigint AS ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    GROUP BY 1
  `

  const recent = await sql`
    SELECT title, artist, provider, played_at, ms_played
    FROM plays WHERE user_id = ${userId} AND played_at >= ${since}::timestamptz
    ORDER BY played_at DESC LIMIT 30
  `

  // The streak is about the listener, not the range: every day they listened, ever.
  const listened = await sql`
    SELECT DISTINCT date_trunc('day', (played_at AT TIME ZONE 'UTC') + ${offset}::int * interval '1 minute')::date AS day
    FROM plays WHERE user_id = ${userId}
  `

  const msPlayed = Number(totals.ms_played)
  const dailyPoints = daily.map((row) => ({ start: day(row.day), streams: Number(row.streams), minutes: minutes(Number(row.ms_played)) }))
  const firstDay = days == null ? dailyPoints[0]?.start ?? null : day(new Date(localToday.getTime() - (days - 1) * 86_400_000))

  return {
    range,
    from: iso(from),
    streams: Number(totals.streams),
    uniqueTracks: Number(totals.unique_tracks),
    artists: Number(totals.artists),
    msPlayed,
    hours: hours(msPlayed),
    firstPlay: iso(totals.first_play),
    lastPlay: iso(totals.last_play),
    byProvider: byProvider.map((row) => ({
      provider: String(row.provider),
      streams: Number(row.streams),
      hours: hours(Number(row.ms_played)),
    })),
    topTracks: topTracks.map((row) => ({
      title: String(row.title),
      artist: String(row.artist),
      provider: String(row.provider),
      streams: Number(row.streams),
      minutes: minutes(Number(row.ms_played)),
    })),
    topArtists: topArtists.map((row) => ({
      artist: String(row.artist),
      streams: Number(row.streams),
      minutes: minutes(Number(row.ms_played)),
      tracks: Number(row.tracks),
    })),
    timeline: timeline(dailyPoints, firstDay, day(localToday), days),
    hourly: Array.from({ length: 24 }, (_, hour) => {
      const row = hourly.find((r) => Number(r.hour) === hour)
      return { hour, streams: Number(row?.streams ?? 0), minutes: minutes(Number(row?.ms_played ?? 0)) }
    }),
    weekdays: Array.from({ length: 7 }, (_, index) => {
      const row = weekdays.find((r) => Number(r.day) === index + 1)
      return { day: index + 1, streams: Number(row?.streams ?? 0), minutes: minutes(Number(row?.ms_played ?? 0)) }
    }),
    recent: recent.map((row) => ({
      title: String(row.title),
      artist: String(row.artist),
      provider: String(row.provider),
      playedAt: iso(row.played_at) ?? "",
      msPlayed: Number(row.ms_played),
    })),
    streak: streaks(listened.map((row) => day(row.day)), day(localToday)),
  }
}

/** Midnight of the listener's day containing [now], as the UTC instant of that local midnight, shifted back. */
function startOfLocalDay(now: Date, offsetMinutes: number): Date {
  const local = new Date(now.getTime() + offsetMinutes * 60_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
}

/**
 * Every day of the range, the quiet ones included, so a chart has no gaps that look like a broken axis; and by
 * month rather than by day once there are more than about four months of them, which no chart shows legibly.
 */
export function timeline(points: Point[], firstDay: string | null, today: string, days: number | null): Stats["timeline"] {
  if (!firstDay) return { bucket: "day", points: [] }
  const start = new Date(`${firstDay}T00:00:00Z`)
  const end = new Date(`${today}T00:00:00Z`)
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const byDay = new Map(points.map((point) => [point.start, point]))
  if ((days ?? span) <= 120) {
    const filled: Point[] = []
    for (let at = start.getTime(); at <= end.getTime(); at += 86_400_000) {
      const key = new Date(at).toISOString().slice(0, 10)
      filled.push(byDay.get(key) ?? { start: key, streams: 0, minutes: 0 })
    }
    return { bucket: "day", points: filled }
  }
  const months = new Map<string, Point>()
  for (let at = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1); at <= end.getTime(); ) {
    const date = new Date(at)
    const key = `${date.toISOString().slice(0, 7)}-01`
    months.set(key, { start: key, streams: 0, minutes: 0 })
    at = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  for (const point of points) {
    const month = months.get(`${point.start.slice(0, 7)}-01`)
    if (month) {
      month.streams += point.streams
      month.minutes += point.minutes
    }
  }
  return { bucket: "month", points: [...months.values()] }
}

/**
 * Days in a row with something played: the run up to today -- or up to yesterday, since a day not yet listened
 * to has not broken anything -- and the longest there has ever been.
 */
export function streaks(listenedDays: string[], today: string): { current: number; longest: number } {
  const set = new Set(listenedDays)
  const sorted = [...set].sort()
  let longest = 0
  let run = 0
  let previous: number | null = null
  for (const key of sorted) {
    const at = Date.parse(`${key}T00:00:00Z`)
    run = previous != null && at - previous === 86_400_000 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = at
  }
  const dayBefore = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  let cursor = set.has(today) ? today : dayBefore(today)
  let current = 0
  while (set.has(cursor)) {
    current++
    cursor = dayBefore(cursor)
  }
  return { current, longest }
}
