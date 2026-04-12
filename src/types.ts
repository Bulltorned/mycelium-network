/**
 * Mycelium Protocol — Shared Types
 * Maps to on-chain Anchor account structures + off-chain service types.
 * Every type here has a 1:1 correspondence with the Solana PDA accounts
 * defined in the Anchor programs.
 */

// ── IP Asset Types (maps to mycelium-spore program) ──────────────────

export type IPType =
  | "literary_work"
  | "visual_art"
  | "music"
  | "software"
  | "character_ip"
  | "meme"
  | "video"
  | "ai_generated"
  | "traditional_knowledge"
  | "dataset"
  | "brand_mark";

export type IPStatus = "active" | "disputed" | "suspended" | "revoked";

export interface IPAsset {
  pubkey: string;
  originalCreator: string;    // immutable — used in PDA seeds
  creator: string;            // current owner — changes on transfer
  contentHash: string;        // hex-encoded SHA-256
  perceptualHash: string;     // hex-encoded multi-algo fingerprint
  ipType: IPType;
  metadataUri: string;        // arweave://... or ipfs://...
  registrationSlot: number;
  registrationTimestamp: number;
  parentIp: string | null;
  status: IPStatus;
  licenseCount: number;
  disputeCount: number;
  version: number;
  // WIPO-compatible metadata (added in Plan 01-01)
  niceClass: number | null;         // Nice classification (1-45)
  berneCategory: number | null;     // Berne Convention category
  countryOfOrigin: [number, number]; // ISO 3166-1 alpha-2 as byte pair
  firstUseDate: number | null;      // Unix timestamp of first commercial use
  wipoAligned: boolean;             // true if niceClass or berneCategory is set
  bump: number;
}

// ── Content Hash Registry (maps to mycelium-spore ContentHashRegistry PDA) ──
// Global uniqueness index — one PDA per content_hash, prevents duplicate registrations

export interface ContentHashRegistry {
  contentHash: string;    // hex-encoded 32-byte SHA-256
  ipAsset: string;        // Pubkey as base58 string — the IPAsset this hash belongs to
  bump: number;
}

// ── Royalty Types (maps to mycelium-rhizome program) ────────────────────

export type RecipientRole = "creator" | "co_creator" | "parent_ip" | "platform" | "other";

export interface RoyaltyRecipient {
  wallet: string;         // Pubkey as base58 string
  shareBps: number;       // basis points (e.g., 5000 = 50%)
  role: RecipientRole;
}

export interface RoyaltyConfig {
  ipAsset: string;        // Pubkey as base58 string
  creator: string;        // Pubkey — who configured this royalty
  platformWallet: string; // Pubkey — verified at distribution time
  platformFeeBps: number; // Max 1000 (10%)
  totalDeposited: number; // lamports
  totalDistributed: number;
  distributionCount: number;
  isActive: boolean;
  recipientCount: number;
  recipients: RoyaltyRecipient[];
  bump: number;
}

export interface IPMetadata {
  title: string;
  description: string;
  tags: string[];
  contentType: string;        // MIME type
  fileSize: number;
  aiProvenance?: AIProvenance;
  c2paManifest?: string;      // base64-encoded C2PA manifest
}

export interface AIProvenance {
  modelId: string;
  modelVersion: string;
  promptHash?: string;
  trainingDataLicenses?: TrainingDataRef[];
  humanInput: "prompt_only" | "curated" | "edited" | "substantial";
}

export interface TrainingDataRef {
  myceliumIp: string;         // IPAsset pubkey
  licenseType: string;
  acquiredTimestamp: number;
}

// ── License Types (maps to mycelium-hypha program) ───────────────────

export type LicenseType =
  | "open_spore"           // Free + attribution, remix OK, commercial OK
  | "selective_hypha"      // Free non-commercial, paid commercial
  | "exclusive_root"       // Single licensee, time-limited
  | "community_canopy"     // DAO-governed, community revenue share
  | "ai_training"          // AI model training opt-in/out + compensation
  | "derivative_bloom";    // Derivatives with auto royalty upstream

