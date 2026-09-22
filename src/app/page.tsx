import Link from "next/link"

export default function Home() {
  return (
    <main className="wrap">
      <div className="brand">
        <span className="mark">N</span> Noctorium
      </div>
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
