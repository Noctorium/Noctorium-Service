import assert from "node:assert/strict"
import { test } from "node:test"
import { hashPassword, verifyPassword } from "../src/lib/password.ts"

test("a password verifies against its own hash", async () => {
  const hash = await hashPassword("correct horse battery staple")
  assert.equal(await verifyPassword("correct horse battery staple", hash), true)
})

test("a wrong password does not verify", async () => {
  const hash = await hashPassword("correct horse battery staple")
  assert.equal(await verifyPassword("correct horse battery stapl", hash), false)
  assert.equal(await verifyPassword("", hash), false)
})

test("the password itself never appears in what is stored", async () => {
  const password = "a-very-memorable-secret"
  const hash = await hashPassword(password)
  assert.ok(!hash.includes(password), "the stored hash contains the password")
})

test("the same password hashes differently every time", async () => {
  // A shared salt would let one cracked password expose everyone who chose the same one.
  const [first, second] = [await hashPassword("same input"), await hashPassword("same input")]
  assert.notEqual(first, second)
  assert.equal(await verifyPassword("same input", first), true)
  assert.equal(await verifyPassword("same input", second), true)
})

test("the stored form carries the parameters it was made with", async () => {
  const hash = await hashPassword("whatever")
  const [format, cost, blockSize, parallelism, salt, digest] = hash.split("$")
  assert.equal(format, "scrypt")
  assert.equal(Number(cost), 16384)
  assert.equal(Number(blockSize), 8)
  assert.equal(Number(parallelism), 1)
  assert.ok(salt.length > 0 && digest.length > 0)
})

test("a hash made with different parameters still verifies", async () => {
  // Raising the cost later must not lock out everyone who set a password before the change.
  const cheap = "scrypt$1024$8$1$" + Buffer.from("0123456789abcdef").toString("base64url") + "$"
  const { scrypt } = await import("node:crypto")
  const derived: Buffer = await new Promise((resolve, reject) =>
    scrypt("legacy password", Buffer.from("0123456789abcdef"), 64, { N: 1024, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  )
  const stored = cheap + derived.toString("base64url")
  assert.equal(await verifyPassword("legacy password", stored), true)
  assert.equal(await verifyPassword("wrong", stored), false)
})

test("a malformed hash is a mismatch, never a crash", async () => {
  for (const bad of ["", "nonsense", "scrypt$x$y$z$a$b", "bcrypt$16384$8$1$aa$bb", "scrypt$16384$8$1$$", "$$$$$"]) {
    assert.equal(await verifyPassword("anything", bad), false, `threw or matched on ${JSON.stringify(bad)}`)
  }
})

test("absurd parameters are refused instead of exhausting the process", async () => {
  // A hash claiming a colossal cost would otherwise be a way to stall the server by trying to log in.
  const hostile = "scrypt$1073741824$64$16$aaaa$bbbb"
  const started = Date.now()
  assert.equal(await verifyPassword("anything", hostile), false)
  assert.ok(Date.now() - started < 2000, "spent real work on a hostile hash")
})

test("unicode passwords are treated consistently", async () => {
  // The same characters typed in a different normal form should still sign the person in.
  const composed = "café-pass-phrase"
  const decomposed = "café-pass-phrase"
  const hash = await hashPassword(composed)
  assert.equal(await verifyPassword(decomposed, hash), true)
})
