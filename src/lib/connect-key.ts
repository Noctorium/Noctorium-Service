import { createHmac } from "node:crypto"

/**
 * The shared secret two of a listener's own devices use to recognise each other on a local network.
 *
 * Derived rather than stored. Every device signed in to the same account asks for this and gets the same
 * answer, which is exactly what is needed: it lets a phone and a desktop prove to each other that they
 * belong to the same person without either of them ever talking to this service again, and without a
 * secret for it having to exist in the database at all. Nothing is written, so nothing can leak from a
 * table, and revoking it is a matter of rotating AUTH_SECRET.
 *
 * The domain separator matters. AUTH_SECRET also signs session tokens, and a key derived from it without
 * one would be a second use of the same secret whose outputs could, in principle, be made to collide with
 * the first. "spiceity-connect-key:v1" makes this derivation its own thing, and carries a version so a
 * future change can be rolled out without every paired device breaking at once.
 */
export function connectKeyFor(userId: number): string {
  const secret = process.env.AUTH_SECRET
  // The same refusal as session signing: a default here would hand every listener the same key, which is
  // to say no key at all, and would let anyone on a network take over anyone else's playback.
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is missing or too short; set it to at least 32 random characters.")
  }
  return createHmac("sha256", secret).update(`spiceity-connect-key:v1:${userId}`).digest("base64url")
}
