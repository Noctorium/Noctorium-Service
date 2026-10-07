import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { localDb } from "./local-db"

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
  // A computer with no Neon database: a Postgres of its own in a folder, for running the service and the apps
  // against it while they are made. Never set on a deployment; see localDb.
  const local = process.env.NOCTORIUM_LOCAL_DB
  if (local) return (connection = localDb(local))
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set; add it in the Vercel project settings.")
  connection = neon(url)
  return connection
}
