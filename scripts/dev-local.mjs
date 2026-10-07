// Runs the service on this computer with a database of its own, for making the apps and the player against it.
//
// The live service holds real listeners' accounts; nothing being made should sign up to it or fill it with
// made-up listens. This keeps a PGlite database in .local/db (see src/lib/local-db.ts) and a signing secret in
// .local/secret, both made on first run and both ignored by git, then starts `next dev` on PORT, 3000 unless set.
// `npm run seed:local` then gives it an account with a year and more of listening in it.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { join } from "node:path"

const folder = join(process.cwd(), ".local")
mkdirSync(folder, { recursive: true })
const secretFile = join(folder, "secret")
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(48).toString("base64url"))

const env = {
  ...process.env,
  NOCTORIUM_LOCAL_DB: join(folder, "db"),
  AUTH_SECRET: readFileSync(secretFile, "utf8").trim(),
}
delete env.DATABASE_URL

const port = process.env.PORT ?? "3000"
const next = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "dev", "-p", port], {
  env,
  stdio: "inherit",
})
next.on("exit", (code) => process.exit(code ?? 0))
