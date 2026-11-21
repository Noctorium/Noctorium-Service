import { DEVICE_SECONDS, POLL_INTERVAL_SECONDS, startDeviceLogin } from "@/lib/device"
import { PER_ADDRESS_SIGN_UP, bucket, callerAddress, tooManyAttempts } from "@/lib/rate-limit"
import { consume } from "@/lib/rate-limit-store"

export const runtime = "nodejs"

/**
 * An app asks to be signed in from a browser: it gets a code to show and a link to open, and a poll secret it keeps
 * to itself and collects its token with (GET /api/auth/device/poll).
 */
export async function POST(request: Request) {
  const allowed = await consume(bucket("device", callerAddress(request)), PER_ADDRESS_SIGN_UP)
  if (!allowed.allowed) return tooManyAttempts(allowed.retryAfterSeconds)
  const { code, pollToken } = await startDeviceLogin()
  const base = process.env.SERVICE_URL ?? "https://service.noctorium.xyz"
  return Response.json({
    code,
    pollToken,
    url: `${base}/device?code=${code}`,
    expiresIn: DEVICE_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  })
}
