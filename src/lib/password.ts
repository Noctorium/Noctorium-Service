import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto"
import { promisify } from "node:util"

// promisify picks the shortest overload, which drops the options argument the cost parameters travel in.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

/**
 * Password hashing, using scrypt from Node's own crypto.
 *
 * scrypt is deliberately slow and memory-hard, which is what makes a stolen table of hashes expensive to
 * attack. It ships with Node, so there is no native module to fail to build on Vercel.
 *
 * The parameters are stored alongside each hash rather than assumed. Raising the cost later must not
 * invalidate every password already set, and a hash that carries its own parameters can still be verified
 * by a newer deployment that hashes new passwords more expensively.
 */
const FORMAT = "scrypt"
const COST = 16384 // N: the work factor, the dominant term in both time and memory.
const BLOCK_SIZE = 8 // r
const PARALLELISM = 1 // p
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Node's default cap is too small for these parameters; N * r * 128 is the memory scrypt actually wants. */
const MEMORY = COST * BLOCK_SIZE * 256

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MEMORY,
  }))
  return [FORMAT, COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64url"), derived.toString("base64url")].join("$")
}

/**
 * Whether a password matches a stored hash.
 *
 * Never throws on a malformed or unrecognised hash — it simply does not match. An exception here would
 * separate "this account is broken" from "wrong password" for anyone probing the endpoint.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== FORMAT) return false

  const cost = Number(parts[1])
  const blockSize = Number(parts[2])
  const parallelism = Number(parts[3])
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) return false
  // A hash claiming absurd parameters would be a denial of service against our own process.
  if (cost < 1024 || cost > 1048576 || blockSize < 1 || blockSize > 64 || parallelism < 1 || parallelism > 16) {
    return false
  }

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], "base64url")
    expected = Buffer.from(parts[5], "base64url")
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  try {
    const derived = (await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: cost * blockSize * 256,
    }))
    // Constant time: a byte-by-byte comparison leaks how much of the hash was guessed correctly.
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
