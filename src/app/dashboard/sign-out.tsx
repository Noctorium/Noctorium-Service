"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function SignOut() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      className="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch("/api/auth/logout", { method: "POST" })
        router.push("/login")
        router.refresh()
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  )
}
