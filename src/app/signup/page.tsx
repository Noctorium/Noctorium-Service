import Providers, { hasProviders } from "../providers"
import { safeNext } from "@/lib/oauth"
import SignUpForm from "./form"

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const to = safeNext((await searchParams).next)
  return <SignUpForm next={to} providers={hasProviders() ? <Providers next={to} /> : null} />
}
