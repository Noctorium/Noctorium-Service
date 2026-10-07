import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { NeonQueryFunction } from "@neondatabase/serverless"

/**
 * A Postgres of the service's own, in a folder on this computer, for running it with no Neon database at all.
 *
 * The statistics apps and the player are made against a service, and the live one holds real listeners'
 * accounts, which no test should be signing up to or filling with made-up listens. PGlite is Postgres compiled
 * to WebAssembly and run inside this process: the same SQL, the same types, nothing to install. Only ever
 * reached when NOCTORIUM_LOCAL_DB names a folder, which no deployment sets.
 *
 * It answers the two ways the code asks a question -- a tagged template, and `query(text, params)` -- with the
 * rows as plain objects, as the Neon driver does. The schema is applied the first time it is asked anything.
 */
export function localDb(folder: string): NeonQueryFunction<false, false> {
  type Pg = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; exec(text: string): Promise<unknown> }
  let ready: Promise<Pg> | null = null

  const open = (): Promise<Pg> =>
    (ready ??= (async () => {
      const { PGlite } = await import("@electric-sql/pglite")
      const pg = new PGlite(folder) as unknown as Pg
      await pg.exec(readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8"))
      return pg
    })())

  const run = async (text: string, params: unknown[] = []) => (await (await open()).query(text, params)).rows

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) =>
    run(strings.reduce((text, part, index) => `${text}$${index}${part}`), values)
  sql.query = (text: string, params?: unknown[]) => run(text, params ?? [])

  return sql as unknown as NeonQueryFunction<false, false>
}
