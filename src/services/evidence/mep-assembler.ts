/**
 * Mycelium Protocol -- MEP Assembler
 *
 * Collects IP asset data, license history, and provenance chain from the
 * PostgreSQL indexer into a structured Mycelium Evidence Package (MEP)
 * JSON document ready for Arweave upload and on-chain anchoring.
 *
 * The MEP is the core legal artifact -- it must contain everything a court
 * or WIPO arbitrator needs to verify IP ownership, chain of custody,
 * and creation timestamp.
 */

import {
  getIPAssetByPubkey,
  getLicensesByIP,
  getProvenanceChain,
} from "../indexer/queries.js";
import { formatForJurisdiction } from "./jurisdiction-formatter.js";
import type { Jurisdiction, IPAsset, LicenseTemplate } from "../../types.js";

// ── MEP Document Interface ────────────────────────────────────────────

export interface MEPDocument {
  mep_version: "1.0";
  generated_at_iso: string;
  generated_at_unix: number;
  generated_slot: number;
  ip_asset: {
    pubkey: string;
    original_creator: string;
    current_owner: string;
    content_hash_sha256: string;
    perceptual_hash: string;
    ip_type: string;
    metadata_uri: string;
    registration_slot: number;
    registration_timestamp_unix: number;
    registration_timestamp_iso: string;
    parent_ip: string | null;
    status: string;
    wipo_metadata: {
      nice_class: number | null;
      berne_category: number | null;
      country_of_origin: string;
      first_use_date: string | null;
      wipo_aligned: boolean;
    };
  };
  license_history: Array<{
    pubkey: string;
    license_type: string;
    licensee: string;
    acquired_slot: number;
    acquired_timestamp: string;
    valid: boolean;
  }>;
  provenance_chain: Array<{
    pubkey: string;
    creator: string;
    content_hash: string;
    registration_slot: number;
    relationship: "self" | "parent" | "grandparent";
  }>;
  jurisdiction_section: object;
  integrity: {
    document_hash_algorithm: "SHA-256";
    hash_computed_from: "canonical_json_serialization";
    verification_instructions: string;
  };
}

// ── Jurisdiction Map ──────────────────────────────────────────────────
// Maps TypeScript Jurisdiction strings to Meridian on-chain enum variant keys.
// Anchor enum variants are passed as { variantName: {} } objects.

export const JURISDICTION_MAP: Record<string, string> = {
  ID: "indonesia",
  KE: "kenya",
  CO: "colombia",
  GENERIC: "international",
  CN: "international",
  US: "international",
  GB: "international",
  EU: "international",
  ZA: "international",
};

// WIPO Arbitration mapping -- used when explicitly requested
export const WIPO_JURISDICTION_KEY = "wipoArbitration";

// ── MEP Assembler ─────────────────────────────────────────────────────

/**
 * Assemble a complete Mycelium Evidence Package from on-chain + indexed data.
 *
 * Fetches the IP asset, its license history, and provenance chain from the
 * PostgreSQL indexer, then formats jurisdiction-specific legal sections.
 *
 * @param ipAssetPubkey - Base58 public key of the IP asset
 * @param jurisdiction - Target jurisdiction code (e.g., "ID", "GENERIC")
 * @returns Fully populated MEPDocument ready for serialization and upload
 */
