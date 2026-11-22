"use client"

import { useEffect, useRef } from "react"

/**
 * Telegram's Login Widget. Its script draws the button beside itself, so it is added here, inside this box: written
 * as JSX, React hoists an async script into <head> and the button is drawn there, where nothing shows.
 */
export default function TelegramButton({ bot, authUrl }: { bot: string; authUrl: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const here = box.current
    if (!here) return
    const script = document.createElement("script")
    script.async = true
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.dataset.telegramLogin = bot
    script.dataset.size = "large"
    script.dataset.radius = "10"
    script.dataset.authUrl = authUrl
    here.replaceChildren(script)
    return () => here.replaceChildren()
  }, [bot, authUrl])
  return <div className="telegram-widget" ref={box} />
}
