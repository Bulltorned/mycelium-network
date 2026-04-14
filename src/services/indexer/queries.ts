/**
 * Mycelium Protocol -- Indexer Query Layer
 *
 * SQL queries that replace getProgramAccounts RPC calls (INF-02).
 * DAS API does not support custom Anchor PDAs, so we use a
 * webhook-driven PostgreSQL index as the query layer.
 *
 * All queries use parameterized SQL ($1, $2...) -- never string interpolation.
 */

import { query } from "../db/pool.js";
import type {
  IPAsset,
  IPType,
  IPStatus,
  SearchResult,
  ProvenanceChain,
  LicenseTemplate,
} from "../../types.js";

// ── IP Type enum mapping (on-chain SMALLINT <-> TypeScript string) ──

const IP_TYPE_MAP: Record<number, IPType> = {
  0: "literary_work",
  1: "visual_art",
  2: "music",
  3: "software",
  4: "character_ip",
  5: "meme",
  6: "video",
  7: "ai_generated",
  8: "traditional_knowledge",
  9: "dataset",
  10: "brand_mark",
};

const IP_TYPE_REVERSE: Record<string, number> = Object.fromEntries(
  Object.entries(IP_TYPE_MAP).map(([k, v]) => [v, Number(k)])
);

const IP_STATUS_MAP: Record<number, IPStatus> = {
  0: "active",
  1: "disputed",
  2: "suspended",
  3: "revoked",
};

const IP_STATUS_REVERSE: Record<string, number> = Object.fromEntries(
  Object.entries(IP_STATUS_MAP).map(([k, v]) => [v, Number(k)])
);

/**
 * Map a database row to an IPAsset object.
 */
function rowToIPAsset(row: any): IPAsset {
  return {
    pubkey: row.pubkey,
    originalCreator: row.original_creator,
    creator: row.creator,
    contentHash: row.content_hash,
    perceptualHash: "", // Not stored in index -- on-chain only
    ipType: IP_TYPE_MAP[row.ip_type] ?? "literary_work",
    metadataUri: row.metadata_uri,
    registrationSlot: Number(row.created_at_slot),
    registrationTimestamp: row.created_at_ts
      ? Math.floor(new Date(row.created_at_ts).getTime() / 1000)
      : 0,
    parentIp: null, // Not tracked in current schema
    status: IP_STATUS_MAP[row.status] ?? "active",
    licenseCount: 0, // Computed from licenses table if needed
    disputeCount: 0,
    version: 1,
    niceClass: null,
    berneCategory: null,
    countryOfOrigin: [0, 0],
    firstUseDate: null,
    wipoAligned: false,
    bump: 0,
  };
}

// ── Search Query Interface ──────────────────────────────────────────

interface SearchQuery {
  text?: string;
  ipType?: IPType;
  creator?: string;
  status?: IPStatus;
  registeredAfter?: number;
  registeredBefore?: number;
  page?: number;
  pageSize?: number;
}

/**
 * Search IP assets with filtering, text matching, and pagination.
 *
 * Replaces getProgramAccounts + client-side filtering.
 * Uses PostgreSQL indexes for efficient querying.
 */
export async function searchIPAssets(
  q: SearchQuery
): Promise<SearchResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  // Text search -- ILIKE on metadata_uri and content_hash
  if (q.text) {
    conditions.push(
      `(metadata_uri ILIKE $${paramIndex} OR content_hash ILIKE $${paramIndex})`
    );
    params.push(`%${q.text}%`);
    paramIndex++;
  }

  // Filter by IP type
  if (q.ipType) {
    const typeNum = IP_TYPE_REVERSE[q.ipType];
    if (typeNum !== undefined) {
      conditions.push(`ip_type = $${paramIndex}`);
      params.push(typeNum);
      paramIndex++;
    }
  }

  // Filter by creator
  if (q.creator) {
    conditions.push(`creator = $${paramIndex}`);
    params.push(q.creator);
    paramIndex++;
  }

  // Filter by status
  if (q.status) {
    const statusNum = IP_STATUS_REVERSE[q.status];
    if (statusNum !== undefined) {
      conditions.push(`status = $${paramIndex}`);
      params.push(statusNum);
      paramIndex++;
    }
  }

  // Filter by registration time range
  if (q.registeredAfter) {
    conditions.push(`created_at_ts >= to_timestamp($${paramIndex})`);
    params.push(q.registeredAfter);
    paramIndex++;
  }

  if (q.registeredBefore) {
    conditions.push(`created_at_ts <= to_timestamp($${paramIndex})`);
    params.push(q.registeredBefore);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Pagination
  const page = q.page ?? 0;
  const pageSize = q.pageSize ?? 20;
  const offset = page * pageSize;

  // Count total matching rows
  const countResult = await query(
    `SELECT COUNT(*) AS total FROM ip_assets ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  // Fetch paginated results
  const dataParams = [...params, pageSize, offset];
  const dataResult = await query(
    `SELECT * FROM ip_assets ${whereClause}
     ORDER BY created_at_slot DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataParams
  );

  const assets = dataResult.rows.map(rowToIPAsset);

  return { assets, total, page, pageSize };
}

