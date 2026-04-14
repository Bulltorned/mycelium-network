/**
 * Mycelium Protocol -- On-Chain Event Parser
 *
 * Parses enhanced Helius transaction data into domain events and
 * UPSERTs them into PostgreSQL. Each parser handles one program.
 *
 * Anchor instruction discriminators are the first 8 bytes of
 * SHA-256("global:<instruction_name>"). We use these to identify
 * which instruction was called without full IDL deserialization.
 *
 * All database operations are idempotent (UPSERT / ON CONFLICT).
 */

import { createHash } from "node:crypto";
import { query } from "../db/pool.js";

// ── Network-Aware Program IDs ───────────────────────────────────────

const SOLANA_NETWORK = process.env.SOLANA_NETWORK ?? "devnet";

const MAINNET_PROGRAM_IDS = {
  SPORE: "GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR",
  HYPHA: "BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV",
  RHIZOME: "7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW",
  MERIDIAN: "2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le",
  DRP: "BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU",
} as const;

const DEVNET_PROGRAM_IDS = {
  SPORE: "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz",
  HYPHA: "9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5",
  RHIZOME: "9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu",
  MERIDIAN: "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc",
  DRP: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
} as const;

export const PROGRAM_IDS = SOLANA_NETWORK === "mainnet-beta"
  ? MAINNET_PROGRAM_IDS
  : DEVNET_PROGRAM_IDS;

// ── Anchor Discriminator Utilities ──────────────────────────────────

/**
 * Compute Anchor instruction discriminator.
 * Anchor uses SHA-256("global:<snake_case_name>")[0..8] as base58/hex prefix.
 */
function anchorDiscriminator(instructionName: string): string {
  const hash = createHash("sha256")
    .update(`global:${instructionName}`)
    .digest();
  return hash.subarray(0, 8).toString("hex");
}

// Pre-compute discriminators for each program's instructions
const SPORE_DISCRIMINATORS: Record<string, string> = {
  [anchorDiscriminator("register_ip")]: "register_ip",
  [anchorDiscriminator("register_derivative")]: "register_derivative",
  [anchorDiscriminator("transfer_ownership")]: "transfer_ownership",
  [anchorDiscriminator("update_status")]: "update_status",
  [anchorDiscriminator("update_metadata")]: "update_metadata",
};

const HYPHA_DISCRIMINATORS: Record<string, string> = {
  [anchorDiscriminator("create_license_template")]: "create_license_template",
  [anchorDiscriminator("issue_license")]: "issue_license",
  [anchorDiscriminator("revoke_license")]: "revoke_license",
  [anchorDiscriminator("deactivate_template")]: "deactivate_template",
};

const RHIZOME_DISCRIMINATORS: Record<string, string> = {
  [anchorDiscriminator("configure_royalty")]: "configure_royalty",
  [anchorDiscriminator("deposit_royalty")]: "deposit_royalty",
  [anchorDiscriminator("distribute_royalties")]: "distribute_royalties",
};

const MERIDIAN_DISCRIMINATORS: Record<string, string> = {
  [anchorDiscriminator("generate_mep")]: "generate_mep",
  [anchorDiscriminator("verify_mep")]: "verify_mep",
  [anchorDiscriminator("update_mep")]: "update_mep",
};

// ── Helper: extract discriminator hex from base64 instruction data ──

function getDiscriminatorHex(dataBase64: string): string {
  const buf = Buffer.from(dataBase64, "base64");
  return buf.subarray(0, 8).toString("hex");
}

/**
 * Safely extract an account key from the accounts array.
 * Helius enhanced transactions provide accounts as strings.
 */
function safeAccount(accounts: string[] | undefined, index: number): string {
  return accounts?.[index] ?? "unknown";
}

// ── Spore Program Parser (IP registration, transfer, status) ────────

