// Applies db/schema.sql to whatever DATABASE_URL points at. Run once after creating the Neon database,
// and again after any change to the schema file; every statement in it is written to be repeatable.
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.")
  process.exit(1)
}

const sql = neon(url)
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")

// The driver sends one statement per call, so the file is split on the semicolons that end statements.
const statements = schema
  .split(/;\s*$/m)
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0 && !statement.split("\n").every((line) => line.startsWith("--")))

for (const statement of statements) {
  const summary = statement.replace(/\s+/g, " ").slice(0, 70)
  process.stdout.write(`  ${summary}...`)
  await sql.query(statement)
  console.log(" ok")
}
console.log(`\nApplied ${statements.length} statements.`)
