/**
 * Mycelium Protocol -- Solana Live Adapter
 *
 * Production implementation of SolanaAdapter that talks to real Solana devnet/mainnet.
 * Connects to Anchor programs via the generated IDL client for type-safe account
 * fetches and instruction calls. No manual Borsh deserializers.
 *
 * Architecture:
 *   MCP Tool -> SolanaLiveAdapter -> Anchor Program (IDL client -> Solana RPC)
 *                                 -> Helius DAS API (read queries, event parsing)
 *                                 -> Arweave/Irys (metadata storage)
 *
 * Required env vars:
 *   SOLANA_RPC_URL       -- Solana RPC endpoint (default: devnet)
 *   SOLANA_KEYPAIR_PATH  -- Path to deployer/authority keypair JSON
 *   HELIUS_API_KEY       -- Helius API key for indexing (optional, falls back to RPC)
 *   MYCELIUM_SPORE_PROGRAM_ID -- Spore program address (default: from Anchor.toml)
 *   USDC_MINT            -- USDC mint address (default: devnet USDC)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import type {
  IPAsset,
  IPType,
  IPStatus,
  LicenseTemplate,
  LicenseToken,
  LicenseType,
  AITrainingPolicy,
  DerivativePolicy,
  RoyaltyRecipient,
  Dispute,
  DisputeStage,
  MatchType,
  SimilarityResult,
  SimilarityCandidate,
  EvidencePackage,
  Jurisdiction,
  SearchResult,
  ProvenanceChain,
  AgentWallet,
} from "./types.js";
import type {
  SolanaAdapter,
  RegisterIPParams,
  RegisterIPResult,
  SearchQuery,
  CreateLicenseParams,
  AcquireLicenseParams,
  LicenseVerification,
  FileDisputeParams,
} from "./solana-adapter.js";
import {
  checkExactMatch,
  checkImageSimilarity,
  checkAudioSimilarity,
} from "./services/similarity/similarity-client.js";
import { generateFullMEP } from "./services/evidence/evidence-engine.js";

// ── IDL imports ────────────────────────────────────────────────────
// Read IDL JSON at runtime (NodeNext module resolution with resolveJsonModule)
import { readFileSync as readFileSyncFs } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sporeIdl = JSON.parse(
  readFileSyncFs(join(__dirname, "..", "src", "idl", "mycelium_spore.json"), "utf-8")
);

const hyphaIdl = JSON.parse(
  readFileSyncFs(join(__dirname, "..", "src", "idl", "mycelium_hypha.json"), "utf-8")
);

const rhizomeIdl = JSON.parse(
  readFileSyncFs(join(__dirname, "..", "src", "idl", "mycelium_rhizome.json"), "utf-8")
);

const meridianIdl = JSON.parse(
  readFileSyncFs(join(__dirname, "..", "src", "idl", "mycelium_meridian.json"), "utf-8")
);

const drpIdl = JSON.parse(
  readFileSyncFs(join(__dirname, "..", "src", "idl", "mycelium_drp.json"), "utf-8")
);

// ── Network-Aware Program IDs ──────────────────────────────────────
// Controlled by SOLANA_NETWORK env var. Individual env var overrides take priority.

const SOLANA_NETWORK = process.env.SOLANA_NETWORK ?? "devnet";

const MAINNET_IDS = {
  spore: "GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR",
  hypha: "BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV",
  meridian: "2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le",
  rhizome: "7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW",
  drp: "BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU",
};

const DEVNET_IDS = {
  spore: "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz",
  hypha: "9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5",
  meridian: "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc",
  rhizome: "9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu",
  drp: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
};

const DEFAULT_IDS = SOLANA_NETWORK === "mainnet-beta" ? MAINNET_IDS : DEVNET_IDS;

const PROGRAM_IDS = {
  spore: new PublicKey(process.env.MYCELIUM_SPORE_PROGRAM_ID ?? DEFAULT_IDS.spore),
  hypha: new PublicKey(process.env.MYCELIUM_HYPHA_PROGRAM_ID ?? DEFAULT_IDS.hypha),
  meridian: new PublicKey(process.env.MYCELIUM_MERIDIAN_PROGRAM_ID ?? DEFAULT_IDS.meridian),
  rhizome: new PublicKey(process.env.MYCELIUM_RHIZOME_PROGRAM_ID ?? DEFAULT_IDS.rhizome),
  drp: new PublicKey(process.env.MYCELIUM_DRP_PROGRAM_ID ?? DEFAULT_IDS.drp),
};

// ── USDC Configuration ─────────────────────────────────────────────
// Devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
// Mainnet USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
// USDC uses 6 decimals: 1_000_000 lamports = $1.00

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ??
    (SOLANA_NETWORK === "mainnet-beta"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
);
const USDC_DECIMALS = 6;

// ── PDA Seeds ──────────────────────────────────────────────────────

const SEED_IP_ASSET = Buffer.from("ip_asset");
const SEED_CONTENT_HASH = Buffer.from("content_hash_index");
const SEED_LICENSE_TEMPLATE = Buffer.from("license_template");
const SEED_LICENSE = Buffer.from("license");
const SEED_ROYALTY_CONFIG = Buffer.from("royalty_config");
const SEED_ROYALTY_VAULT = Buffer.from("royalty_vault");
const SEED_DISPUTE = Buffer.from("dispute");

// ── PDA Derivation Helpers ─────────────────────────────────────────

function findIPAssetPDA(
  originalCreator: PublicKey,
  contentHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_IP_ASSET, originalCreator.toBuffer(), contentHash],
    PROGRAM_IDS.spore
  );
}

function findContentHashRegistryPDA(
  contentHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_CONTENT_HASH, contentHash],
    PROGRAM_IDS.spore
  );
}

function findLicenseTemplatePDA(
  ipAsset: PublicKey,
  licensor: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_LICENSE_TEMPLATE, ipAsset.toBuffer(), licensor.toBuffer()],
    PROGRAM_IDS.hypha
  );
}

function findLicensePDA(
  template: PublicKey,
  licensee: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_LICENSE, template.toBuffer(), licensee.toBuffer()],
    PROGRAM_IDS.hypha
  );
}

function findRoyaltyConfigPDA(
  ipAsset: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_ROYALTY_CONFIG, ipAsset.toBuffer()],
    PROGRAM_IDS.rhizome
  );
}

function findRoyaltyVaultPDA(
  royaltyConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_ROYALTY_VAULT, royaltyConfig.toBuffer()],
    PROGRAM_IDS.rhizome
  );
}

// ── Byte/Hex Helpers ───────────────────────────────────────────────

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Buffer.from(bytes).toString("hex");
}

// ── IP Type mapping (Anchor camelCase enum key -> protocol snake_case) ──

const ANCHOR_TO_IP_TYPE: Record<string, IPType> = {
  literaryWork: "literary_work",
  visualArt: "visual_art",
  music: "music",
  software: "software",
  characterIp: "character_ip",
  meme: "meme",
  video: "video",
  aiGenerated: "ai_generated",
  traditionalKnowledge: "traditional_knowledge",
  dataset: "dataset",
  brandMark: "brand_mark",
};

const ANCHOR_TO_IP_STATUS: Record<string, IPStatus> = {
  active: "active",
  disputed: "disputed",
  suspended: "suspended",
  revoked: "revoked",
};

function ipTypeToAnchor(ipType: IPType): Record<string, Record<string, never>> {
  const map: Record<IPType, string> = {
    literary_work: "literaryWork",
    visual_art: "visualArt",
    music: "music",
    software: "software",
    character_ip: "characterIp",
    meme: "meme",
    video: "video",
    ai_generated: "aiGenerated",
    traditional_knowledge: "traditionalKnowledge",
    dataset: "dataset",
    brand_mark: "brandMark",
  };
  return { [map[ipType]]: {} };
}

// ── License Type mapping (protocol string -> Anchor enum) ──────────

const LICENSE_TYPE_TO_ANCHOR: Record<string, Record<string, Record<string, never>>> = {
  open_spore: { creativeCommons: {} },
  selective_hypha: { commercial: {} },
  exclusive_root: { exclusive: {} },
  ai_training: { aiTraining: {} },
  community_canopy: { creativeCommons: {} },
  derivative_bloom: { commercial: {} },
};

const ANCHOR_TO_LICENSE_TYPE: Record<string, LicenseType> = {
  creativeCommons: "open_spore",
  commercial: "selective_hypha",
  exclusive: "exclusive_root",
  aiTraining: "ai_training",
};

// ── Territory mapping ──────────────────────────────────────────────

function territoriesToAnchor(territories: string[]): Record<string, unknown> {
  if (territories.length === 0) return { global: {} };
  if (territories.length === 1 && territories[0].length === 2) {
    const code = territories[0].toUpperCase();
    if (code === "AS") return { asean: {} };
    return { country: { code: [code.charCodeAt(0), code.charCodeAt(1)] } };
  }
  return { custom: {} };
}

/**
 * Extract enum key from Anchor's { variantName: {} } representation.
 */