export type AITrainingPolicy =
  | "opt_out"
  | "opt_in_free"
  | "opt_in_paid"
  | "require_attribution";

export type DerivativePolicy =
  | "forbidden"
  | "allowed_noncommercial"
  | "allowed_with_royalty"
  | "allowed_unrestricted";

export interface LicenseTemplate {
  pubkey: string;
  ipAsset: string;
  creator: string;
  licenseType: LicenseType;
  commercialUse: boolean;
  derivativesAllowed: DerivativePolicy;
  aiTraining: AITrainingPolicy;
  priceUsdcLamports: number;  // USDC has 6 decimals: 1_000_000 = $1.00
  royaltyBps: number;         // basis points (100 = 1%)
  maxDerivativeDepth: number;
  territories: string[];      // ISO 3166-1 codes, empty = worldwide
  exclusive: boolean;
  expiryTimestamp: number | null;
  maxLicenses: number | null;
  issuedCount: number;
  active: boolean;
}

export interface LicenseToken {
  pubkey: string;
  licenseTemplate: string;
  licensee: string;
  acquiredSlot: number;
  acquiredTimestamp: number;
  valid: boolean;
}

// ── Dispute Types (maps to mycelium-drp program) ─────────────────────

export type DisputeStage =
  | "automated_detection"
  | "direct_resolution"
  | "community_mediation"
  | "arbitration_panel"
  | "cross_jurisdictional";

export type MatchType =
  | "exact"
  | "near_duplicate"
  | "derivative"
  | "semantic";

export interface Dispute {
  pubkey: string;
  claimant: string;
  respondent: string;
  ipAsset: string;
  stage: DisputeStage;
  evidenceHashes: string[];
  similarityScore: number;    // 0-10000 basis points
  matchType: MatchType;
  mediator: string | null;
  resolution: string | null;
  escrowAmountUsdc: number;
  filedSlot: number;
  deadlineSlot: number;
}

// ── Similarity Oracle Types ──────────────────────────────────────────

export interface SimilarityResult {
  matchFound: boolean;
  candidates: SimilarityCandidate[];
}

export interface SimilarityCandidate {
  ipAsset: string;            // matched IPAsset pubkey
  score: number;              // 0.0 - 1.0
  matchType: MatchType;
  layer: "perceptual" | "semantic";
  details: string;
}

// ── Evidence Engine Types ────────────────────────────────────────────

export type Jurisdiction =
  | "ID"    // Indonesia
  | "KE"    // Kenya
  | "CO"    // Colombia
  | "CN"    // China
  | "US"    // United States (Federal)
  | "GB"    // United Kingdom
  | "EU"    // European Union
  | "ZA"    // South Africa
  | "GENERIC";

export interface EvidencePackage {
  ipAsset: string;
  jurisdiction: Jurisdiction;
  generatedAt: number;
  packageHash: string;
  downloadUrl: string;
  components: {
    evidenceSummaryPdf: string;
    w3cProvDocument: string;
    blockchainVerification: string;
    contentVerification: string;
    identityVerification: string;
    legalOpinion: string;
    verificationGuide: string;
  };
}

// ── Agent Wallet Types ───────────────────────────────────────────────

export interface AgentWallet {
  agentId: string;             // OAuth subject, API key hash, or DID
  solanaWallet: string;        // Custodial Solana pubkey
  usdcBalance: number;         // In USDC lamports
  createdAt: number;
  lastActivity: number;
}

// ── Search Types ─────────────────────────────────────────────────────

export interface SearchResult {
  assets: IPAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProvenanceChain {
  asset: IPAsset;
  parent: ProvenanceChain | null;
  children: ProvenanceChain[];
  licenses: LicenseTemplate[];
  disputes: Dispute[];
}
