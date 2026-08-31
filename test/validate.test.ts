import assert from "node:assert/strict"
import { test } from "node:test"
import { checkPassword, cleanDisplayName, cleanEmail, emailKey } from "../src/lib/validate.ts"

test("real addresses are accepted and trimmed", () => {
  assert.equal(cleanEmail("  listener@example.com "), "listener@example.com")
  assert.equal(cleanEmail("a.b+tag@sub.example.co.uk"), "a.b+tag@sub.example.co.uk")
})

test("things that are not addresses are refused", () => {
  for (const bad of ["", "   ", "no-at-sign", "@example.com", "user@", "user@host", "a b@example.com", 42, null, undefined]) {
    assert.equal(cleanEmail(bad as unknown), null, `accepted ${JSON.stringify(bad)}`)
  }
})

test("an address longer than the standard allows is refused", () => {
  assert.equal(cleanEmail("x".repeat(250) + "@example.com"), null)
})

test("case cannot be used to register the same address twice", () => {
  assert.equal(emailKey("Listener@Example.COM"), "listener@example.com")
})

test("passwords are held to a length, at both ends", () => {
  assert.ok("error" in checkPassword("short"))
  assert.ok("error" in checkPassword(""))
  assert.ok("error" in checkPassword("x".repeat(201)))
  // An unbounded password would be a way to make the server hash megabytes on demand.
  assert.deepEqual(checkPassword("a-long-enough-one"), { password: "a-long-enough-one" })
})

test("a display name falls back rather than ending up blank", () => {
  assert.equal(cleanDisplayName("   ", "listener"), "listener")
  assert.equal(cleanDisplayName(undefined, "listener"), "listener")
  assert.equal(cleanDisplayName("  Two   Words ", "listener"), "Two Words")
  assert.equal(cleanDisplayName("x".repeat(80), "listener").length, 40)
})
