import Providers, { hasProviders } from "../providers"
import { safeNext } from "@/lib/oauth"
import LogInForm from "./form"

const ERRORS: Record<string, string> = {
  expired: "That sign-in took too long or was interrupted. Try again.",
  failed: "That sign-in did not go through. Try again.",
  telegram: "Telegram sign-in did not go through. Try again.",
  access_denied: "Sign-in was cancelled.",
}

export default async function LogIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  const to = safeNext(next)
  return <LogInForm next={to} problem={error ? ERRORS[error] ?? ERRORS.failed : undefined} providers={hasProviders() ? <Providers next={to} /> : null} />
}