export async function parseSporeEvent(
  ix: {
    data?: string;
    accounts?: string[];
    programId?: string;
  },
  slot: number,
  timestamp: number,
  txSignature: string
): Promise<void> {
  if (!ix.data) return;

  const disc = getDiscriminatorHex(ix.data);
  const ixName = SPORE_DISCRIMINATORS[disc];

  if (!ixName) {
    // Unknown instruction -- skip silently
    return;
  }

  const ipAssetPubkey = safeAccount(ix.accounts, 0);

  switch (ixName) {
    case "register_ip":
    case "register_derivative": {
      const creator = safeAccount(ix.accounts, 2);
      await query(
        `INSERT INTO ip_assets (pubkey, original_creator, creator, content_hash, ip_type, status, metadata_uri, created_at_slot, created_at_ts, updated_at_slot, tx_signature)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, to_timestamp($8), $7, $9)
         ON CONFLICT (pubkey) DO UPDATE SET
           creator = EXCLUDED.creator,
           status = EXCLUDED.status,
           metadata_uri = EXCLUDED.metadata_uri,
           updated_at_slot = EXCLUDED.updated_at_slot,
           tx_signature = EXCLUDED.tx_signature`,
        [
          ipAssetPubkey,
          creator,
          `pending_${txSignature.slice(0, 16)}`, // content_hash placeholder -- full decode requires IDL
          0, // ip_type placeholder
          0, // status = active
          "",  // metadata_uri placeholder
          slot,
          timestamp,
          txSignature,
        ]
      );
      console.error(
        `[mycelium-indexer] Indexed ${ixName}: pubkey=${ipAssetPubkey} creator=${creator} slot=${slot}`
      );
      break;
    }

    case "transfer_ownership": {
      const newOwner = safeAccount(ix.accounts, 2);
      await query(
        `UPDATE ip_assets SET creator = $1, updated_at_slot = $2, tx_signature = $3
         WHERE pubkey = $4`,
        [newOwner, slot, txSignature, ipAssetPubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed transfer_ownership: pubkey=${ipAssetPubkey} new_owner=${newOwner}`
      );
      break;
    }

    case "update_status": {
      // Status is encoded in instruction data after discriminator
      // Without full IDL decode, we record the event and update slot
      await query(
        `UPDATE ip_assets SET updated_at_slot = $1, tx_signature = $2
         WHERE pubkey = $3`,
        [slot, txSignature, ipAssetPubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed update_status: pubkey=${ipAssetPubkey} slot=${slot}`
      );
      break;
    }

    case "update_metadata": {
      await query(
        `UPDATE ip_assets SET updated_at_slot = $1, tx_signature = $2
         WHERE pubkey = $3`,
        [slot, txSignature, ipAssetPubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed update_metadata: pubkey=${ipAssetPubkey} slot=${slot}`
      );
      break;
    }
  }
}

// ── Hypha Program Parser (licenses) ─────────────────────────────────

export async function parseHyphaEvent(
  ix: {
    data?: string;
    accounts?: string[];
    programId?: string;
  },
  slot: number,
  timestamp: number,
  txSignature: string
): Promise<void> {
  if (!ix.data) return;

  const disc = getDiscriminatorHex(ix.data);
  const ixName = HYPHA_DISCRIMINATORS[disc];

  if (!ixName) return;

  switch (ixName) {
    case "create_license_template": {
      const templatePubkey = safeAccount(ix.accounts, 0);
      const ipAssetPubkey = safeAccount(ix.accounts, 1);
      const licensor = safeAccount(ix.accounts, 2);
      await query(
        `INSERT INTO licenses (pubkey, template_pubkey, ip_asset_pubkey, licensor, license_type, price_usdc, royalty_rate, is_exclusive, status, created_at_slot, tx_signature)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (pubkey) DO UPDATE SET
           licensor = EXCLUDED.licensor,
           status = EXCLUDED.status,
           tx_signature = EXCLUDED.tx_signature`,
        [
          templatePubkey,
          ipAssetPubkey,
          licensor,
          0, // license_type placeholder
          0, // price_usdc placeholder
          0, // royalty_rate placeholder
          false, // is_exclusive placeholder
          0, // status = active
          slot,
          txSignature,
        ]
      );
      console.error(
        `[mycelium-indexer] Indexed create_license_template: pubkey=${templatePubkey} ip=${ipAssetPubkey}`
      );
      break;
    }

    case "issue_license": {
      const licensePubkey = safeAccount(ix.accounts, 0);
      const licensee = safeAccount(ix.accounts, 2);
      await query(
        `UPDATE licenses SET licensee = $1, tx_signature = $2
         WHERE pubkey = $3`,
        [licensee, txSignature, licensePubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed issue_license: pubkey=${licensePubkey} licensee=${licensee}`
      );
      break;
    }

    case "revoke_license": {
      const licensePubkey = safeAccount(ix.accounts, 0);
      await query(
        `UPDATE licenses SET status = 2, tx_signature = $1
         WHERE pubkey = $2`,
        [txSignature, licensePubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed revoke_license: pubkey=${licensePubkey}`
      );
      break;
    }

    case "deactivate_template": {
      const templatePubkey = safeAccount(ix.accounts, 0);
      await query(
        `UPDATE licenses SET status = 1, tx_signature = $1
         WHERE pubkey = $2`,
        [txSignature, templatePubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed deactivate_template: pubkey=${templatePubkey}`
      );
      break;
    }
  }
}

// ── Rhizome Program Parser (royalties) ──────────────────────────────

export async function parseRhizomeEvent(
  ix: {
    data?: string;
    accounts?: string[];
    programId?: string;
  },
  slot: number,
  _timestamp: number,
  txSignature: string
): Promise<void> {
  if (!ix.data) return;

  const disc = getDiscriminatorHex(ix.data);
  const ixName = RHIZOME_DISCRIMINATORS[disc];

  if (!ixName) return;

  switch (ixName) {
    case "configure_royalty": {
      const configPubkey = safeAccount(ix.accounts, 0);
      const ipAssetPubkey = safeAccount(ix.accounts, 1);
      const creator = safeAccount(ix.accounts, 2);
      await query(
        `INSERT INTO royalty_configs (pubkey, ip_asset_pubkey, creator, recipients, platform_fee_bps, total_deposited, total_distributed, tx_signature)
         VALUES ($1, $2, $3, '[]'::JSONB, $4, 0, 0, $5)
         ON CONFLICT (pubkey) DO UPDATE SET
           creator = EXCLUDED.creator,
           tx_signature = EXCLUDED.tx_signature`,
        [configPubkey, ipAssetPubkey, creator, 0, txSignature]
      );
      console.error(
        `[mycelium-indexer] Indexed configure_royalty: pubkey=${configPubkey} ip=${ipAssetPubkey}`
      );
      break;
    }

    case "deposit_royalty": {
      const configPubkey = safeAccount(ix.accounts, 0);
      // Without full IDL decode, we can only mark that a deposit happened
      await query(
        `UPDATE royalty_configs SET tx_signature = $1
         WHERE pubkey = $2`,
        [txSignature, configPubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed deposit_royalty: config=${configPubkey}`
      );
      break;
    }

    case "distribute_royalties": {
      const configPubkey = safeAccount(ix.accounts, 0);
      await query(
        `UPDATE royalty_configs SET tx_signature = $1
         WHERE pubkey = $2`,
        [txSignature, configPubkey]
      );
      console.error(
        `[mycelium-indexer] Indexed distribute_royalties: config=${configPubkey}`
      );
      break;
    }
  }
}

// ── Meridian Program Parser (evidence) ──────────────────────────────

export async function parseMeridianEvent(
  ix: {
    data?: string;
    accounts?: string[];
    programId?: string;
  },
  slot: number,
  _timestamp: number,
  txSignature: string
): Promise<void> {
  if (!ix.data) return;

  const disc = getDiscriminatorHex(ix.data);
  const ixName = MERIDIAN_DISCRIMINATORS[disc];

  if (!ixName) return;

  if (ixName === "generate_mep") {
    const mepPubkey = safeAccount(ix.accounts, 0);
    const ipAssetPubkey = safeAccount(ix.accounts, 1);
    const requester = safeAccount(ix.accounts, 2);
    await query(
      `INSERT INTO evidence_packages (pubkey, ip_asset_pubkey, requester, jurisdiction, package_hash, arweave_uri, generated_at_slot, tx_signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (pubkey) DO UPDATE SET
         arweave_uri = EXCLUDED.arweave_uri,
         tx_signature = EXCLUDED.tx_signature`,
      [
        mepPubkey,
        ipAssetPubkey,
        requester,
        "GENERIC", // jurisdiction placeholder -- full decode requires IDL
        `sha256:${txSignature.slice(0, 32)}`, // package_hash placeholder
        "", // arweave_uri placeholder
        slot,
        txSignature,
      ]
    );
    console.error(
      `[mycelium-indexer] Indexed generate_mep: pubkey=${mepPubkey} ip=${ipAssetPubkey}`
    );
  }
}