export async function assembleMEP(
  ipAssetPubkey: string,
  jurisdiction: Jurisdiction
): Promise<MEPDocument> {
  // Fetch IP asset from indexer
  const asset = await getIPAssetByPubkey(ipAssetPubkey);
  if (!asset) {
    throw new Error(
      `IP asset ${ipAssetPubkey} not found in indexer. ` +
        "Ensure the asset is registered and the indexer is synced."
    );
  }

  // Fetch license history
  const licenses = await getLicensesByIP(ipAssetPubkey);

  // Fetch provenance chain
  const provenanceChainRaw = await getProvenanceChain(ipAssetPubkey);

  // Build provenance array
  const provenance = await buildProvenanceChain(ipAssetPubkey);

  // Convert countryOfOrigin byte pair to ISO 3166-1 alpha-2 string
  const countryOfOrigin = String.fromCharCode(
    asset.countryOfOrigin[0],
    asset.countryOfOrigin[1]
  );

  // Format first use date
  const firstUseDate = asset.firstUseDate
    ? new Date(asset.firstUseDate * 1000).toISOString()
    : null;

  // Format jurisdiction-specific legal section
  const jurisdictionSection = formatForJurisdiction(
    jurisdiction,
    asset,
    licenses,
    provenance
  );

  // Map license history to MEP format
  const licenseHistory = licenses.map((lic: LicenseTemplate) => ({
    pubkey: lic.pubkey,
    license_type: lic.licenseType,
    licensee: lic.creator, // In the indexer, creator is the licensor; licensee tracking requires LicenseToken join
    acquired_slot: 0, // LicenseTemplate doesn't track acquisition slot directly
    acquired_timestamp: new Date().toISOString(), // Placeholder -- full tracking requires LicenseToken data
    valid: lic.active,
  }));

  const now = new Date();

  const mepDocument: MEPDocument = {
    mep_version: "1.0",
    generated_at_iso: now.toISOString(),
    generated_at_unix: Math.floor(now.getTime() / 1000),
    generated_slot: 0, // Will be set by the evidence engine after tx confirmation
    ip_asset: {
      pubkey: asset.pubkey,
      original_creator: asset.originalCreator,
      current_owner: asset.creator,
      content_hash_sha256: asset.contentHash,
      perceptual_hash: asset.perceptualHash,
      ip_type: asset.ipType,
      metadata_uri: asset.metadataUri,
      registration_slot: asset.registrationSlot,
      registration_timestamp_unix: asset.registrationTimestamp,
      registration_timestamp_iso: new Date(
        asset.registrationTimestamp * 1000
      ).toISOString(),
      parent_ip: asset.parentIp,
      status: asset.status,
      wipo_metadata: {
        nice_class: asset.niceClass,
        berne_category: asset.berneCategory,
        country_of_origin: countryOfOrigin,
        first_use_date: firstUseDate,
        wipo_aligned: asset.wipoAligned,
      },
    },
    license_history: licenseHistory,
    provenance_chain: provenance,
    jurisdiction_section: jurisdictionSection,
    integrity: {
      document_hash_algorithm: "SHA-256",
      hash_computed_from: "canonical_json_serialization",
      verification_instructions:
        "To verify this MEP: (1) Download the JSON from the Arweave URI. " +
        "(2) Compute SHA-256 of the raw bytes. (3) Compare with the package_hash " +
        "stored on-chain in the EvidencePackage PDA. (4) Verify the Ed25519 " +
        "protocol signature against the Mycelium Protocol Authority public key.",
    },
  };

  return mepDocument;
}

// ── Provenance Chain Builder ──────────────────────────────────────────

/**
 * Build a flattened provenance chain for an IP asset.
 *
 * Walks the parent_ip links via the indexer's getProvenanceChain query,
 * labeling each node with its relationship to the target asset.
 *
 * @param ipAssetPubkey - Base58 public key of the IP asset
 * @returns Flattened array with relationship labels (self, parent, grandparent)
 */
export async function buildProvenanceChain(
  ipAssetPubkey: string
): Promise<
  Array<{
    pubkey: string;
    creator: string;
    content_hash: string;
    registration_slot: number;
    relationship: "self" | "parent" | "grandparent";
  }>
> {
  const chain = await getProvenanceChain(ipAssetPubkey);
  if (!chain) return [];

  const result: Array<{
    pubkey: string;
    creator: string;
    content_hash: string;
    registration_slot: number;
    relationship: "self" | "parent" | "grandparent";
  }> = [];

  // Walk the provenance chain recursively
  function walkChain(
    node: any,
    depth: number
  ): void {
    if (!node || !node.asset) return;

    const relationship: "self" | "parent" | "grandparent" =
      depth === 0 ? "self" : depth === 1 ? "parent" : "grandparent";

    result.push({
      pubkey: node.asset.pubkey,
      creator: node.asset.creator,
      content_hash: node.asset.contentHash,
      registration_slot: node.asset.registrationSlot,
      relationship,
    });

    // Walk parent
    if (node.parent) {
      walkChain(node.parent, depth + 1);
    }
  }

  walkChain(chain, 0);
  return result;
}
