import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

process.env.NOCTORIUM_LOCAL_DB = mkdtempSync(join(tmpdir(), "noctorium-scrobblers-"))
process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-hs256"

const { seal, unseal, link, unlink, linked, lastFmSignature, linkState, scrobbleCounts, readSong } = await import("../src/lib/scrobblers.ts")
const { db } = await import("../src/lib/db.ts")

test("a sealed secret opens again, and is not the secret as written", () => {
  const sealed = seal("session-key-123")
  assert.equal(unseal(sealed), "session-key-123")
  assert.ok(!sealed.includes("session-key-123"))
  assert.notEqual(seal("session-key-123"), sealed, "the same secret sealed twice looked the same")
  assert.equal(unseal(sealed.slice(0, -2) + "AA"), null, "a tampered seal opened")
})

test("Last.fm's signature is the parameters sorted by name, then the secret, as MD5", () => {
  const expected = createHash("md5").update("api_keykmethodauth.getSessiontokents").digest("hex")
  assert.equal(lastFmSignature({ token: "t", method: "auth.getSession", api_key: "k" }, "s"), expected)
})

test("links are kept sealed, replaced by a newer one, and taken off", async () => {
  const [user] = (await db()`INSERT INTO users (email, email_key, display_name, password_hash) VALUES ('s@example.com', 's@example.com', 'S', 'x') RETURNING id`) as { id: number }[]
  const id = Number(user.id)
  await link(id, "lastfm", "ana", "sk-1")
  await link(id, "lastfm", "ana2", "sk-2")
  await link(id, "listenbrainz", "ana_lb", "lb-token")
  const [row] = (await db()`SELECT secret FROM scrobblers WHERE user_id = ${id} AND site = 'lastfm'`) as { secret: string }[]
  assert.ok(!row.secret.includes("sk-2"), "the session key was kept as written")
  assert.deepEqual((await linked(id)).sort((a, b) => a.site.localeCompare(b.site)), [
    { site: "lastfm", username: "ana2", secret: "sk-2" },
    { site: "listenbrainz", username: "ana_lb", secret: "lb-token" },
  ])
  await unlink(id, "lastfm")
  assert.deepEqual((await linked(id)).map((l) => l.site), ["listenbrainz"])
})

test("Last.fm's answer can only link the account that asked, before it lapses", () => {
  const state = linkState(7, 2_000_000_000)
  assert.equal(linkState(7, 2_000_000_000), state)
  assert.notEqual(linkState(8, 2_000_000_000), state, "another account's state matched")
})

test("a listen scrobbles as Last.fm counts it: songs over half a minute, half or four minutes heard", () => {
  assert.equal(scrobbleCounts(100_000, 200_000), true)
  assert.equal(scrobbleCounts(99_999, 200_000), false)
  assert.equal(scrobbleCounts(240_000, 1_200_000), true, "a long song needs only four minutes")
  assert.equal(scrobbleCounts(30_000, 30_000), false, "a half-minute song is too short for Last.fm")
  assert.equal(scrobbleCounts(500_000, 0), false, "a song of unknown length is not scrobbled")
})

test("a song is read only with a title and an artist", () => {
  assert.deepEqual(readSong({ title: " Song ", artist: "A", durationMs: 200_000, album: "" }), {
    title: "Song", artist: "A", album: undefined, durationMs: 200_000, url: undefined,
  })
  assert.equal(readSong({ title: "Song" }), null)
  assert.equal(readSong(null), null)
})
