import assert from "node:assert/strict"
import { test } from "node:test"

const SECRET = "a-test-secret-that-is-long-enough-to-pass"

async function load() {
  process.env.AUTH_SECRET = SECRET
  return await import("../src/lib/connect-key.ts")
}

test("the same account gets the same key every time", async () => {
  const { connectKeyFor } = await load()
  // This is the whole feature: two devices signed in to one account must derive the same secret without
  // ever comparing notes.
  assert.equal(connectKeyFor(42), connectKeyFor(42))
})

test("different accounts get different keys", async () => {
  const { connectKeyFor } = await load()
  assert.notEqual(connectKeyFor(42), connectKeyFor(43))
})

test("the key is not the signing secret, nor derived without separation", async () => {
  const { connectKeyFor } = await load()
  const key = connectKeyFor(42)
  assert.ok(!key.includes(SECRET), "the key exposes AUTH_SECRET")

  // The same secret signs session tokens. Deriving this from the bare user id would be a second use of
  // one key for two purposes; the domain separator is what keeps them apart, so check it is really there.
  const { createHmac } = await import("node:crypto")
  const undomained = createHmac("sha256", SECRET).update("42").digest("base64url")
  assert.notEqual(key, undomained)
})

test("the key is url-safe, so it survives being carried anywhere", async () => {
  const { connectKeyFor } = await load()
  assert.match(connectKeyFor(7), /^[A-Za-z0-9_-]+$/)
})

test("a missing or short AUTH_SECRET is refused rather than defaulted", async () => {
  process.env.AUTH_SECRET = SECRET
  const { connectKeyFor } = await import("../src/lib/connect-key.ts")

  process.env.AUTH_SECRET = ""
  assert.throws(() => connectKeyFor(1), /AUTH_SECRET/)

  process.env.AUTH_SECRET = "too-short"
  assert.throws(() => connectKeyFor(1), /AUTH_SECRET/)

  process.env.AUTH_SECRET = SECRET
})