/**
 * Get a single IP asset by its on-chain pubkey.
 */
export async function getIPAssetByPubkey(
  pubkey: string
): Promise<IPAsset | null> {
  const result = await query(
    "SELECT * FROM ip_assets WHERE pubkey = $1",
    [pubkey]
  );

  if (result.rows.length === 0) return null;
  return rowToIPAsset(result.rows[0]);
}

/**
 * Get all licenses (templates + issued) for a given IP asset.
 */
export async function getLicensesByIP(
  ipAssetPubkey: string
): Promise<LicenseTemplate[]> {
  const result = await query(
    "SELECT * FROM licenses WHERE ip_asset_pubkey = $1 ORDER BY created_at_slot DESC",
    [ipAssetPubkey]
  );

  return result.rows.map((row: any) => ({
    pubkey: row.pubkey,
    ipAsset: row.ip_asset_pubkey,
    creator: row.licensor,
    licenseType: "open_spore" as const, // Placeholder -- full decode requires on-chain read
    commercialUse: true,
    derivativesAllowed: "allowed_unrestricted" as const,
    aiTraining: "opt_in_free" as const,
    priceUsdcLamports: Number(row.price_usdc),
    royaltyBps: Number(row.royalty_rate),
    maxDerivativeDepth: 3,
    territories: [],
    exclusive: row.is_exclusive,
    expiryTimestamp: null,
    maxLicenses: null,
    issuedCount: 0,
    active: row.status === 0,
  }));
}

/**
 * Build a provenance chain for an IP asset.
 * Includes the asset itself, its licenses, and any evidence packages.
 */
export async function getProvenanceChain(
  pubkey: string
): Promise<ProvenanceChain | null> {
  // Get the IP asset
  const asset = await getIPAssetByPubkey(pubkey);
  if (!asset) return null;

  // Get licenses
  const licenses = await getLicensesByIP(pubkey);

  // Get child IPs (derivatives that reference this asset)
  // Note: parentIp tracking requires schema extension -- returning empty for now
  const children: ProvenanceChain[] = [];

  // Get evidence packages
  const evidenceResult = await query(
    "SELECT * FROM evidence_packages WHERE ip_asset_pubkey = $1 ORDER BY generated_at_slot DESC",
    [pubkey]
  );

  // Build chain
  const chain: ProvenanceChain = {
    asset,
    parent: null, // Would require recursive lookup via parentIp
    children,
    licenses,
    disputes: [], // Disputes not indexed in current schema
  };

  return chain;
}

/**
 * Get royalty configuration for an IP asset.
 */
export async function getRoyaltyConfig(
  ipAssetPubkey: string
): Promise<any | null> {
  const result = await query(
    "SELECT * FROM royalty_configs WHERE ip_asset_pubkey = $1",
    [ipAssetPubkey]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    pubkey: row.pubkey,
    ipAsset: row.ip_asset_pubkey,
    creator: row.creator,
    recipients: row.recipients,
    platformFeeBps: Number(row.platform_fee_bps),
    totalDeposited: Number(row.total_deposited),
    totalDistributed: Number(row.total_distributed),
    txSignature: row.tx_signature,
  };
}
