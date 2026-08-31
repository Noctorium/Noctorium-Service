-- Spicetify accounts and listening history.
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
