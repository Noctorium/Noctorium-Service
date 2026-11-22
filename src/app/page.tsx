import Link from "next/link"
import Brand from "./brand"

export default function Home() {
  return (
    <main className="wrap">
      <Brand />
      <h1>Your listening, counted.</h1>
      <p className="lede">
        A Noctorium account keeps track of what you play: how many songs you have streamed, how many
        different ones, and how many hours that adds up to. Sign in here or in the player — it is the same
        account either way.
      </p>
      <div className="row">
        <Link href="/signup">
          <button style={{ width: "auto", margin: 0 }}>Create an account</button>
        </Link>
        <Link href="/login" className="muted">
          or sign in
        </Link>
      </div>
    </main>
  )
}
