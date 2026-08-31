import assert from "node:assert/strict"
import { test } from "node:test"
import { MAX_MS_PLAYED, PLAY_COLUMNS, buildPlaysInsert, readPlay, type Play } from "../src/lib/plays.ts"

const good = {
  clientId: "11111111-2222-3333-4444-555555555555",
  provider: "YOUTUBE_MUSIC",
  trackId: "7tLGGiNjp_U",
  title: "Antarctica",
  artist: "$uicideboy$",
  msPlayed: 127000,
  playedAt: "2026-08-31T12:00:00.000Z",
}

test("a well formed listen is accepted and normalised", () => {
  const play = readPlay({ ...good, title: "  Antarctica  " })
  assert.ok(play)
  assert.equal(play.title, "Antarctica")
  assert.equal(play.msPlayed, 127000)
  assert.equal(play.playedAt, "2026-08-31T12:00:00.000Z")
})

test("a listen missing anything essential is refused", () => {
  for (const field of ["clientId", "provider", "trackId", "title"]) {
    assert.equal(readPlay({ ...good, [field]: "" }), null, `accepted a blank ${field}`)
    assert.equal(readPlay({ ...good, [field]: undefined }), null, `accepted a missing ${field}`)
  }
  assert.equal(readPlay(null), null)
  assert.equal(readPlay([good]), null)
  assert.equal(readPlay("a play"), null)
})

test("a track with no credited artist is still a listen", () => {
  assert.equal(readPlay({ ...good, artist: "   " })?.artist, "Unknown artist")
  assert.equal(readPlay({ ...good, artist: undefined })?.artist, "Unknown artist")
})

test("an impossible duration is refused rather than summed into the hours", () => {
  assert.equal(readPlay({ ...good, msPlayed: -1 }), null)
  assert.equal(readPlay({ ...good, msPlayed: MAX_MS_PLAYED + 1 }), null)
  assert.equal(readPlay({ ...good, msPlayed: Number.NaN }), null)
  assert.equal(readPlay({ ...good, msPlayed: Number.POSITIVE_INFINITY }), null)
  assert.equal(readPlay({ ...good, msPlayed: "lots" }), null)
})

test("a listen from the future is refused", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z")
  // A clock a few minutes fast is tolerated; a clock set years ahead is not.
  assert.ok(readPlay({ ...good, playedAt: "2026-08-31T12:30:00.000Z" }, now))
  assert.equal(readPlay({ ...good, playedAt: "2027-01-01T00:00:00.000Z" }, now), null)
  assert.equal(readPlay({ ...good, playedAt: "not a date" }, now), null)
})

test("overlong text is refused rather than silently truncated into the wrong column", () => {
  assert.equal(readPlay({ ...good, trackId: "x".repeat(201) }), null)
  assert.equal(readPlay({ ...good, clientId: "x".repeat(101) }), null)
})

/**
 * The insert binds a batch through generated placeholders. An off-by-one does not fail loudly — it shifts
 * every value one column along, writing a title where an artist belongs. These pin the arithmetic down.
 */
test("one row binds exactly the columns it names, in order", () => {
  const { text, values } = buildPlaysInsert([readPlay(good) as Play], 42)
  assert.match(text, /\(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\)/)
  assert.deepEqual(values, [42, good.clientId, "YOUTUBE_MUSIC", "7tLGGiNjp_U", "Antarctica", "$uicideboy$", 127000, good.playedAt])
})

test("a batch numbers its placeholders continuously, with none repeated or skipped", () => {
  const plays = Array.from({ length: 5 }, (_, index) =>
    readPlay({ ...good, clientId: `id-${index}`, title: `Track ${index}` }) as Play,
  )
  const { text, values } = buildPlaysInsert(plays, 7)

  const width = PLAY_COLUMNS.length
  assert.equal(values.length, plays.length * width)
  const used = [...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))
  assert.deepEqual(used, Array.from({ length: plays.length * width }, (_, i) => i + 1))
})

test("every row in a batch keeps its own values against its own placeholders", () => {
  const plays = [
    readPlay({ ...good, clientId: "first", title: "First", artist: "A" }) as Play,
    readPlay({ ...good, clientId: "second", title: "Second", artist: "B" }) as Play,
  ]
  const { values } = buildPlaysInsert(plays, 9)
  const width = PLAY_COLUMNS.length

  // Row two's values must start exactly one row-width in; a drift here is the silent corruption.
  assert.equal(values[width + 1], "second")
  assert.equal(values[width + 4], "Second")
  assert.equal(values[width + 5], "B")
  assert.equal(values[1], "first")
  assert.equal(values[4], "First")
})

test("the statement never carries a value in its text", () => {
  const hostile = readPlay({ ...good, title: "'); DROP TABLE plays; --" }) as Play
  const { text, values } = buildPlaysInsert([hostile], 1)

  assert.ok(!text.includes("DROP TABLE"), "a value reached the statement text")
  assert.ok(values.includes("'); DROP TABLE plays; --"), "the value was not bound")
})

test("the placeholder width follows the column list, so the two cannot drift apart", () => {
  const { text } = buildPlaysInsert([readPlay(good) as Play], 1)
  const placeholders = [...text.matchAll(/\$\d+/g)].length
  assert.equal(placeholders, PLAY_COLUMNS.length)
  for (const column of PLAY_COLUMNS) assert.ok(text.includes(column), `${column} is not in the statement`)
})
