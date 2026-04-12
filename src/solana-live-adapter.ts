/**
 * Mycelium Protocol — Solana Live Adapter
 *
 * Production implementation of SolanaAdapter that talks to real Solana devnet/mainnet.
 * Connects to Anchor programs, Helius for indexing, and provides real on-chain operations.
 *
 * Architecture:
 *   MCP Tool → SolanaLiveAdapter → Anchor Program (Solana RPC)
 *                                → Helius DAS API (read queries, event parsing)
 *                                → Arweave/Irys (metadata storage)
 *
 * Required env vars:
 *   SOLANA_RPC_URL       — Solana RPC endpoint (default: devnet)
 *   SOLANA_KEYPAIR_PATH  — Path to deployer/authority keypair JSON
 *   HELIUS_API_KEY       — Helius API key for indexing (optional, falls back to RPC)
 *   MYCELIUM_SPORE_PROGRAM_ID — Spore program address (default: from Anchor.toml)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
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
  Dispute,
  SimilarityResult,
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

// ── Program IDs (from Anchor.toml devnet deployment) ────────────────

const PROGRAM_IDS = {
  spore: new PublicKey(
    process.env.MYCELIUM_SPORE_PROGRAM_ID ??
      "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz"
  ),
  hypha: new PublicKey("9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5"),
  meridian: new PublicKey("7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc"),
  rhizome: new PublicKey("9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu"),
};

const SEED_IP_ASSET = Buffer.from("ip_asset");

// ── Account data layout constants (matching Anchor struct) ──────────
// These map to the on-chain IPAsset account layout after deserialization.
// Anchor uses an 8-byte discriminator prefix.

const ANCHOR_DISCRIMINATOR_SIZE = 8;

// IPAsset field offsets (after discriminator):
// original_creator: 32 bytes
// creator: 32 bytes
// content_hash: 32 bytes
// perceptual_hash: 32 bytes
// ip_type: 2 bytes (discriminant + variant)
// metadata_uri: 4 + up to 128 bytes (Borsh string)
// registration_slot: 8 bytes (u64)
// registration_timestamp: 8 bytes (i64)
// parent_ip: 1 + 32 bytes (Option<Pubkey>)
// status: 2 bytes
// license_count: 4 bytes (u32)
// dispute_count: 4 bytes (u32)
// version: 2 bytes (u16)
// bump: 1 byte

const IP_TYPE_MAP: IPType[] = [
  "literary_work",
  "visual_art",
  "music",
  "software",
  "character_ip",
  "meme",
  "video",
  "ai_generated",
  "traditional_knowledge",
  "dataset",
  "brand_mark",
];

const IP_STATUS_MAP: IPStatus[] = ["active", "disputed", "suspended", "revoked"];

// ── Helpers ─────────────────────────────────────────────────────────

function findIPAssetPDA(
  originalCreator: PublicKey,
  contentHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_IP_ASSET, originalCreator.toBuffer(), contentHash],
    PROGRAM_IDS.spore
  );
}

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Deserialize an IPAsset from raw account data (Anchor layout).
 * This is a manual deserializer — in production, use the generated Anchor IDL types.
 */
function deserializeIPAsset(
  pubkey: PublicKey,
  data: Buffer
): IPAsset | null {
  if (data.length < ANCHOR_DISCRIMINATOR_SIZE + 32 + 32 + 32 + 32) {
    return null;
  }

  let offset = ANCHOR_DISCRIMINATOR_SIZE;

  // original_creator: Pubkey (32 bytes)
  const originalCreator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // creator: Pubkey (32 bytes)
  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // content_hash: [u8; 32]
  const contentHash = data.subarray(offset, offset + 32);
  offset += 32;

  // perceptual_hash: [u8; 32]
  const perceptualHash = data.subarray(offset, offset + 32);
  offset += 32;

  // ip_type: enum (1 byte discriminant)
  const ipTypeIdx = data[offset];
  offset += 1;
  // Skip variant padding byte
  offset += 1;

  // metadata_uri: Borsh string (4 byte length + data)
  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const metadataUri = data.subarray(offset, offset + uriLen).toString("utf-8");
  offset += uriLen;
  // Advance past the allocated max space (128 bytes total for string data)
  // The remaining padding bytes after the string data
  const uriPadding = 128 - uriLen;
  if (uriPadding > 0) offset += uriPadding;

  // registration_slot: u64 (8 bytes, little-endian)
  const registrationSlot = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // registration_timestamp: i64 (8 bytes, little-endian)
  const registrationTimestamp = Number(data.readBigInt64LE(offset));
  offset += 8;

  // parent_ip: Option<Pubkey> (1 byte tag + 32 bytes if Some)
  const hasParent = data[offset] === 1;
  offset += 1;
  let parentIp: string | null = null;
  if (hasParent) {
    parentIp = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  }
  offset += 32; // Always advance 32 regardless of Some/None

  // status: enum (1 byte discriminant)
  const statusIdx = data[offset];
  offset += 1;
  offset += 1; // padding

  // license_count: u32
  const licenseCount = data.readUInt32LE(offset);
  offset += 4;

  // dispute_count: u32
  const disputeCount = data.readUInt32LE(offset);
  offset += 4;

  // version: u16
  const version = data.readUInt16LE(offset);
  offset += 2;

  return {
    pubkey: pubkey.toBase58(),
    originalCreator: originalCreator.toBase58(),
    creator: creator.toBase58(),
    contentHash: bytesToHex(contentHash),
    perceptualHash: bytesToHex(perceptualHash),
    ipType: IP_TYPE_MAP[ipTypeIdx] ?? "literary_work",
    metadataUri,
    registrationSlot,
    registrationTimestamp,
    parentIp,
    status: IP_STATUS_MAP[statusIdx] ?? "active",
    licenseCount,
    disputeCount,
    version,
  };
}

