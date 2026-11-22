"use client"

import { useEffect, useState } from "react"

/** Opens the bot in Telegram, then asks every two seconds whether the listener has confirmed there. */
export default function Waiter({ link }: { link: string }) {
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    const ask = async () => {
      if (stopped) return
      const reply = await fetch("/api/auth/telegram/poll", { cache: "no-store" }).catch(() => null)
      if (stopped) return
      if (reply?.status === 200) {
        window.location.assign("/api/auth/telegram/finish")
        return
      }
      if (reply && reply.status !== 202) {
        const said = (await reply.json().catch(() => null)) as { error?: string } | null
        setProblem(said?.error ?? "That sign-in did not go through. Start again.")
        return
      }
      setTimeout(ask, 2000)
    }
    const first = setTimeout(ask, 2000)
    return () => {
      stopped = true
      clearTimeout(first)
    }
  }, [])

  if (problem) {
    return (
      <div className="card">
        <div className="error">{problem}</div>
        <a href="/login">Back to sign in</a>
      </div>
    )
  }
  return (
    <div className="card">
      <p>Open Noctorium&apos;s bot in Telegram, press <b>Start</b>, then <b>Confirm</b>. This page signs you in by itself.</p>
      <a className="provider telegram" href={link} target="_blank" rel="noreferrer">
        Open Telegram
      </a>
      <p className="muted" style={{ marginTop: 14 }}>
        Waiting for you to confirm…
      </p>
    </div>
  )
}
