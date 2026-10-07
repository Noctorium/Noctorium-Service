/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Loaded only for a local run with no Neon database (see src/lib/local-db.ts), so it is left out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
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
