import { db } from "@/lib/db"
import { MAX_BATCH, buildPlaysInsert, readPlay, type Play } from "@/lib/plays"
import { currentSession } from "@/lib/session"
import { jsonError, readJson } from "@/lib/validate"

export const runtime = "nodejs"

/**
 * Records listens.
 *
 * Each carries an id the player made up, and the table refuses a repeat of one. That makes sending the
 * same batch twice harmless, which matters because the player cannot tell a reply that never arrived from
 * one that never happened, and its only safe move is to send again.
 */
export async function POST(request: Request) {
  const session = await currentSession(request)
  if (!session) return jsonError("Not signed in.", 401)

  const body = await readJson(request)
  if (!body) return jsonError("Send a JSON body.", 400)

  const submitted = Array.isArray(body.plays) ? body.plays : [body]
  if (submitted.length === 0) return Response.json({ accepted: 0, duplicates: 0, rejected: 0 })
  if (submitted.length > MAX_BATCH) return jsonError(`Send at most ${MAX_BATCH} plays at a time.`, 413)

  const plays: Play[] = []
  let rejected = 0
  for (const candidate of submitted) {
    const play = readPlay(candidate)
    if (play) plays.push(play)
    else rejected += 1
  }
  if (plays.length === 0) return Response.json({ accepted: 0, duplicates: 0, rejected }, { status: 400 })

  const insert = buildPlaysInsert(plays, session.userId)
  const inserted = await db().query(insert.text, insert.values)

  const accepted = Array.isArray(inserted) ? inserted.length : 0
  return Response.json({ accepted, duplicates: plays.length - accepted, rejected })
}
