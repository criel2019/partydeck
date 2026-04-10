CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider        TEXT NOT NULL,
    provider_id     TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    email           TEXT DEFAULT NULL,
    profile_image   TEXT DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS auth_codes (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    code_hash       TEXT NOT NULL,
    state           TEXT NOT NULL,
    return_to       TEXT NOT NULL,
    response_mode   TEXT NOT NULL,
    origin          TEXT NOT NULL DEFAULT '',
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_code_hash ON auth_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_auth_codes_state ON auth_codes(state);

CREATE TABLE IF NOT EXISTS oauth_pending (
    state           TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    return_to       TEXT NOT NULL,
    response_mode   TEXT NOT NULL,
    client_id       TEXT NOT NULL DEFAULT 'partyplay',
    origin          TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS payment_sessions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id      TEXT NOT NULL,
    portone_payment_id TEXT DEFAULT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    amount          INTEGER NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'KRW',
    return_url      TEXT DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at    TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
    id              SERIAL PRIMARY KEY,
    session_id      TEXT REFERENCES payment_sessions(id),
    product_id      TEXT NOT NULL,
    transaction_id  TEXT NOT NULL,
    grants_json     JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
