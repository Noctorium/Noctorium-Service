/** Where sign-in and the account live: the Noctorium account server. */
const ACCOUNT = process.env.ACCOUNT_URL ?? "https://account.noctorium.xyz"

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Loaded only for a local run with no Neon database (see src/lib/local-db.ts), so it is left out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Sign-in and the account moved to account.noctorium.xyz in 0.39. Apps from before it still ask this address, so
  // their requests are passed straight through, and the pages people may have bookmarked go there.
  async rewrites() {
    return ["/api/auth/:path*", "/api/connect/key", "/api/scrobblers", "/api/scrobblers/:path*", "/api/rpc/:path*", "/api/telegram/webhook"].map(
      (path) => ({ source: path, destination: `${ACCOUNT}${path}` }),
    )
  },
  async redirects() {
    return ["/login", "/signup", "/device", "/telegram", "/verify"].map((path) => ({ source: path, destination: `${ACCOUNT}${path}`, permanent: false }))
  },
  // The desktop player is not a browser page, so the endpoints it calls have to accept a cross-origin
  // request from it. Only the API is opened up, and only for the verbs the player actually uses.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ]
  },
}
export default nextConfig
