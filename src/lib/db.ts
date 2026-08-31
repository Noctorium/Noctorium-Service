import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

/**
 * The Neon connection.
 *
 * Its tagged-template form sends values as bound parameters, never as text spliced into the statement, so
 * a query written as ``sql`... where email_key = ${key}` `` is not open to injection. Where a statement has
 * to be assembled as a string instead, the values still go through `sql.query(text, params)`.
 *
 * The type parameters pin the result shape to plain row objects. Without them the driver's return type is
 * a union covering every mode it can be configured in, and each caller would have to assert its way out.
 *
 * Resolved on first use rather than at module load, so a missing variable surfaces as one failed request
 * with a clear message instead of a deployment that will not boot at all.
 */
let connection: NeonQueryFunction<false, false> | null = null

export function db(): NeonQueryFunction<false, false> {
  if (connection) return connection
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set; add it in the Vercel project settings.")
  connection = neon(url)
  return connection
}
