// Applies db/schema.sql to whatever DATABASE_URL points at.
//
// Runs as part of the build, where Vercel supplies the connection string. Every statement in the file is
// written to be repeatable, so applying it on each deploy is a no-op once the tables exist.
//
// A build with no DATABASE_URL is allowed through with a warning: a preview built before the database is
// attached should still build. A build that has one and cannot apply it fails loudly, because shipping a
// deployment whose schema is behind its code is worse than not shipping.
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
if (!url || url.includes("[SENSITIVE]")) {
  console.warn("apply-schema: no usable DATABASE_URL, skipping. Tables will not exist until this runs.")
  process.exit(0)
}

const sql = neon(url)
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")

const statements = schema
  .split(/;\s*$/m)
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0 && !statement.split("\n").every((line) => line.startsWith("--")))

for (const statement of statements) {
  const summary = statement.replace(/\s+/g, " ").slice(0, 68)
  try {
    await sql.query(statement)
    console.log(`apply-schema: ok   ${summary}`)
  } catch (error) {
    console.error(`apply-schema: FAILED  ${summary}`)
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
console.log(`apply-schema: applied ${statements.length} statements.`)
