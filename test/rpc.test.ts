import assert from "node:assert/strict"
import { test } from "node:test"

async function load() {
  process.env.RPC_SECRET = "a-test-rpc-secret-that-is-long-enough-to-pass"
  return await import("../src/lib/rpc.ts")
}

test("a ticket names its user, for its service and purpose only", async () => {
  const { ticketFor, readTicket } = await load()
  const ticket = ticketFor(42, "discord", "connect")
  assert.equal(readTicket(ticket, "discord", "connect"), 42)
  assert.equal(readTicket(ticket, "telegram", "connect"), null, "a Discord ticket opened Telegram")
  assert.equal(readTicket(ticket, "discord", "disconnect"), null, "a connect ticket disconnected")
})

test("a ticket expires after ten minutes, and cannot be altered", async () => {
  const { ticketFor, readTicket } = await load()
  const issued = Date.now()
  const ticket = ticketFor(42, "telegram", "connect", issued)
  assert.equal(readTicket(ticket, "telegram", "connect", issued + 9 * 60_000), 42)
  assert.equal(readTicket(ticket, "telegram", "connect", issued + 11 * 60_000), null)
  const [payload, signature] = ticket.split(".")
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), u: 43 })).toString("base64url")
  assert.equal(readTicket(`${forged}.${signature}`, "telegram", "connect", issued), null, "a forged user id was accepted")
})

test("now-playing is cleaned: titles required, lengths bounded, only https links", async () => {
  const { readNowPlaying } = await load()
  assert.equal(readNowPlaying(null), null)
  assert.equal(readNowPlaying({ artist: "nobody" }), null)
  const track = readNowPlaying({ title: "x".repeat(500), artist: "A", artworkUrl: "http://insecure/a.jpg", url: "https://music.youtube.com/watch?v=1", durationMs: -5 })
  assert.equal(track?.title.length, 200)
  assert.equal(track?.artworkUrl, undefined)
  assert.equal(track?.url, "https://music.youtube.com/watch?v=1")
  assert.equal(track?.durationMs, undefined)
})