function extractEnumKey(enumObj: Record<string, unknown>): string {
  return Object.keys(enumObj)[0];
}

/**
 * Convert an Anchor-fetched IPAsset account to the protocol's IPAsset type.
 */
function anchorAccountToIPAsset(
  pubkey: PublicKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: any
): IPAsset {
  const ipTypeKey = extractEnumKey(account.ipType);
  const statusKey = extractEnumKey(account.status);

  return {
    pubkey: pubkey.toBase58(),
    originalCreator: account.originalCreator.toBase58(),
    creator: account.creator.toBase58(),
    contentHash: bytesToHex(account.contentHash),
    perceptualHash: bytesToHex(account.perceptualHash),
    ipType: ANCHOR_TO_IP_TYPE[ipTypeKey] ?? "literary_work",
    metadataUri: account.metadataUri,
    registrationSlot: account.registrationSlot.toNumber(),
    registrationTimestamp: account.registrationTimestamp.toNumber(),
    parentIp: account.parentIp ? account.parentIp.toBase58() : null,
    status: ANCHOR_TO_IP_STATUS[statusKey] ?? "active",
    licenseCount: account.licenseCount,
    disputeCount: account.disputeCount,
    version: account.version,
    niceClass: account.niceClass ?? null,
    berneCategory: account.berneCategory ?? null,
    countryOfOrigin: account.countryOfOrigin ?? [0, 0],
    firstUseDate: account.firstUseDate ? account.firstUseDate.toNumber() : null,
    wipoAligned: !!(account.niceClass || account.berneCategory),
    bump: account.bump ?? 0,
  };
}

