import { db } from "./db"
import type { Limit } from "./rate-limit"

/**
 * The stored side of throttling.
 *
 * Kept apart from the policy so that the limits, the bucket keys and the refusal can be tested without a
 * database anywhere near them; this file is the only part that needs one.
 */
export type Decision = { allowed: boolean; retryAfterSeconds: number }

/**
 * Counts one attempt against a bucket and says whether it is allowed.
 *
 * The increment and the reading are one statement, so two requests arriving together cannot both read the
 * count before either has written it and so both be let through.
 */
export async function consume(key: string, { limit, windowSeconds }: Limit): Promise<Decision> {
  const interval = `${windowSeconds} seconds`
  const rows = (await db().query(
    `INSERT INTO auth_attempts (bucket, window_started_at, attempts)
     VALUES ($1, now(), 1)
     ON CONFLICT (bucket) DO UPDATE SET
       attempts = CASE
         WHEN auth_attempts.window_started_at < now() - $2::interval THEN 1
         ELSE auth_attempts.attempts + 1
       END,
       window_started_at = CASE
         WHEN auth_attempts.window_started_at < now() - $2::interval THEN now()
         ELSE auth_attempts.window_started_at
       END
     RETURNING attempts, EXTRACT(EPOCH FROM (window_started_at + $2::interval - now()))::int AS retry_after`,
    [key, interval],
  )) as unknown as { attempts: number; retry_after: number }[]

  const row = rows[0]
  if (!row) return { allowed: true, retryAfterSeconds: 0 }
  return {
    allowed: Number(row.attempts) <= limit,
    retryAfterSeconds: Math.max(1, Number(row.retry_after) || windowSeconds),
  }
}

/**
 * Forgets a bucket.
 *
 * Called once a sign-in succeeds, so a few mistyped passwords before the right one do not leave someone
 * locked out of their own account.
 */
export async function forget(key: string): Promise<void> {
  await db()`DELETE FROM auth_attempts WHERE bucket = ${key}`
}
