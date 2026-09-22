"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function SignUp() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const reply = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      })
      const body = await reply.json().catch(() => ({}))
      if (!reply.ok) {
        setError(body.error ?? "Could not create the account.")
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
        <span className="mark">N</span> Noctorium
      </div>
      <h1>Create an account</h1>
      <p className="lede">Used by both the website and the player.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="name">Display name</label>
        <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" autoComplete="nickname" />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <div className="muted" style={{ marginTop: 6 }}>At least 10 characters.</div>

        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        {error && <div className="error">{error}</div>}
      </form>
      <p className="muted" style={{ marginTop: 18 }}>
        Already have one? <Link href="/login">Sign in</Link>
      </p>
    </main>
  )
}