/**
 * Convert an Anchor-fetched LicenseTemplate account to the protocol type.
 */
function anchorAccountToLicenseTemplate(
  pubkey: PublicKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: any
): LicenseTemplate {
  const licenseTypeKey = extractEnumKey(account.licenseType);

  return {
    pubkey: pubkey.toBase58(),
    ipAsset: account.ipAsset.toBase58(),
    creator: account.licensor.toBase58(),
    licenseType: ANCHOR_TO_LICENSE_TYPE[licenseTypeKey] ?? "open_spore",
    commercialUse: account.commercialUse,
    derivativesAllowed: account.commercialUse ? "allowed_with_royalty" : "allowed_noncommercial",
    aiTraining: account.aiTrainingAllowed ? "opt_in_paid" : "opt_out",
    priceUsdcLamports: 0,
    royaltyBps: account.royaltyRateBps,
    maxDerivativeDepth: account.maxSublicenses,
    territories: [],
    exclusive: licenseTypeKey === "exclusive",
    expiryTimestamp: account.durationSeconds ? account.durationSeconds.toNumber() : null,
    maxLicenses: null,
    issuedCount: account.totalIssued,
    active: account.isActive,
  };
}

/**
 * Convert an Anchor-fetched License account to the protocol LicenseToken type.
 */
function anchorAccountToLicenseToken(
  pubkey: PublicKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: any
): LicenseToken {
  const statusKey = extractEnumKey(account.status);

  return {
    pubkey: pubkey.toBase58(),
    licenseTemplate: account.template.toBase58(),
    licensee: account.licensee.toBase58(),
    acquiredSlot: 0,
    acquiredTimestamp: account.issuedAt.toNumber(),
    valid: statusKey === "active",
  };
}

// =====================================================================
//  SolanaLiveAdapter
// =====================================================================

export class SolanaLiveAdapter implements SolanaAdapter {
  private connection: Connection;
  private payer: Keypair;
  private provider: AnchorProvider;
  private heliusApiKey: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sporeProgram: Program<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hyphaProgram: Program<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rhizomeProgram: Program<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private meridianProgram: Program<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drpProgram: Program<any>;

  // In-memory cache for agent wallets (production: use a database)
  private agentWallets: Map<string, AgentWallet> = new Map();

