# Noctorium Service

Accounts and listening statistics for [Noctorium](https://github.com/Noctorium). One account works
in both the player and this website: it counts how many songs you have streamed, how many different ones,
and how many hours that adds up to.

Next.js on Vercel, Postgres on Neon.

## Status

Live at **https://noctorium-service.vercel.app**, on the `noctorium-service` Vercel project with a Neon
database attached. Signing up, signing in, recording listens and reading statistics have all been exercised
against the deployment.

## How it is configured

Already done, recorded here so it can be redone or understood later.

- **Database.** Vercel's Neon integration sets `DATABASE_URL` (the pooled endpoint) on Production and
  Preview, along with a number of aliases the code does not use.
- **`AUTH_SECRET`.** Set on Production, Preview and Development. It signs session tokens; replacing it
  signs everybody out, so it is worth leaving alone.
- **Framework.** `vercel.json` declares the Next.js preset. Without it the project looked for a static
  `public/` directory and refused a build that had produced a Next application.
- **Tables.** `db/schema.sql` is applied by the build, not by hand. Vercel supplies `DATABASE_URL` to a
  build but will not release it to a local `vercel env pull`, so the deploy is the one place that can
  reach the database. Every statement is repeatable, so this is a no-op once the tables exist.

To deploy: `vercel deploy --prod`. To change an environment variable: `vercel env add NAME production`.

## Setting this up somewhere else

1. Create a Neon project and attach it to the Vercel project, or set `DATABASE_URL` to its **pooled**
   connection string by hand. Pooled matters: a function opens a connection per invocation and the direct
   endpoint runs out.
2. Generate a signing secret and set it as `AUTH_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. Deploy. The build creates the tables.

If the deployment is not at the default address, point the player at it with `NOCTORIUM_SERVICE_URL`.

## Running it locally

```bash
npm install
vercel env pull .env.local --environment=development
npm run dev
```

`vercel env pull` will not release Production secrets, so a local run needs the Development environment to
carry its own `DATABASE_URL` — a Neon branch is the tidy way to do that without touching live data.

## Checks

```bash
npm test        # unit tests: password hashing, validation, the batch insert
npm run typecheck
npm run build
```

## The API

The website and the player use the same endpoints. The website carries its session in an httpOnly cookie;
the player sends `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/signup` | `{ email, password, displayName? }` → `{ token, user }` |
| `POST` | `/api/auth/login`  | `{ email, password }` → `{ token, user }` |
| `POST` | `/api/auth/logout` | clears the browser cookie |
| `GET`  | `/api/auth/me`     | who the caller is, or 401 |
| `POST` | `/api/plays`       | `{ plays: [...] }` → `{ accepted, duplicates, rejected }` |
| `GET`  | `/api/stats`       | totals, per-service split, and most played |

### Reporting a listen

```json
{
  "plays": [
    {
      "clientId": "11111111-2222-3333-4444-555555555555",
      "provider": "YOUTUBE_MUSIC",
      "trackId": "7tLGGiNjp_U",
      "title": "Antarctica",
      "artist": "$uicideboy$",
      "msPlayed": 127000,
      "playedAt": "2026-08-31T12:00:00.000Z"
    }
  ]
}
```

`clientId` is the player's own id for that listen. Sending the same one twice is discarded rather than
counted again, so a client that never saw a reply can safely send it a second time.

## How it is built

- **Passwords** are hashed with scrypt from Node's own crypto — no native module to fail to build. Each
  hash carries the parameters it was made with, so the cost can be raised later without invalidating
  passwords already set. Comparison is constant time.
- **Sessions** are HS256 tokens. A browser gets an httpOnly cookie, which page script cannot read; the
  player, which has nowhere to keep a cookie, gets the same token as a bearer. One verifier for both.
- **Signing in** answers the same way whether the address is unknown or the password is wrong, and spends
  the same time on both, so the endpoint cannot be used to find out who has an account.
- **Totals** are counted from the play rows on every request rather than kept as running sums. A maintained
  total drifts the first time a write is lost or replayed and then stays wrong; a count is only ever as
  wrong as the rows.
- **Every value** reaching the database is a bound parameter. Nothing from a request is ever part of a
  statement's text.
- **Signing in and signing up are throttled**, counted in Postgres because serverless instances share no
  memory — an in-process counter would be wiped by every cold start and invisible to the instances beside
  it. One row per bucket, rolled over in place, so the table cannot be grown by the traffic it resists.

  | What | Limit | Window |
  |------|-------|--------|
  | Sign-in, one account | 8 | 15 minutes |
  | Sign-in, one address | 40 | 15 minutes |
  | Sign-up, one address | 8 | 1 hour |

  Both sign-in limits are needed: by address alone, somebody with a pool of addresses grinds one account;
  by account alone, they spread thinly across many accounts from one machine. A correct password clears
  that account's count, so mistyping a few times before getting it right cannot lock anyone out. Bucket
  keys are hashed, so the table never becomes a second record of who has been typing which address.

## Not done yet

- **Password reset.** There is no way back in from a forgotten password. It needs somewhere to send email.
- **Email verification.** Addresses are accepted as given.
- **Two verification accounts** are in the database from testing the deployment: their addresses end
  `@spiceity.invalid`, so they can never receive mail. Remove them from the Neon SQL editor with
  `DELETE FROM users WHERE email LIKE '%@spiceity.invalid';` — their listens go with them.
