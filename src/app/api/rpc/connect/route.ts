import { cookies } from "next/headers"
import { rpcUrl, ticketFor, type RpcService, type TicketPurpose } from "@/lib/rpc"
import { SESSION_COOKIE, readToken } from "@/lib/session"

export const runtime = "nodejs"

/**
 * The dashboard's Connect and Disconnect buttons for Discord and Telegram: sends the signed-in listener on to that
 * RPC server with a ten-minute ticket that says who they are, so it never needs their Noctorium password.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const jar = await cookies()
  const session = await readToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) return Response.redirect(new URL("/login", url), 303)
  const service = url.searchParams.get("service")
  const action = url.searchParams.get("action") ?? "connect"
  if ((service !== "discord" && service !== "telegram") || (action !== "connect" && action !== "disconnect")) {
    return new Response("Unknown service.", { status: 400 })
  }
  const ticket = ticketFor(session.userId, service as RpcService, action as TicketPurpose)
  return Response.redirect(`${rpcUrl(service as RpcService)}/${action}?ticket=${encodeURIComponent(ticket)}`, 303)
}