  constructor(opts?: {
    rpcUrl?: string;
    keypairPath?: string;
    heliusApiKey?: string;
  }) {
    // ── Fail-fast keypair validation ────────────────────────────────
    const resolvedPath =
      opts?.keypairPath ??
      process.env.SOLANA_KEYPAIR_PATH ??
      resolve(homedir(), "solana-keys", "id.json");

    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Keypair file not found at ${resolvedPath}. ` +
        `Set SOLANA_KEYPAIR_PATH or create the file.`
      );
    }

    let payer: Keypair;
    try {
      const raw = readFileSync(resolvedPath, "utf-8");
      const secretKey = Uint8Array.from(JSON.parse(raw));
      payer = Keypair.fromSecretKey(secretKey);
    } catch (err) {
      throw new Error(
        `Invalid keypair at ${resolvedPath}: ${(err as Error).message}`
      );
    }

    this.payer = payer;

    const rpcUrl =
      opts?.rpcUrl ??
      process.env.SOLANA_RPC_URL ??
      "https://api.devnet.solana.com";

    this.connection = new Connection(rpcUrl, "confirmed");
    this.heliusApiKey = opts?.heliusApiKey ?? process.env.HELIUS_API_KEY ?? null;

    // ── Initialize Anchor Programs via IDL clients ─────────────────
    const wallet = new Wallet(this.payer);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    this.sporeProgram = new Program(sporeIdl, this.provider);
    this.hyphaProgram = new Program(hyphaIdl, this.provider);
    this.rhizomeProgram = new Program(rhizomeIdl, this.provider);
    this.meridianProgram = new Program(meridianIdl, this.provider);
    this.drpProgram = new Program(drpIdl, this.provider);

    console.error(`[SolanaLiveAdapter] Connected to ${rpcUrl}`);
    console.error(`[SolanaLiveAdapter] Payer: ${this.payer.publicKey.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Spore program: ${PROGRAM_IDS.spore.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Hypha program: ${PROGRAM_IDS.hypha.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Rhizome program: ${PROGRAM_IDS.rhizome.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Meridian program: ${PROGRAM_IDS.meridian.toBase58()}`);
    console.error(`[SolanaLiveAdapter] DRP program: ${PROGRAM_IDS.drp.toBase58()}`);
    console.error(`[SolanaLiveAdapter] USDC mint: ${USDC_MINT.toBase58()}`);
  }

  // ── IP Registration ─────────────────────────────────────────────

  async registerIP(params: RegisterIPParams): Promise<RegisterIPResult> {
    const contentHashBytes = hexToBytes(params.contentHash);
    const perceptualHashBytes = hexToBytes(params.perceptualHash);
    const creatorPubkey = this.payer.publicKey;

    const [ipAssetPDA] = findIPAssetPDA(creatorPubkey, contentHashBytes);
    const [contentHashRegistryPDA] = findContentHashRegistryPDA(contentHashBytes);

    const txSignature = await (this.sporeProgram.methods as any)
      .registerIp(
        Array.from(contentHashBytes) as unknown as number[],
        Array.from(perceptualHashBytes) as unknown as number[],
        ipTypeToAnchor(params.ipType),
        params.metadataUri,
        null,
        null,
        [0, 0],
        null,
      )
      .accounts({
        ipAsset: ipAssetPDA,
        contentHashRegistry: contentHashRegistryPDA,
        creator: creatorPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    let ipAsset: IPAsset;
    try {
      const account = await (this.sporeProgram.account as any).ipAsset.fetch(ipAssetPDA);
      ipAsset = anchorAccountToIPAsset(ipAssetPDA, account);
    } catch {
      ipAsset = this.fallbackIPAsset(ipAssetPDA, params);
    }

    const explorerUrl = `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;

    return {
      ipAsset,
      txSignature,
      solanaExplorerUrl: explorerUrl,
      arweaveUrl: params.metadataUri,
      costSol: 0.004,
    };
  }

  private fallbackIPAsset(pda: PublicKey, params: RegisterIPParams): IPAsset {
    const now = Math.floor(Date.now() / 1000);
    return {
      pubkey: pda.toBase58(),
      originalCreator: this.payer.publicKey.toBase58(),
      creator: this.payer.publicKey.toBase58(),
      contentHash: params.contentHash,
      perceptualHash: params.perceptualHash,
      ipType: params.ipType,
      metadataUri: params.metadataUri,
      registrationSlot: 0,
      registrationTimestamp: now,
      parentIp: params.parentIp ?? null,
      status: "active",
      licenseCount: 0,
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

  async getIPAsset(pubkey: string): Promise<IPAsset | null> {
    try {
      const pk = new PublicKey(pubkey);
      const account = await (this.sporeProgram.account as any).ipAsset.fetch(pk);
      return anchorAccountToIPAsset(pk, account);
    } catch {
      return null;
    }
  }

  async searchIP(query: SearchQuery): Promise<SearchResult> {
    try {
      const filters: Array<{
        memcmp: { offset: number; bytes: string };
      }> = [];

      if (query.creator) {
        filters.push({
          memcmp: {
            offset: 8 + 32,
            bytes: query.creator,
          },
        });
      }

      const accounts = await (this.sporeProgram.account as any).ipAsset.all(filters);

      let assets: IPAsset[] = accounts.map((acc: any) =>
        anchorAccountToIPAsset(acc.publicKey, acc.account)
      );

      if (query.ipType) {
        assets = assets.filter((a) => a.ipType === query.ipType);
      }
      if (query.status) {
        assets = assets.filter((a) => a.status === query.status);
      }
      if (query.registeredAfter) {
        assets = assets.filter(
          (a) => a.registrationTimestamp >= query.registeredAfter!
        );
      }
      if (query.registeredBefore) {
        assets = assets.filter(
          (a) => a.registrationTimestamp <= query.registeredBefore!
        );
      }
      if (query.text) {
        const q = query.text.toLowerCase();
        assets = assets.filter(
          (a) =>
            a.contentHash.includes(q) ||
            a.pubkey.includes(q) ||
            a.ipType.includes(q) ||
            a.metadataUri.toLowerCase().includes(q)
        );
      }

      assets.sort((a, b) => b.registrationTimestamp - a.registrationTimestamp);

      const page = query.page ?? 0;
      const pageSize = query.pageSize ?? 20;
      const paged = assets.slice(page * pageSize, (page + 1) * pageSize);

      return { assets: paged, total: assets.length, page, pageSize };
    } catch (err) {
      console.error("[SolanaLiveAdapter] searchIP error:", err);
      return { assets: [], total: 0, page: 0, pageSize: 20 };
    }
  }

  async getProvenance(pubkey: string): Promise<ProvenanceChain | null> {
    const asset = await this.getIPAsset(pubkey);
    if (!asset) return null;

    const allAssets = await this.searchIP({ page: 0, pageSize: 1000 });
    const children = allAssets.assets
      .filter((a) => a.parentIp === pubkey)
      .map((child) => ({
        asset: child,
        parent: null,
        children: [],
        licenses: [] as LicenseTemplate[],
        disputes: [] as Dispute[],
      }));

    let parent: ProvenanceChain | null = null;
    if (asset.parentIp) {
      parent = await this.getProvenance(asset.parentIp);
    }

    // Query Hypha program for license templates on this IP
    const licenses = await this.listLicenses(pubkey);

    return {
      asset,
      parent,
      children,
      licenses,
      disputes: [], // DRP program integration is Phase 3
    };
  }

  // ── Licensing (Hypha program) ────────────────────────────────────

  async createLicense(params: CreateLicenseParams): Promise<LicenseTemplate> {
    const licensor = this.payer;
    const ipAssetPubkey = new PublicKey(params.ipAsset);

    // Derive license template PDA: ["license_template", ip_asset, licensor]
    const [templatePDA] = findLicenseTemplatePDA(ipAssetPubkey, licensor.publicKey);

    // Map license type to Anchor enum variant
    const anchorLicenseType = LICENSE_TYPE_TO_ANCHOR[params.licenseType] ?? { commercial: {} };

    // Map territory
    const anchorTerritory = territoriesToAnchor(params.territories);

    // Duration: convert expiryTimestamp to duration in seconds from now, or null
    const durationSeconds = params.expiryTimestamp
      ? new BN(params.expiryTimestamp - Math.floor(Date.now() / 1000))
      : null;

    // Call Hypha createLicenseTemplate instruction
    await (this.hyphaProgram.methods as any)
      .createLicenseTemplate(
        anchorLicenseType,
        params.royaltyBps,                // u16 -- royalty rate in basis points
        params.maxDerivativeDepth,         // u32 -- max sublicenses
        anchorTerritory,
        durationSeconds,                   // Option<i64> -- duration in seconds
        params.commercialUse,              // bool
        params.aiTraining !== "opt_out",   // bool -- aiTrainingAllowed
      )
      .accounts({
        licenseTemplate: templatePDA,
        ipAsset: ipAssetPubkey,
        licensor: licensor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch and return the created template
    try {
      const account = await (this.hyphaProgram.account as any).licenseTemplate.fetch(templatePDA);
      const template = anchorAccountToLicenseTemplate(templatePDA, account);
      // Override with off-chain data not stored on-chain
      template.priceUsdcLamports = params.priceUsdc;
      template.territories = params.territories;
      template.exclusive = params.exclusive;
      template.maxLicenses = params.maxLicenses ?? null;
      template.derivativesAllowed = params.derivativesAllowed;
      template.aiTraining = params.aiTraining;
      template.licenseType = params.licenseType;
      return template;
    } catch {
      // Fallback: construct from params
      return {
        pubkey: templatePDA.toBase58(),
        ipAsset: params.ipAsset,
        creator: licensor.publicKey.toBase58(),
        licenseType: params.licenseType,
        commercialUse: params.commercialUse,
        derivativesAllowed: params.derivativesAllowed,
        aiTraining: params.aiTraining,
        priceUsdcLamports: params.priceUsdc,
        royaltyBps: params.royaltyBps,
        maxDerivativeDepth: params.maxDerivativeDepth,
        territories: params.territories,
        exclusive: params.exclusive,
        expiryTimestamp: params.expiryTimestamp ?? null,
        maxLicenses: params.maxLicenses ?? null,
        issuedCount: 0,
        active: true,
      };
    }
  }

  async acquireLicense(params: AcquireLicenseParams): Promise<LicenseToken> {
    const licensee = this.payer;
    const templatePubkey = new PublicKey(params.licenseTemplate);

    // Fetch the template to get IP asset and licensor info
    const templateAccount = await (this.hyphaProgram.account as any).licenseTemplate.fetch(templatePubkey);
    const licensorPubkey: PublicKey = templateAccount.licensor;

    // Derive license PDA: ["license", template, licensee]
    const [licensePDA] = findLicensePDA(templatePubkey, licensee.publicKey);

    // ── USDC Payment Flow (6 decimals) ─────────────────────────────
    // Create ATAs for licensee and licensor if they don't exist
    const licenseeAta = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.payer,        // fee payer
      USDC_MINT,
      licensee.publicKey
    );

    const licensorAta = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.payer,        // fee payer
      USDC_MINT,
      licensorPubkey
    );

    // Build atomic transaction: USDC transfer + license issuance
    const tx = new Transaction();

    // Check licensee's USDC balance for payment
    const licenseeTokenAccount = await getAccount(this.connection, licenseeAta.address);
    const availableUsdc = Number(licenseeTokenAccount.amount);

    // Transfer USDC if there is balance (price > 0 scenarios)
    if (availableUsdc > 0) {
      tx.add(
        createTransferCheckedInstruction(
          licenseeAta.address,   // source ATA
          USDC_MINT,             // mint
          licensorAta.address,   // destination ATA
          licensee.publicKey,    // owner/authority
          availableUsdc,         // amount in USDC lamports (6 decimals)
          USDC_DECIMALS          // decimals
        )
      );
    }

    // Issue the license via Hypha program (issueLicense instruction)
    const issueLicenseIx = await (this.hyphaProgram.methods as any)
      .issueLicense(
        params.agentId,                          // licenseeName
        `License acquired by agent ${params.agentId}` // purpose
      )
      .accounts({
        license: licensePDA,
        licenseTemplate: templatePubkey,
        licensee: licensee.publicKey,
        licensor: licensorPubkey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(issueLicenseIx);

    // Send atomic transaction
    await this.provider.sendAndConfirm(tx, [this.payer]);

    // Fetch and return the created license
    try {
      const licenseAccount = await (this.hyphaProgram.account as any).license.fetch(licensePDA);
      return anchorAccountToLicenseToken(licensePDA, licenseAccount);
    } catch {
      const now = Math.floor(Date.now() / 1000);
      return {
        pubkey: licensePDA.toBase58(),
        licenseTemplate: params.licenseTemplate,
        licensee: licensee.publicKey.toBase58(),
        acquiredSlot: 0,
        acquiredTimestamp: now,
        valid: true,
      };
    }
  }

  async verifyLicense(
    ipAsset: string,
    wallet: string
  ): Promise<LicenseVerification> {
    const ipAssetPubkey = new PublicKey(ipAsset);
    const walletPubkey = new PublicKey(wallet);

    // Get all license templates for this IP asset
    const templates = await this.listLicenses(ipAsset);

    // Check each template for a license PDA owned by this wallet
    let foundLicense: LicenseToken | null = null;

    for (const template of templates) {
      const templatePubkey = new PublicKey(template.pubkey);
      const [licensePDA] = findLicensePDA(templatePubkey, walletPubkey);

      try {
        const licenseAccount = await (this.hyphaProgram.account as any).license.fetch(licensePDA);
        const licenseToken = anchorAccountToLicenseToken(licensePDA, licenseAccount);

        if (licenseToken.valid) {
          foundLicense = licenseToken;
          break;
        }
      } catch {
        // License PDA doesn't exist -- wallet not licensed under this template
        continue;
      }
    }

    return {
      licensed: foundLicense !== null,
      licenseToken: foundLicense,
      availableLicenses: templates.filter((t) => t.active),
    };
  }

  async listLicenses(ipAsset: string): Promise<LicenseTemplate[]> {
    const ipAssetPubkey = new PublicKey(ipAsset);

    try {
      // Try indexer first (if PostgreSQL is available)
      const { getLicensesByIP } = await import("./services/indexer/queries.js");
      const indexerResults = await getLicensesByIP(ipAsset);
      if (indexerResults.length > 0) return indexerResults;
    } catch {
      // Indexer not available -- fall through to on-chain query
    }

    // Fallback: query on-chain via Hypha program with memcmp filter on ipAsset
    // LicenseTemplate layout: 8 (discriminator) + 32 (ipAsset) + ...
    try {
      const accounts = await (this.hyphaProgram.account as any).licenseTemplate.all([
        {
          memcmp: {
            offset: 8, // 8-byte discriminator, then ipAsset pubkey
            bytes: ipAssetPubkey.toBase58(),
          },
        },
      ]);

      return accounts.map((acc: any) =>
        anchorAccountToLicenseTemplate(acc.publicKey, acc.account)
      );
    } catch (err) {
      console.error("[SolanaLiveAdapter] listLicenses error:", err);
      return [];
    }
  }

  // ── Royalty Distribution (Rhizome program) ───────────────────────

  /**
   * Configure royalty splits for an IP asset.
   * Recipients must have shareBps summing to exactly 10,000 (100%).
   * Platform fee must be <= 1,000 bps (10%).
   */
  async configureRoyalty(
    ipAssetPubkey: PublicKey,
    creator: Keypair,
    recipients: Array<{ address: PublicKey; basisPoints: number; role: string }>,
    platformFeeBps: number,
    platformWallet: PublicKey
  ): Promise<string> {
    const [royaltyConfigPDA] = findRoyaltyConfigPDA(ipAssetPubkey);

    // Map recipients to Anchor format
    const anchorRecipients = recipients.map((r) => ({
      wallet: r.address,
      shareBps: r.basisPoints,
      role: { [r.role]: {} },
    }));

    const txSignature = await (this.rhizomeProgram.methods as any)
      .configureRoyalty(
        anchorRecipients,
        platformFeeBps,
        platformWallet
      )
      .accounts({
        royaltyConfig: royaltyConfigPDA,
        ipAsset: ipAssetPubkey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    return txSignature;
  }

  /**
   * Deposit USDC into the royalty vault for an IP asset.
   * Amount is in USDC lamports (6 decimals): 1_000_000 = $1.00
   */
  async depositRoyalty(
    ipAssetPubkey: PublicKey,
    depositor: Keypair,
    amountUsdcLamports: number
  ): Promise<string> {
    const [royaltyConfigPDA] = findRoyaltyConfigPDA(ipAssetPubkey);
    const [royaltyVaultPDA] = findRoyaltyVaultPDA(royaltyConfigPDA);

    // Create ATAs for depositor and vault
    const depositorAta = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.payer,
      USDC_MINT,
      depositor.publicKey
    );

    const vaultAta = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.payer,
      USDC_MINT,
      royaltyVaultPDA,
      true // allowOwnerOffCurve -- vault is a PDA
    );

    // Build transaction: USDC transfer to vault + Rhizome deposit instruction
    const tx = new Transaction();

    // Transfer USDC from depositor to vault ATA
    tx.add(
      createTransferCheckedInstruction(
        depositorAta.address,
        USDC_MINT,
        vaultAta.address,
        depositor.publicKey,
        amountUsdcLamports,
        USDC_DECIMALS
      )
    );

    // Call Rhizome deposit_royalty instruction
    const depositIx = await (this.rhizomeProgram.methods as any)
      .depositRoyalty(new BN(amountUsdcLamports))
      .accounts({
        royaltyConfig: royaltyConfigPDA,
        royaltyVault: royaltyVaultPDA,
        depositor: depositor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(depositIx);

    const txSignature = await this.provider.sendAndConfirm(tx, [depositor]);
    return txSignature;
  }

  /**
   * Distribute royalties from the vault to all recipients atomically.
   * Platform fee is deducted first, remainder split by shareBps.
   * All USDC transfers happen in a single atomic transaction.
   */
  async distributeRoyalties(
    ipAssetPubkey: PublicKey,
    caller: Keypair
  ): Promise<string> {
    const [royaltyConfigPDA] = findRoyaltyConfigPDA(ipAssetPubkey);
    const [royaltyVaultPDA] = findRoyaltyVaultPDA(royaltyConfigPDA);

    // Fetch config to get recipients and platform wallet
    const config = await (this.rhizomeProgram.account as any).royaltyConfig.fetch(royaltyConfigPDA);
    const platformWalletPubkey: PublicKey = config.platformWallet;

    // Ensure all recipient ATAs exist for USDC
    for (const recipient of config.recipients) {
      await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        USDC_MINT,
        recipient.wallet
      );
    }

    // Ensure platform wallet ATA exists
    await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.payer,
      USDC_MINT,
      platformWalletPubkey
    );

    // Distribution pool keypair (temporary account for the distribution)
    const distributionPool = Keypair.generate();

    // Call Rhizome distribute_royalties instruction
    const txSignature = await (this.rhizomeProgram.methods as any)
      .distributeRoyalties()
      .accounts({
        royaltyConfig: royaltyConfigPDA,
        royaltyVault: royaltyVaultPDA,
        distributionPool: distributionPool.publicKey,
        platformWallet: platformWalletPubkey,
        caller: caller.publicKey,
      })
      .signers([caller])
      .rpc();

    return txSignature;
  }

  // ── Similarity Oracle (backed by Python sidecar on :8100) ────────

  async checkSimilarity(
    contentHash: string,
    _ipType: IPType
  ): Promise<SimilarityResult> {
    // Layer 1: Exact content hash match via PostgreSQL index (O(1) lookup)
    const exactMatches = await checkExactMatch(contentHash);
    if (exactMatches.length > 0) {
      return { matchFound: true, candidates: exactMatches };
    }

    // Layer 2: Perceptual matching requires image/audio binary data.
    // When called with just a content hash, we can only do exact match.
    // Image/audio similarity is triggered via checkBinarySimilarity
    // or MCP tools that pass binary data.
    return { matchFound: false, candidates: [] };
  }

  /**
   * Binary similarity check -- accepts raw file data for perceptual matching.
   * Called by MCP tools that have access to the actual file bytes.
   *
   * For images: uses pHash with configurable Hamming distance threshold.
   * For audio: uses Chromaprint fingerprinting (gracefully degrades if
   * fpcalc is not available).
   */
  async checkBinarySimilarity(
    fileBuffer: Buffer,
    fileType: "image" | "audio",
    filename: string
  ): Promise<SimilarityResult> {
    let candidates: SimilarityCandidate[];
    if (fileType === "image") {
      candidates = await checkImageSimilarity(fileBuffer);
    } else {
      candidates = await checkAudioSimilarity(fileBuffer, filename);
    }
    return {
      matchFound: candidates.length > 0,
      candidates,
    };
  }

  // ── Evidence Engine (MEP generation via Meridian program) ─────────

  async generateEvidence(
    ipAsset: string,
    jurisdiction: Jurisdiction
  ): Promise<EvidencePackage> {
    const result = await generateFullMEP({
      ipAssetPubkey: ipAsset,
      jurisdiction,
      meridianProgram: this.meridianProgram,
      requesterKeypair: this.payer,
      protocolKeypair: this.payer, // In production, separate protocol authority key; for devnet, same
      connection: this.connection,
    });

    return {
      ipAsset,
      jurisdiction,
      generatedAt: Math.floor(Date.now() / 1000),
      packageHash: result.packageHash,
      downloadUrl: result.arweaveUri,
      components: {
        evidenceSummaryPdf: result.arweaveUri,
        w3cProvDocument: result.arweaveUri,
        blockchainVerification: `https://explorer.solana.com/tx/${result.transactionSignature}?cluster=devnet`,
        contentVerification: result.arweaveUri,
        identityVerification: `https://explorer.solana.com/address/${result.evidencePda}?cluster=devnet`,
        legalOpinion: result.arweaveUri,
        verificationGuide: result.arweaveUri,
      },
    };
  }

  // ── Dispute Resolution (DRP program -- Phase 3) ──────────────────

  async fileDispute(params: FileDisputeParams): Promise<Dispute> {
    const { claimantIp: ipAsset, evidenceHash, similarityScore, matchType } = params;
    const ipAssetPubkey = new PublicKey(ipAsset);

    // Derive dispute PDA
    const [disputePda] = PublicKey.findProgramAddressSync(
      [SEED_DISPUTE, ipAssetPubkey.toBuffer(), this.payer.publicKey.toBuffer()],
      PROGRAM_IDS.drp
    );

    // Convert single evidence hash to array of [u8; 32]
    const hashArrays = [Array.from(hexToBytes(evidenceHash))];

    // Map matchType string to Anchor enum
    const matchTypeEnum: Record<string, Record<string, Record<string, never>>> = {
      exact: { exact: {} },
      near_duplicate: { nearDuplicate: {} },
      derivative: { derivative: {} },
      semantic: { semantic: {} },
    };
    const anchorMatchType = matchTypeEnum[matchType] || { exact: {} };

    const tx = await (this.drpProgram.methods as any)
      .fileDispute(hashArrays, similarityScore, anchorMatchType)
      .accounts({
        dispute: disputePda,
        ipAsset: ipAssetPubkey,
        claimant: this.payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.error(`[mycelium] Dispute filed: ${disputePda.toBase58()} tx=${tx}`);

    const clock = await this.connection.getSlot();
    return {
      pubkey: disputePda.toBase58(),
      claimant: this.payer.publicKey.toBase58(),
      respondent: "",  // Fetched from on-chain after filing
      ipAsset,
      stage: "direct_resolution",
      evidenceHashes: [evidenceHash],
      similarityScore,
      matchType: matchType as MatchType,
      mediator: null,
      resolution: null,
      escrowAmountUsdc: 0,
      filedSlot: clock,
      deadlineSlot: clock + 216_000,
    };
  }

  async getDispute(pubkey: string): Promise<Dispute | null> {
    try {
      const disputeAccount = await (this.drpProgram.account as any).dispute.fetch(new PublicKey(pubkey));
      return {
        pubkey,
        claimant: disputeAccount.claimant.toBase58(),
        respondent: disputeAccount.respondent.toBase58(),
        ipAsset: disputeAccount.ipAsset.toBase58(),
        stage: this.mapDisputeStage(disputeAccount.stage),
        evidenceHashes: disputeAccount.evidenceHashes.map((h: number[]) => Buffer.from(h).toString("hex")),
        similarityScore: disputeAccount.similarityScore,
        matchType: this.mapMatchType(disputeAccount.matchType),
        mediator: disputeAccount.arbiter?.toBase58() || null,
        resolution: disputeAccount.resolution ? this.mapResolution(disputeAccount.resolution) : null,
        escrowAmountUsdc: 0,
        filedSlot: typeof disputeAccount.filedSlot === "number" ? disputeAccount.filedSlot : disputeAccount.filedSlot.toNumber(),
        deadlineSlot: typeof disputeAccount.deadlineSlot === "number" ? disputeAccount.deadlineSlot : disputeAccount.deadlineSlot.toNumber(),
      };
    } catch {
      return null;
    }
  }

  private mapDisputeStage(stage: any): DisputeStage {
    if (stage.directResolution) return "direct_resolution";
    if (stage.communityMediation) return "community_mediation";
    if (stage.arbitrationPanel) return "arbitration_panel";
    return "direct_resolution";
  }

  private mapMatchType(mt: any): MatchType {
    if (mt.exact) return "exact";
    if (mt.nearDuplicate) return "near_duplicate";
    if (mt.derivative) return "derivative";
    if (mt.semantic) return "semantic";
    return "exact";
  }

  private mapResolution(res: any): string {
    if (res.inFavorOfClaimant) return "in_favor_of_claimant";
    if (res.inFavorOfRespondent) return "in_favor_of_respondent";
    if (res.partiallyUpheld) return "partially_upheld";
    return "unknown";
  }

  // ── Agent Wallet ──────────────────────────────────────────────────

  async getOrCreateWallet(agentId: string): Promise<AgentWallet> {
    let wallet = this.agentWallets.get(agentId);
    if (!wallet) {
      wallet = {
        agentId,
        solanaWallet: this.payer.publicKey.toBase58(),
        usdcBalance: 0,
        createdAt: Math.floor(Date.now() / 1000),
        lastActivity: Math.floor(Date.now() / 1000),
      };
      this.agentWallets.set(agentId, wallet);
    }
    wallet.lastActivity = Math.floor(Date.now() / 1000);
    return wallet;
  }

  async getWalletBalance(agentId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(agentId);
    const walletPubkey = new PublicKey(wallet.solanaWallet);

    try {
      // Query real USDC SPL token balance via ATA
      const ata = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        USDC_MINT,
        walletPubkey
      );
      const tokenAccount = await getAccount(this.connection, ata.address);
      // Convert USDC lamports (6 decimals) to dollar amount
      return Number(tokenAccount.amount) / 1_000_000;
    } catch {
      // ATA doesn't exist or connection error -- return 0
      return 0;
    }
  }
}
