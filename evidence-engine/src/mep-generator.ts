/**
 * MEP Generator — composes a Mycelium Evidence Package from on-chain data
 * plus a jurisdiction adapter, produces the canonical hash, and returns the
 * document ready for protocol-authority signing.
 *
 * Flow (per Jakarta Protocol §4.3):
 *   1. Caller supplies the populated MEP minus package_hash / protocol_signature
 *   2. Generator sets package_hash = ""
 *   3. Canonicalize, SHA-256, get the real package_hash
 *   4. Insert package_hash
 *   5. Return the document — caller signs package_hash externally (Ed25519)
 *      and sets protocol_signature
 *   6. Upload final document to Arweave; caller records Arweave URI on-chain
 *      via mycelium_meridian::generate_mep in the same Solana transaction
 *      that contains the Ed25519 verification instruction
 *
 * The generator NEVER signs. Signing is the protocol authority's job (multisig).
 * The generator produces content and hashes it — nothing more.
 */

import { canonicalize, sha256Hex } from "./canonical-json.js";
import type {
  DisputeHistoryEntry,
  IPAssetSnapshot,
  LicenseHistoryEntry,
  MEPDocument,
  RoyaltyHistoryBlock,
  Jurisdiction,
  ProvenanceBlock,
  MEPDisclaimer,
  PackageMetadataBlock,
} from "./mep-schema.js";
import { getAdapter } from "./jurisdiction/index.js";

export interface GenerateMEPInput {
  jurisdiction: Jurisdiction;
  ip_asset: IPAssetSnapshot;
  license_history: LicenseHistoryEntry[];
  royalty_history: RoyaltyHistoryBlock | null;
  dispute_history: DisputeHistoryEntry[];
  protocol_authority: string; // "ed25519:<hex>" — public key only
  generated_by_agent: string; // e.g. "mycelium-meridian-v1.0.0"
  generated_by_wallet: string; // pubkey of the requester wallet
  generation_cost_lamports: number;
}

export interface UnsignedMEP {
  /** The full document, including the computed package_hash but with protocol_signature="". */
  document: MEPDocument;
  /** The raw hash bytes the multisig must sign with Ed25519. */
  package_hash_hex: string;
  /** The canonical bytes that produced the hash — for independent verification. */
  canonical_bytes: Uint8Array;
}

const BASE_DISCLAIMER_EN =
  "This Mycelium Evidence Package is supplementary electronic evidence under the " +
  "Jakarta Protocol v1.0. It does not confer statutory intellectual property rights. " +
  "Statutory rights arise from national trademark, copyright, and patent registries. " +
  "This MEP asserts, with cryptographic integrity, the facts about creation, licensing, " +
  "and royalty distribution recorded at the Solana slot referenced herein.";

export async function generateUnsignedMEP(input: GenerateMEPInput): Promise<UnsignedMEP> {
  const adapter = getAdapter(input.jurisdiction);

  const provenance: ProvenanceBlock = buildProvenance(input.ip_asset);
  const disclaimer: MEPDisclaimer = adapter.disclaimerText({ en: BASE_DISCLAIMER_EN });
  const packageMetadata: PackageMetadataBlock = {
    generated_at_utc: new Date().toISOString(),
    generated_by_agent: input.generated_by_agent,
    generated_by_wallet: input.generated_by_wallet,
    generation_cost_lamports: input.generation_cost_lamports,
    superseded_by: null,
    superseded_at_utc: null,
    version_number: 1,
    total_on_chain_verifications: 0,
  };

  const document: MEPDocument = {
    $schema: "https://jakarta-protocol.org/schema/mep/v1.0.json",
    mep_version: "1.0",
    package_hash: "", // replaced below
    protocol_signature: "", // filled by multisig signer
    protocol_authority: input.protocol_authority,
    ip_asset: input.ip_asset,
    provenance,
    license_history: input.license_history,
    royalty_history: input.royalty_history,
    dispute_history: input.dispute_history,
    jurisdiction_format: adapter.formatJurisdictionBlock(),
    verification: {
      explorer_urls: buildExplorerUrls(input.ip_asset),
      arweave_urls: {
        content_metadata: arweaveUrl(input.ip_asset.metadata_uri),
      },
      reproduction_steps: adapter.reproductionSteps(input.ip_asset),
      estimated_verification_time_minutes: 12,
      required_tools: ["web browser", "sha256sum utility OR any scripting language with SHA-256"],
      required_specialist_knowledge:
        "None. Verification is designed for a non-technical judge.",
    },
    package_metadata: packageMetadata,
    disclaimer,
  };

  // Canonicalize with package_hash="", compute hash, write back
  const canonicalWithEmpty = canonicalize(document as unknown as any);
  const bytesWithEmpty = new TextEncoder().encode(canonicalWithEmpty);
  const hash = await sha256Hex(bytesWithEmpty);
  document.package_hash = `sha256:${hash}`;

  // Re-canonicalize with the real hash inserted, for the bytes we return
  const finalCanonical = canonicalize(document as unknown as any);
  const finalBytes = new TextEncoder().encode(finalCanonical);

  return {
    document,
    package_hash_hex: hash,
    canonical_bytes: finalBytes,
  };
}

/** Attach a computed Ed25519 signature to produce a signed MEP. */
export function attachSignature(unsigned: UnsignedMEP, signatureHex: string): MEPDocument {
  return {
    ...unsigned.document,
    protocol_signature: `ed25519:${signatureHex}`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildProvenance(asset: IPAssetSnapshot): ProvenanceBlock {
  const entityId = `mycelium:ip:${asset.pda_address}`;
  const activityId = `mycelium:registration:${asset.registration_slot}`;
  const agentId = `mycelium:creator:${asset.original_creator_pubkey}`;
  const contentId = `mycelium:content:${stripPrefix(asset.content_hash)}`;

  return {
    "@context": "https://www.w3.org/ns/prov",
    entity: {
      "@id": entityId,
      "@type": "prov:Entity",
      "prov:wasGeneratedBy": activityId,
      "prov:wasAttributedTo": agentId,
    },
    activity: {
      "@id": activityId,
      "@type": "prov:Activity",
      "prov:startedAtTime": asset.registration_timestamp_utc,
      "prov:endedAtTime": asset.registration_timestamp_utc,
      "prov:used": contentId,
    },
    agent: {
      "@id": agentId,
      "@type": "prov:Agent",
      ...(asset.wipo_metadata.creator_identity_attestation?.business_id
        ? { "prov:actedOnBehalfOf": asset.wipo_metadata.creator_identity_attestation.business_id }
        : {}),
    },
    derivative_chain: [],
    parent_ip: null,
  };
}

function buildExplorerUrls(asset: IPAssetSnapshot): { ip_asset: string } {
  const cluster = asset.chain.includes("mainnet") ? "mainnet-beta" : "devnet";
  return {
    ip_asset: `https://explorer.solana.com/address/${asset.pda_address}?cluster=${cluster}`,
  };
}

function arweaveUrl(uri: string): string {
  if (uri.startsWith("https://")) return uri;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return `https://arweave.net/${uri}`;
}

function stripPrefix(s: string): string {
  const i = s.indexOf(":");
  return i === -1 ? s : s.slice(i + 1);
}