// ── IP Type to Anchor enum variant ──────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════
//  SolanaLiveAdapter
// ═══════════════════════════════════════════════════════════════════════

export class SolanaLiveAdapter implements SolanaAdapter {
  private connection: Connection;
  private payer: Keypair;
  private heliusApiKey: string | null;

  // In-memory cache for agent wallets (production: use a database)
  private agentWallets: Map<string, AgentWallet> = new Map();

  constructor(opts?: {
    rpcUrl?: string;
    keypairPath?: string;
    heliusApiKey?: string;
  }) {
    // ── Fail-fast keypair validation ────────────────────────────────
    // Validate keypair at construction time so the server fails at startup,
    // not on the first request. This prevents silent failures.
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

    console.error(`[SolanaLiveAdapter] Connected to ${rpcUrl}`);
    console.error(`[SolanaLiveAdapter] Payer: ${this.payer.publicKey.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Spore program: ${PROGRAM_IDS.spore.toBase58()}`);
  }

  // ── IP Registration ─────────────────────────────────────────────

  async registerIP(params: RegisterIPParams): Promise<RegisterIPResult> {
    const contentHashBytes = hexToBytes(params.contentHash);
    const perceptualHashBytes = hexToBytes(params.perceptualHash);
    const creatorPubkey = this.payer.publicKey;

    const [ipAssetPDA, bump] = findIPAssetPDA(creatorPubkey, contentHashBytes);

    // Build the Anchor instruction manually.
    // In production with full Anchor client, this would use program.methods.registerIp(...)
    // For now, we use the raw instruction builder pattern.

    // Anchor instruction discriminator for register_ip:
    // SHA-256("global:register_ip")[0..8]
    const discriminator = Buffer.from([
      0x47, 0x97, 0x6c, 0x5c, 0x87, 0x16, 0xad, 0x3f,
    ]);

    // Encode instruction data:
    // discriminator (8) + content_hash (32) + perceptual_hash (32) +
    // ip_type (1) + metadata_uri (4 + len)
    const ipTypeIndex = IP_TYPE_MAP.indexOf(params.ipType);
    const uriBytes = Buffer.from(params.metadataUri, "utf-8");
    const uriBytesLen = Buffer.alloc(4);
    uriBytesLen.writeUInt32LE(uriBytes.length);

    const instructionData = Buffer.concat([
      discriminator,
      contentHashBytes,
      perceptualHashBytes,
      Buffer.from([ipTypeIndex]),
      uriBytesLen,
      uriBytes,
    ]);

    const instruction = {
      programId: PROGRAM_IDS.spore,
      keys: [
        { pubkey: ipAssetPDA, isSigner: false, isWritable: true },
        { pubkey: creatorPubkey, isSigner: true, isWritable: true },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      data: instructionData,
    };

    const tx = new Transaction().add(instruction);
    const txSignature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.payer],
      { commitment: "confirmed" }
    );

    // Fetch the created account to return full data
    const accountInfo = await this.connection.getAccountInfo(ipAssetPDA);
    let ipAsset: IPAsset;

