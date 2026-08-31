# Spicetify Service

Accounts and listening statistics for [Spicetify](https://github.com/Spice-Production). One account works
in both the player and this website: it counts how many songs you have streamed, how many different ones,
and how many hours that adds up to.

Next.js on Vercel, Postgres on Neon.

## What you have to set up

Four things need a human with an account. Everything else is already here.

### 1. A Neon database

1. Sign in at [neon.tech](https://neon.tech) and create a project.
2. Open **Connection Details** and copy the **pooled** connection string. It has `-pooler` in the host and
   ends with `?sslmode=require`. The pooled one matters: serverless functions open a connection per
   invocation and the direct endpoint will run out.

### 2. A signing secret

This signs session tokens. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep it. Changing it later signs everybody out.

### 3. The Vercel project

1. Push this repository to GitHub, then import it at [vercel.com/new](https://vercel.com/new).
2. Under **Settings → Environment Variables**, add both, for Production, Preview and Development:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `AUTH_SECRET`  | the secret from step 2 |

3. Deploy.

### 4. Create the tables

Once `DATABASE_URL` is set, run this locally against the same database:

```bash
npm install
DATABASE_URL="postgresql://..." npm run db:push
```

It applies `db/schema.sql`, which is written to be safe to run more than once.

### If your deployment is not at the default address

The player looks for `https://spicetify-service.vercel.app`. To point it somewhere else, set
`SPICETIFY_SERVICE_URL` in the player's environment.

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill both values in
npm run db:push
npm run dev
```

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

## Not done yet

- **Rate limiting.** Sign-in has no attempt limit. Vercel's WAF, or a small table of attempts, would close
  that; worth doing before this is public.
- **Password reset.** There is no way back in from a forgotten password. It needs somewhere to send email.
- **Email verification.** Addresses are accepted as given.
- The database-backed paths have not been run against a real Postgres yet — see the note in the player
  repository's history. The SQL is straightforward, but treat the first `npm run db:push` and first signup
  as the real test.
