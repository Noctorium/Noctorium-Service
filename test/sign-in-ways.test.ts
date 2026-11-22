import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

// A Postgres of its own, in a temporary folder, with the service's schema: the part worth checking is the SQL.
process.env.NOCTORIUM_LOCAL_DB = mkdtempSync(join(tmpdir(), "noctorium-signin-"))

const { signInWith, link, unlink, waysIn } = await import("../src/lib/identity.ts")
const { allowDevice, normalCode, newCode, pollDevice, startDeviceLogin } = await import("../src/lib/device.ts")
const { beginTelegramLogin, codeIsWaiting, collect, readUpdate, secretMatches, vouch, webhookSecret } = await import("../src/lib/telegram-login.ts")
const { db } = await import("../src/lib/db.ts")

test("a provider opens the account it is linked to, and a new one otherwise", async () => {
  const first = await signInWith({ provider: "discord", id: "d1", name: "Ana", email: "ana@example.com" })
  assert.equal(first.created, true)
  assert.equal(first.email, "ana@example.com")
  const again = await signInWith({ provider: "discord", id: "d1", name: "Ana B", email: "ana@example.com" })
  assert.equal(again.id, first.id)
  assert.equal(again.created, false)
})

test("accounts are never joined by a matching email", async () => {
  await db()`INSERT INTO users (email, email_key, display_name, password_hash) VALUES ('sam@example.com', 'sam@example.com', 'Sam', 'x')`
  const viaDiscord = await signInWith({ provider: "discord", id: "d9", name: "Sam?", email: "sam@example.com" })
  const [sam] = (await db()`SELECT id FROM users WHERE email_key = 'sam@example.com'`) as { id: number }[]
  assert.notEqual(viaDiscord.id, Number(sam.id), "Discord's word about an email opened somebody's account")
  assert.equal(viaDiscord.email, "", "the new account took an email another account has")
})

test("linking adds a way in; one already elsewhere is refused; the last way in stays", async () => {
  const user = await signInWith({ provider: "telegram", id: "t1", name: "Tea", email: null })
  assert.equal(await link(user.id, { provider: "discord", id: "d2", name: "tea", email: null }), "linked")
  assert.equal(await link(user.id, { provider: "discord", id: "d1", name: "Ana", email: null }), "taken")
  assert.deepEqual(Object.keys((await waysIn(user.id)).linked).sort(), ["discord", "telegram"])
  assert.equal(await unlink(user.id, "telegram"), "unlinked")
  assert.equal(await unlink(user.id, "discord"), "last", "the only way in was taken away")
  const viaDiscord = await signInWith({ provider: "discord", id: "d2", name: "tea", email: null })
  assert.equal(viaDiscord.id, user.id)
})

test("a device is signed in once, by the person who allowed it, and codes expire", async () => {
  const user = await signInWith({ provider: "telegram", id: "t2", name: "Dev", email: null })
  const { code, pollToken } = await startDeviceLogin()
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.deepEqual(await pollDevice(pollToken), { state: "pending" })
  assert.equal(await allowDevice(normalCode(code.toLowerCase().replace("-", " "))!, user.id), true)
  assert.equal(await allowDevice(code, user.id + 1), false, "a second person allowed the same code")
  assert.deepEqual(await pollDevice(pollToken), { state: "allowed", userId: user.id })
  assert.deepEqual(await pollDevice(pollToken), { state: "unknown" }, "the token was handed out twice")
  assert.deepEqual(await pollDevice("made-up"), { state: "unknown" })

  const late = await startDeviceLogin()
  await db()`UPDATE device_logins SET expires_at = now() - interval '1 second' WHERE code = ${late.code}`
  assert.equal(await allowDevice(late.code, user.id), false)
  assert.deepEqual(await pollDevice(late.pollToken), { state: "expired" })
})

test("codes are read however they are typed, and nothing else is a code", () => {
  for (let i = 0; i < 50; i++) {
    const code = newCode()
    assert.equal(normalCode(code), code)
  }
  assert.equal(normalCode("abcd efgh"), "ABCD-EFGH")
  assert.equal(normalCode("ABCD-EFG0"), null, "a zero, which codes never have")
  assert.equal(normalCode("short"), null)
})

test("Telegram's updates are read for a start code and a confirmation, and nothing else", () => {
  const from = { id: 4242, first_name: "Ana", username: "ana" }
  assert.deepEqual(readUpdate({ message: { text: "/start Abc_12-x", chat: { id: 7, type: "private" }, from } }), { kind: "start", chat: 7, code: "Abc_12-x" })
  assert.deepEqual(readUpdate({ message: { text: "/start", chat: { id: 7, type: "private" }, from } }), { kind: "start", chat: 7, code: null })
  assert.equal(readUpdate({ message: { text: "/start x", chat: { id: -5, type: "group" }, from } }).kind, "other", "a group chat signed somebody in")
  assert.equal(readUpdate({ message: { text: "/start x", chat: { id: 7, type: "private" }, from: { ...from, is_bot: true } } }).kind, "other")
  assert.equal(readUpdate({ message: { text: "hello", chat: { id: 7, type: "private" }, from } }).kind, "other")
  const confirm = readUpdate({ callback_query: { id: "q", data: "ok:code1", from, message: { message_id: 3, chat: { id: 7 } } } })
  assert.deepEqual(confirm, { kind: "confirm", code: "code1", profile: { provider: "telegram", id: "4242", name: "Ana", email: null }, callback: "q", chat: 7, message: 3 })
  assert.equal(readUpdate(null).kind, "other")
})

test("only Telegram, knowing the bot's token, gets past the webhook", () => {
  const token = "123456:TEST-token"
  assert.ok(secretMatches(webhookSecret(token), token))
  assert.equal(secretMatches(webhookSecret("999:other"), token), false)
  assert.equal(secretMatches(null, token), false)
  assert.match(webhookSecret(token), /^[A-Za-z0-9_-]{1,256}$/, "Telegram refuses a secret with other characters")
})

test("a Telegram sign-in waits for Confirm, then opens once, only for the browser holding the poll secret", async () => {
  const { code, pollToken } = await beginTelegramLogin("signin", "/dashboard")
  assert.ok(await codeIsWaiting(code))
  assert.deepEqual(await collect(pollToken, true), { state: "pending" })
  assert.deepEqual(await collect("somebody-else", true), { state: "unknown" })
  const ana = { provider: "telegram" as const, id: "4242", name: "Ana", email: null }
  assert.ok(await vouch(code, ana))
  assert.equal(await vouch(code, { ...ana, id: "6666" }), false, "a second confirmation replaced the first")
  assert.equal(await codeIsWaiting(code), false)
  assert.deepEqual(await collect(pollToken, false), { state: "confirmed", profile: ana, intent: "signin", next: "/dashboard" })
  assert.equal((await collect(pollToken, true)).state, "confirmed")
  assert.deepEqual(await collect(pollToken, true), { state: "unknown" }, "the same sign-in opened twice")
})
