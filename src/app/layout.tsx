import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Noctorium",
  description: "Accounts and listening statistics for Noctorium.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
