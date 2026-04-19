/**
 * Mycelium Evidence Package (MEP) — TypeScript schema types
 *
 * Mirrors the JSON Schema at jakarta-protocol.org/schema/mep/v1.0.json
 * and the submission document §4.2. Any deviation here is a bug — the
 * JSON Schema is the source of truth for the wire format.
 */

export type Jurisdiction =
  | "Indonesia"
  | "Kenya"
  | "Colombia"
  | "WIPOArbitration"
  | "International";

export type IPType =
  | "LiteraryWork"
  | "VisualArt"
  | "Music"
  | "Software"
  | "CharacterIP"
  | "Meme"
  | "Video"
  | "AIGenerated"
  | "TraditionalKnowledge"
  | "Dataset"
  | "BrandMark";

export type LicenseType =
  | "CreativeCommons"
  | "Commercial"
  | "Exclusive"
  | "AITraining";

export type LicenseStatus =
  | "Active"
  | "Expired"
  | "Revoked"
  | "Suspended";

export type IPStatus =
  | "Active"
  | "Disputed"
  | "Suspended"
  | "Revoked";

export type RecipientRole =
  | "Creator"
  | "CoCreator"
  | "ParentIP"
  | "Platform"
  | "Other";

export type Territory =
  | { type: "Global" }
  | { type: "ASEAN" }
  | { type: "Country"; code: string } // ISO 3166-1 α2
  | { type: "Custom"; label: string };

export interface WIPOMetadata {
  nice_class?: number | null;
  nice_class_description?: string;
  berne_category?: number | null;
  berne_category_description?: string;
  country_of_origin_iso3166: string; // 2 chars
  first_use_date_utc?: string | null;
  additional_nice_classes?: number[];
  title?: string;
  title_id?: string;
  description?: string;
  creator_identity_attestation?: {
    legal_name: string;
    country: string;
    business_id?: string;
    verified_by?: string;
    verification_date?: string;
  };
}

export interface IPAssetSnapshot {
  chain: string; // e.g. "solana-mainnet-beta"
  chain_network_id?: string;
  program_id: string;
  pda_address: string;
  pda_seeds?: string[];
  content_hash: string; // "sha256:<hex>"
  perceptual_hash_algorithm?: string;
  perceptual_hash?: string; // "phash:<hex>"
  registration_slot: number;
  registration_timestamp_utc: string;
  ip_type: IPType;
  original_creator_pubkey: string;
  current_creator_pubkey: string;
  metadata_uri: string;
  arweave_manifest_block?: number;
  wipo_metadata: WIPOMetadata;
}

export interface ProvenanceBlock {
  "@context": "https://www.w3.org/ns/prov";
  entity: {
    "@id": string;
    "@type": "prov:Entity";
    "prov:wasGeneratedBy": string;
    "prov:wasAttributedTo": string;
  };
  activity: {
    "@id": string;
    "@type": "prov:Activity";
    "prov:startedAtTime": string;
    "prov:endedAtTime": string;
    "prov:used": string;
  };
  agent?: {
    "@id": string;
    "@type": "prov:Agent";
    "prov:actedOnBehalfOf"?: string;
  };
  derivative_chain: string[];
  parent_ip: string | null;
  derivatives_issued?: Array<{
    derivative_pda: string;
    derivative_type: string;
    derivative_creator: string;
    registration_slot: number;
    registration_timestamp_utc: string;
  }>;
}

export interface LicenseHistoryEntry {
  license_pda: string;
  template_pda: string;
  licensor_pubkey: string;
  licensee_pubkey: string;
  licensee_name: string;
  purpose: string;
  license_type: LicenseType;
  royalty_rate_bps: number;
  territory: Territory;
  duration_seconds: number | null;
  issued_at_utc: string;
  expires_at_utc: string | null;
  status: LicenseStatus;
  commercial_use: boolean;
  ai_training_allowed: boolean;
  max_sublicenses: number;
  sublicense_count: number;
  total_royalties_paid_lamports: number;
}

export interface RoyaltyHistoryBlock {
  config_pda: string;
  config_created_slot: number;
  platform_fee_bps: number;
  platform_wallet_pubkey: string;
  recipients: Array<{
    wallet_pubkey: string;
    share_bps: number;
    role: RecipientRole;
    label?: string;
  }>;
  total_deposited_lamports: number;
  total_distributed_lamports: number;
  distribution_count: number;
  last_distribution_slot?: number | null;
  last_distribution_timestamp_utc?: string | null;
}

export interface DisputeHistoryEntry {
  dispute_pda: string;
  claimant: string;
  respondent: string;
  filed_at_utc: string;
  stage: 1 | 2 | 3 | 4 | 5;
  status: "Filed" | "UnderMediation" | "InArbitration" | "Resolved" | "Dismissed";
  resolution_summary?: string;
  evidence_hashes: string[];
}

export interface JurisdictionFormatBlock {
  target_jurisdiction: Jurisdiction;
  legal_basis: string[];
  language: string; // BCP 47
  court_format: string;
  expert_witness_declaration_included: boolean;
  verification_instructions_included: boolean;
  notarization_guidance_included?: boolean;
  expert_witness_statement_arweave_uri?: string | null;
}

export interface VerificationBlock {
  explorer_urls: {
    ip_asset: string;
    registration_transaction?: string;
    royalty_config?: string;
  };
  arweave_urls: {
    content_metadata: string;
    full_mep_document?: string;
    expert_witness_statement?: string;
  };
  reproduction_steps: Array<{
    step: number;
    action: string;
    expected: string;
  }>;
  estimated_verification_time_minutes: number;
  required_tools: string[];
  required_specialist_knowledge: string;
}

export interface PackageMetadataBlock {
  generated_at_utc: string;
  generated_by_agent: string;
  generated_by_wallet: string;
  generation_cost_lamports: number;
  superseded_by: string | null;
  superseded_at_utc: string | null;
  version_number: number;
  total_on_chain_verifications: number;
}

export interface MEPDisclaimer {
  en: string;
  [lang: string]: string;
}

export interface MEPDocument {
  $schema: "https://jakarta-protocol.org/schema/mep/v1.0.json";
  mep_version: "1.0";
  /** SHA-256 hex over the canonicalized document with package_hash="" . Format: "sha256:<hex>" */
  package_hash: string;
  /** Ed25519 signature over package_hash. Format: "ed25519:<hex>" */
  protocol_signature: string;
  /** Ed25519 public key. Format: "ed25519:<hex>" */
  protocol_authority: string;

  ip_asset: IPAssetSnapshot;
  provenance: ProvenanceBlock;
  license_history: LicenseHistoryEntry[];
  royalty_history: RoyaltyHistoryBlock | null;
  dispute_history: DisputeHistoryEntry[];
  jurisdiction_format: JurisdictionFormatBlock;
  verification: VerificationBlock;
  package_metadata: PackageMetadataBlock;
  disclaimer: MEPDisclaimer;
}
