-- Noctorium accounts and listening history.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL,
    -- Lower-cased copy of the address, so two people cannot register the same one in different cases.
    email_key     TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    -- scrypt, stored as its own parameters plus salt plus hash. Never the password.
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per listen. Totals are counted from these rather than kept as running sums, so a miscount can
-- always be recomputed and a wrong total can never drift permanently out of step with what happened.
CREATE TABLE IF NOT EXISTS plays (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The player's own id for this listen. It makes a retry after a dropped reply harmless: the second
    -- attempt collides with the first and is discarded rather than counted twice.
    client_id    TEXT        NOT NULL,
    provider     TEXT        NOT NULL,
    track_id     TEXT        NOT NULL,
    title        TEXT        NOT NULL,
    artist       TEXT        NOT NULL,
    -- How much of the track was actually heard, which is what the hours are summed from.
    ms_played    BIGINT      NOT NULL CHECK (ms_played >= 0),
    played_at    TIMESTAMPTZ NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_id)
);

-- Counting a listener's plays, and their span, is the whole read path.
CREATE INDEX IF NOT EXISTS plays_user_played_at_idx ON plays (user_id, played_at DESC);
-- Distinct songs are counted over this pair, so let the index answer it.
CREATE INDEX IF NOT EXISTS plays_user_track_idx ON plays (user_id, provider, track_id);

-- Throttling for the endpoints anyone can reach without signing in first.
--
-- One row per bucket rather than one per attempt: a row-per-attempt table grows with the traffic it is
-- meant to be resisting, which hands an attacker a second way to hurt the database. This holds a count and
-- the moment its window opened, and rolls over in place.
CREATE TABLE IF NOT EXISTS auth_attempts (
    bucket            TEXT        PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts          INTEGER     NOT NULL DEFAULT 0
);

-- Buckets nobody has touched in a long while can be swept without affecting anything live.
CREATE INDEX IF NOT EXISTS auth_attempts_window_idx ON auth_attempts (window_started_at);

-- Discord and Telegram linked to a Noctorium account, for the now-playing status the two RPC servers show
-- (noctorium-discord-rpc-server, noctorium-telegram-rpc-server). Those servers write these rows; the service
-- reads them to know whom to tell when somebody's music changes. Tokens and sessions are encrypted by the RPC
-- servers (AES-GCM, RPC_ENCRYPTION_KEY) before they reach this table.
CREATE TABLE IF NOT EXISTS discord_links (
    user_id            BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    discord_user_id    TEXT        NOT NULL,
    discord_name       TEXT        NOT NULL,
    access_token       TEXT        NOT NULL,
    refresh_token      TEXT        NOT NULL,
    token_expires_at   TIMESTAMPTZ NOT NULL,
    -- The headless session showing the status, while something plays; they last 20 minutes.
    session_token      TEXT,
    session_expires_at TIMESTAMPTZ,
    -- What is playing, so the session can be renewed before it lapses.
    playing            JSONB,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_links (
    user_id          BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    telegram_user_id TEXT        NOT NULL,
    telegram_name    TEXT        NOT NULL,
    session          TEXT        NOT NULL,
    -- The bio the listener had before linking, put back whenever the music stops.
    original_bio     TEXT        NOT NULL DEFAULT '',
    shown_bio        TEXT,
    bio_changed_at   TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accounts made with Discord, GitHub or Telegram have no password, and Telegram gives no email.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email_key DROP NOT NULL;

-- The other ways to sign in to an account: one row per Discord, GitHub or Telegram account linked to it. A
-- provider's account belongs to one Noctorium account only; linking it to a second is refused, never merged.
CREATE TABLE IF NOT EXISTS identities (
    provider         TEXT        NOT NULL,
    provider_user_id TEXT        NOT NULL,
    user_id          BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS identities_user_idx ON identities (user_id);

-- Signing an app in from a browser: the app shows a code, the listener allows it at /device, and the app, which
-- holds the poll secret (only its hash is kept), collects its token. Ten minutes, then gone.
CREATE TABLE IF NOT EXISTS device_logins (
    code       TEXT        PRIMARY KEY,
    poll_hash  TEXT        NOT NULL UNIQUE,
    user_id    BIGINT      REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
