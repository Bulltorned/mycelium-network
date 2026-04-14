-- Mycelium Protocol -- PostgreSQL Schema
-- All tables use IF NOT EXISTS for idempotent initialization.
-- This schema mirrors on-chain Anchor PDA accounts for fast off-chain queries.
-- Populated by Helius webhook handler (event-parser.ts).

-- ── Webhook Idempotency ─────────────────────────────────────────────
-- Prevents re-processing the same transaction on duplicate webhook delivery.

CREATE TABLE IF NOT EXISTS processed_transactions (
  signature       VARCHAR(128)  PRIMARY KEY,
  slot            BIGINT        NOT NULL,
  processed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── IP Assets (mirrors mycelium-spore IPAsset PDA) ──────────────────

CREATE TABLE IF NOT EXISTS ip_assets (
  pubkey            VARCHAR(64)   PRIMARY KEY,
  original_creator  VARCHAR(64)   NOT NULL,
  creator           VARCHAR(64)   NOT NULL,
  content_hash      VARCHAR(64)   UNIQUE NOT NULL,
  ip_type           SMALLINT      NOT NULL,
  status            SMALLINT      NOT NULL DEFAULT 0,
  metadata_uri      TEXT          NOT NULL DEFAULT '',
  created_at_slot   BIGINT        NOT NULL,
  created_at_ts     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at_slot   BIGINT        NOT NULL,
  tx_signature      VARCHAR(128)  NOT NULL,
  perceptual_hash_hex VARCHAR(64),
  audio_fingerprint   TEXT
);

-- ── Licenses (mirrors mycelium-hypha LicenseTemplate + LicenseToken) ─

CREATE TABLE IF NOT EXISTS licenses (
  pubkey            VARCHAR(64)   PRIMARY KEY,
  template_pubkey   VARCHAR(64),
  ip_asset_pubkey   VARCHAR(64)   NOT NULL REFERENCES ip_assets(pubkey),
  licensor          VARCHAR(64)   NOT NULL,
  licensee          VARCHAR(64),
  license_type      SMALLINT      NOT NULL,
  price_usdc        BIGINT        NOT NULL DEFAULT 0,
  royalty_rate       SMALLINT      NOT NULL DEFAULT 0,
  is_exclusive      BOOLEAN       NOT NULL DEFAULT FALSE,
  status            SMALLINT      NOT NULL DEFAULT 0,
  created_at_slot   BIGINT        NOT NULL,
  tx_signature      VARCHAR(128)  NOT NULL
);

-- ── Royalty Configs (mirrors mycelium-rhizome RoyaltyConfig PDA) ─────

CREATE TABLE IF NOT EXISTS royalty_configs (
  pubkey              VARCHAR(64)   PRIMARY KEY,
  ip_asset_pubkey     VARCHAR(64)   NOT NULL REFERENCES ip_assets(pubkey),
  creator             VARCHAR(64)   NOT NULL,
  recipients          JSONB         NOT NULL DEFAULT '[]'::JSONB,
  platform_fee_bps    SMALLINT      NOT NULL DEFAULT 0,
  total_deposited     BIGINT        NOT NULL DEFAULT 0,
  total_distributed   BIGINT        NOT NULL DEFAULT 0,
  tx_signature        VARCHAR(128)  NOT NULL
);

-- ── Agent Wallets (BIP-44 derived, encrypted secret keys) ───────────

CREATE TABLE IF NOT EXISTS agent_wallets (
  agent_id            VARCHAR(255)  PRIMARY KEY,
  derivation_index    INT           UNIQUE NOT NULL,
  public_key          VARCHAR(64)   UNIQUE NOT NULL,
  encrypted_metadata  TEXT          NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Evidence Packages (mirrors mycelium-meridian MEP PDA) ───────────

CREATE TABLE IF NOT EXISTS evidence_packages (
  pubkey            VARCHAR(64)   PRIMARY KEY,
  ip_asset_pubkey   VARCHAR(64)   NOT NULL REFERENCES ip_assets(pubkey),
  requester         VARCHAR(64)   NOT NULL,
  jurisdiction      VARCHAR(10)   NOT NULL,
  package_hash      VARCHAR(128)  NOT NULL,
  arweave_uri       TEXT          NOT NULL DEFAULT '',
  generated_at_slot BIGINT        NOT NULL,
  tx_signature      VARCHAR(128)  NOT NULL
);

-- ── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ip_assets_creator
  ON ip_assets (creator);

CREATE INDEX IF NOT EXISTS idx_ip_assets_original_creator
  ON ip_assets (original_creator);

CREATE INDEX IF NOT EXISTS idx_ip_assets_content_hash
  ON ip_assets (content_hash);

CREATE INDEX IF NOT EXISTS idx_ip_assets_perceptual_hash
  ON ip_assets (perceptual_hash_hex)
  WHERE perceptual_hash_hex IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_licenses_ip_asset
  ON licenses (ip_asset_pubkey);

CREATE INDEX IF NOT EXISTS idx_licenses_licensee
  ON licenses (licensee);
