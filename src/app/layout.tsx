import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Spicetify",
  description: "Accounts and listening statistics for Spicetify.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
