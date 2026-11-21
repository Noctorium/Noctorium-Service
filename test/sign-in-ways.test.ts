import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

// A Postgres of its own, in a temporary folder, with the service's schema: the part worth checking is the SQL.
process.env.NOCTORIUM_LOCAL_DB = mkdtempSync(join(tmpdir(), "noctorium-signin-"))

const { signInWith, link, unlink, waysIn } = await import("../src/lib/identity.ts")
const { allowDevice, normalCode, newCode, pollDevice, startDeviceLogin } = await import("../src/lib/device.ts")
const { telegramProfile } = await import("../src/lib/telegram-login.ts")
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
  const viaGitHub = await signInWith({ provider: "github", id: "g9", name: "Sam?", email: "sam@example.com" })
  const [sam] = (await db()`SELECT id FROM users WHERE email_key = 'sam@example.com'`) as { id: number }[]
  assert.notEqual(viaGitHub.id, Number(sam.id), "GitHub's word about an email opened somebody's account")
  assert.equal(viaGitHub.email, "", "the new account took an email another account has")
})

test("linking adds a way in; one already elsewhere is refused; the last way in stays", async () => {
  const user = await signInWith({ provider: "telegram", id: "t1", name: "Tea", email: null })
  assert.equal(await link(user.id, { provider: "github", id: "g1", name: "tea", email: null }), "linked")
  assert.equal(await link(user.id, { provider: "discord", id: "d1", name: "Ana", email: null }), "taken")
  assert.deepEqual(Object.keys((await waysIn(user.id)).linked).sort(), ["github", "telegram"])
  assert.equal(await unlink(user.id, "telegram"), "unlinked")
  assert.equal(await unlink(user.id, "github"), "last", "the only way in was taken away")
  const viaGitHub = await signInWith({ provider: "github", id: "g1", name: "tea", email: null })
  assert.equal(viaGitHub.id, user.id)
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

test("Telegram's login is accepted only with Telegram's signature, and only for a day", () => {
  const botToken = "123456:TEST-token"
  const now = 1_800_000_000_000
  const fields = { id: "4242", first_name: "Ana", username: "ana", auth_date: String(now / 1000 - 60) }
  const check = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n")
  const hash = createHmac("sha256", createHash("sha256").update(botToken).digest()).update(check).digest("hex")
  const signed = new URLSearchParams({ ...fields, hash, intent: "signin", next: "/dashboard" })
  assert.deepEqual(telegramProfile(signed, botToken, now), { provider: "telegram", id: "4242", name: "Ana", email: null })

  const tampered = new URLSearchParams(signed)
  tampered.set("id", "1")
  assert.equal(telegramProfile(tampered, botToken, now), null)
  assert.equal(telegramProfile(signed, "999:other-bot", now), null)
  assert.equal(telegramProfile(signed, botToken, now + 2 * 86_400_000), null, "a day-old login was accepted")
})
