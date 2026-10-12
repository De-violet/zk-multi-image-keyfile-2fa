-- ==============================================================================
-- Schema Basis Data Produksi: ZK Multi-Image Keyfile 2FA
-- Kompatibel dengan PostgreSQL, SQLite (3.x), dan MySQL/MariaDB
-- ==============================================================================

-- 1. Tabel Kredensial Pengguna & Komitmen Kriptografi ZK
CREATE TABLE IF NOT EXISTS users (
    username VARCHAR(64) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(128) NULL,
    root_commitment VARCHAR(128) NOT NULL, -- Komitmen Poseidon kurva BN128
    salt_2fa VARCHAR(128) NOT NULL DEFAULT '0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_root_commitment ON users(root_commitment);

-- 2. Tabel Sesi & Nonce Visual-TOTP (Perlindungan Replay Attack)
CREATE TABLE IF NOT EXISTS visual_totp_sessions (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    session_nonce VARCHAR(128) UNIQUE NOT NULL,
    session_token VARCHAR(255) UNIQUE NULL,
    visual_key VARCHAR(128) NULL,
    time_window BIGINT NOT NULL,
    is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMP WITH TIME ZONE NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_nonce ON visual_totp_sessions(session_nonce);
CREATE INDEX IF NOT EXISTS idx_sessions_username ON visual_totp_sessions(username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON visual_totp_sessions(expires_at);
