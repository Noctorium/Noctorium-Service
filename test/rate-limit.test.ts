import assert from "node:assert/strict"
import { test } from "node:test"
import {
  PER_ACCOUNT_SIGN_IN,
  PER_ADDRESS_SIGN_IN,
  PER_ADDRESS_SIGN_UP,
  bucket,
  callerAddress,
  tooManyAttempts,
} from "../src/lib/rate-limit.ts"

const withHeaders = (headers: Record<string, string>) => new Request("https://example.test/", { headers })

test("the caller's address is the first entry the proxy recorded", () => {
  // Later entries are the proxies themselves; the client is the one on the left.
  assert.equal(callerAddress(withHeaders({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" })), "203.0.113.7")
  assert.equal(callerAddress(withHeaders({ "x-forwarded-for": "  203.0.113.7  " })), "203.0.113.7")
})

test("x-real-ip stands in when there is no forwarded chain", () => {
  assert.equal(callerAddress(withHeaders({ "x-real-ip": "203.0.113.9" })), "203.0.113.9")
})

test("an address that cannot be read still gets a bucket rather than an exemption", () => {
  // Falling back to nothing would mean a caller could opt out of throttling by stripping the header.
  assert.equal(callerAddress(withHeaders({})), "unknown")
  assert.equal(callerAddress(withHeaders({ "x-forwarded-for": "" })), "unknown")
  assert.equal(callerAddress(withHeaders({ "x-forwarded-for": "  ,  " })), "unknown")
})

test("a bucket key never contains the value it stands for", () => {
  const key = bucket("login", "listener@example.com")

  assert.ok(!key.includes("listener"), "the address is recoverable from the key")
  assert.ok(!key.includes("example.com"))
  assert.match(key, /^login:[A-Za-z0-9_-]{32}$/)
})

test("the same value always lands in the same bucket", () => {
  assert.equal(bucket("login", "listener@example.com"), bucket("login", "listener@example.com"))
  // Case cannot be used to get a fresh allowance for the same account.
  assert.equal(bucket("login", "Listener@Example.COM"), bucket("login", "listener@example.com"))
})

test("different values, and different purposes, are counted apart", () => {
  assert.notEqual(bucket("login", "a@example.com"), bucket("login", "b@example.com"))
  // Signing in must not spend the allowance for signing up, or either could lock out the other.
  assert.notEqual(bucket("login", "a@example.com"), bucket("signup", "a@example.com"))
})

test("the limits are ordered the way the threats are", () => {
  // One account is the narrow target, so it gets the tightest allowance.
  assert.ok(PER_ACCOUNT_SIGN_IN.limit < PER_ADDRESS_SIGN_IN.limit)
  // An address may be a whole household, so it is looser but still finite.
  assert.ok(PER_ADDRESS_SIGN_IN.limit < 100)
  // Creating accounts is rarer than signing in, and is measured over a longer stretch.
  assert.ok(PER_ADDRESS_SIGN_UP.windowSeconds > PER_ADDRESS_SIGN_IN.windowSeconds)
  for (const limit of [PER_ACCOUNT_SIGN_IN, PER_ADDRESS_SIGN_IN, PER_ADDRESS_SIGN_UP]) {
    assert.ok(limit.limit > 0 && limit.windowSeconds > 0)
  }
})

test("a throttled caller is told to come back, and when", async () => {
  const reply = tooManyAttempts(90)

  assert.equal(reply.status, 429)
  assert.equal(reply.headers.get("Retry-After"), "90")
  assert.deepEqual(await reply.json(), { error: "Too many attempts. Try again in 2 minutes." })
})

test("the wait reads naturally at one minute", async () => {
  assert.deepEqual(await tooManyAttempts(30).json(), { error: "Too many attempts. Try again in 1 minute." })
})
