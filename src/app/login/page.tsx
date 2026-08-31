"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LogIn() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const reply = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const body = await reply.json().catch(() => ({}))
      if (!reply.ok) {
        setError(body.error ?? "Could not sign in.")
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="wrap narrow">
      <div className="brand">
        <span className="mark">S</span> Spicetify
      </div>
      <h1>Sign in</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {error && <div className="error">{error}</div>}
      </form>
      <p className="muted" style={{ marginTop: 18 }}>
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </main>
  )
}