    if (accountInfo?.data) {
      const deserialized = deserializeIPAsset(ipAssetPDA, accountInfo.data as unknown as Buffer);
      ipAsset = deserialized ?? this.fallbackIPAsset(ipAssetPDA, params);
    } else {
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
    };
  }

  async getIPAsset(pubkey: string): Promise<IPAsset | null> {
    try {
      const pk = new PublicKey(pubkey);
      const accountInfo = await this.connection.getAccountInfo(pk);
      if (!accountInfo?.data) return null;
      return deserializeIPAsset(pk, accountInfo.data as unknown as Buffer);
    } catch {
      return null;
    }
  }

  async searchIP(query: SearchQuery): Promise<SearchResult> {
    // Strategy: Use getProgramAccounts with filters.
    // This is expensive on mainnet — production should use Helius indexer + Postgres.
    // For devnet with small dataset, this is acceptable.

    const filters: Array<
      | { memcmp: { offset: number; bytes: string } }
      | { dataSize: number }
    > = [];

    // Filter by creator if specified (offset: 8 discriminator + 32 original_creator = 40)
    if (query.creator) {
      filters.push({
        memcmp: {
          offset: ANCHOR_DISCRIMINATOR_SIZE + 32, // skip disc + original_creator
          bytes: query.creator,
        },
      });
    }

    try {
      const accounts = await this.connection.getProgramAccounts(
        PROGRAM_IDS.spore,
        {
          filters: filters.length > 0 ? filters : undefined,
          commitment: "confirmed",
        }
      );

      let assets: IPAsset[] = [];
      for (const { pubkey, account } of accounts) {
        const asset = deserializeIPAsset(pubkey, account.data as unknown as Buffer);
        if (asset) assets.push(asset);
      }

      // Apply client-side filters
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

      // Sort by registration time descending (newest first)
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

    // Find children: assets where parentIp == this pubkey
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

    // Get parent chain
    let parent: ProvenanceChain | null = null;
    if (asset.parentIp) {
      parent = await this.getProvenance(asset.parentIp);
    }

    return {
      asset,
      parent,
      children,
      licenses: [], // TODO: query Hypha program for license templates
      disputes: [], // TODO: query DRP program for disputes
    };
  }

  // ── Licensing (Hypha program — stubbed for now) ───────────────────

  async createLicense(_params: CreateLicenseParams): Promise<LicenseTemplate> {
    // TODO: Build and submit Hypha program instruction
    throw new Error(
      "Hypha program integration not yet implemented. Use MockSolanaAdapter for testing."
    );
  }

  async acquireLicense(_params: AcquireLicenseParams): Promise<LicenseToken> {
    throw new Error(
      "Hypha program integration not yet implemented. Use MockSolanaAdapter for testing."
    );
  }

  async verifyLicense(
    _ipAsset: string,
    _wallet: string
  ): Promise<LicenseVerification> {
    // For now, return not-licensed with empty available licenses
    return {
      licensed: false,
      licenseToken: null,
      availableLicenses: [],
    };
  }

  async listLicenses(_ipAsset: string): Promise<LicenseTemplate[]> {
    return [];
  }

  // ── Similarity Oracle (stubbed — requires Python service) ─────────

  async checkSimilarity(
    contentHash: string,
    _ipType: IPType
  ): Promise<SimilarityResult> {
    // Check for exact content hash match on-chain
    const allAssets = await this.searchIP({ page: 0, pageSize: 1000 });
    const exact = allAssets.assets.find((a) => a.contentHash === contentHash);

    if (exact) {
      return {
        matchFound: true,
        candidates: [
          {
            ipAsset: exact.pubkey,
            score: 1.0,
            matchType: "exact",
            layer: "perceptual",
            details: "Exact content hash match found on-chain",
          },
        ],
      };
    }

    return { matchFound: false, candidates: [] };
  }

  // ── Evidence Engine (stubbed — requires PDF generation service) ────

  async generateEvidence(
    ipAsset: string,
    jurisdiction: Jurisdiction
  ): Promise<EvidencePackage> {
    const asset = await this.getIPAsset(ipAsset);
    if (!asset) throw new Error(`IP asset ${ipAsset} not found on-chain`);

    const now = Date.now();
    const packageHash = `sha256:ev_${ipAsset.slice(0, 8)}_${now}`;

    // TODO: Generate real PDF evidence packages with:
    // - Solana PoH timestamp verification
    // - SHA-256 content hash proof
    // - W3C PROV provenance chain
    // - Jurisdiction-specific legal formatting

    return {
      ipAsset,
      jurisdiction,
      generatedAt: Math.floor(now / 1000),
      packageHash,
      downloadUrl: `https://evidence.mycelium.network/packages/${packageHash}`,
      components: {
        evidenceSummaryPdf: `evidence_summary_${jurisdiction}.pdf`,
        w3cProvDocument: "w3c_prov_document.jsonld",
        blockchainVerification: "blockchain_verification/",
        contentVerification: "content_verification/",
        identityVerification: "identity_verification/",
        legalOpinion: `legal_opinion_${jurisdiction}.pdf`,
        verificationGuide: `verification_guide_${jurisdiction}.pdf`,
      },
    };
  }

  // ── Dispute Resolution (DRP program — stubbed) ────────────────────

  async fileDispute(_params: FileDisputeParams): Promise<Dispute> {
    throw new Error(
      "DRP program integration not yet implemented. Use MockSolanaAdapter for testing."
    );
  }

  async getDispute(_pubkey: string): Promise<Dispute | null> {
    return null;
  }

  // ── Agent Wallet ──────────────────────────────────────────────────

  async getOrCreateWallet(agentId: string): Promise<AgentWallet> {
    let wallet = this.agentWallets.get(agentId);
    if (!wallet) {
      // In production: derive a custodial wallet per agent from a master seed
      // or use a wallet-as-a-service provider (Crossmint, Turnkey, etc.)
      // For now: use the payer as the agent wallet
      wallet = {
        agentId,
        solanaWallet: this.payer.publicKey.toBase58(),
        usdcBalance: 0, // Real balance would come from USDC token account
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
    // TODO: Query actual USDC SPL token balance
    const solBalance = await this.connection.getBalance(
      new PublicKey(wallet.solanaWallet)
    );
    // Return SOL balance in lamports as a proxy until USDC integration
    return solBalance;
  }
}
