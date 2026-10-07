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

With a database of its own, for making the player and Noctorium Stats against it:

```bash
npm install
npm run dev:local     # http://localhost:3000, a PGlite Postgres in .local/db
npm run seed:local    # two made-up accounts: a year and more of listening, and none at all
```

No Neon and no Vercel: `dev:local` keeps the database and a signing secret in `.local/`, which git ignores,
and `seed:local` refuses any address but this computer's. Its accounts and their password are at the top of
`scripts/seed-local.mjs`; every artist and song in it is invented. Point an app at it with
`NOCTORIUM_SERVICE_URL=http://localhost:3000` (the phone reaches it through `adb reverse tcp:3000 tcp:3000`).

Against a Neon database instead:

```bash
vercel env pull .env.local --environment=development
npm run dev
```

`vercel env pull` will not release Production secrets, so a local run needs the Development environment to
carry its own `DATABASE_URL` — a Neon branch is the tidy way to do that without touching live data.

## Checks

```bash
npm test        # unit tests: password hashing, validation, the batch insert, the statistics against PGlite
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
| `GET`  | `/api/stats`       | totals, per-service split, most played, and the charts — see below |

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

### Reading the statistics

`GET /api/stats` takes three optional parameters. Asked with none, it answers as it always has: all time,
the ten most played, days by UTC.

| Parameter | Values | Default |
|-----------|--------|---------|
| `range` | `7d`, `30d`, `90d`, `365d`, `all` | `all` |
| `tz` | the caller's offset from UTC in minutes, east positive (`60` for Paris in winter) | `0` |
| `limit` | how many top songs and artists, `1` to `50` | `10` |

A range counts whole days on the caller's own clock: `7d` is today and the six days before it. Alongside the
totals, `byProvider` and `topTracks` it returns `topArtists`; `timeline`, the listening by day, or by month
once the span is over four months, with the empty days and months filled in as zeros so a chart needs no
guessing; `hourly` (24) and `weekdays` (7, Monday first) on the caller's clock; the 30 most `recent` listens;
and the `streak`, the days in a row with something played, current and longest. Noctorium Stats, on the
computer and on the phone, is built on it.

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
