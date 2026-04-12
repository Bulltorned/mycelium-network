/**
 * Mycelium Protocol — Solana Live Adapter
 *
 * Production implementation of SolanaAdapter that talks to real Solana devnet/mainnet.
 * Connects to Anchor programs via the generated IDL client for type-safe account
 * fetches and instruction calls. No manual Borsh deserializers.
 *
 * Architecture:
 *   MCP Tool → SolanaLiveAdapter → Anchor Program (IDL client → Solana RPC)
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
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
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
const SEED_CONTENT_HASH = Buffer.from("content_hash_index");

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

function findContentHashRegistryPDA(
  contentHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_CONTENT_HASH, contentHash],
    PROGRAM_IDS.spore
  );
}

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Buffer.from(bytes).toString("hex");
}

// ── IP Type mapping (Anchor camelCase enum key → protocol snake_case) ──

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
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  SolanaLiveAdapter
// ═══════════════════════════════════════════════════════════════════════

export class SolanaLiveAdapter implements SolanaAdapter {
  private connection: Connection;
  private payer: Keypair;
  private heliusApiKey: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sporeProgram: Program<any>;

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

    // ── Initialize Anchor Program for typed account fetches ─────────
    const wallet = new Wallet(this.payer);
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    this.sporeProgram = new Program(sporeIdl, provider);

    console.error(`[SolanaLiveAdapter] Connected to ${rpcUrl}`);
    console.error(`[SolanaLiveAdapter] Payer: ${this.payer.publicKey.toBase58()}`);
    console.error(`[SolanaLiveAdapter] Spore program: ${PROGRAM_IDS.spore.toBase58()}`);
  }

  // ── IP Registration ─────────────────────────────────────────────

  async registerIP(params: RegisterIPParams): Promise<RegisterIPResult> {
    const contentHashBytes = hexToBytes(params.contentHash);
    const perceptualHashBytes = hexToBytes(params.perceptualHash);
    const creatorPubkey = this.payer.publicKey;

    const [ipAssetPDA] = findIPAssetPDA(creatorPubkey, contentHashBytes);
    const [contentHashRegistryPDA] = findContentHashRegistryPDA(contentHashBytes);

    // Build and send instruction via Anchor IDL client
    // RegisterIPParams does not include WIPO fields yet -- use defaults.
    // These will be added to the MCP tool schema in a future plan.
    const txSignature = await this.sporeProgram.methods
      .registerIp(
        Array.from(contentHashBytes) as unknown as number[],
        Array.from(perceptualHashBytes) as unknown as number[],
        ipTypeToAnchor(params.ipType),
        params.metadataUri,
        null, // niceClass: Option<u8> = None
        null, // berneCategory: Option<u8> = None
        [0, 0], // countryOfOrigin: [u8;2] = default
        null, // firstUseDate: Option<i64> = None
      )
      .accounts({
        ipAsset: ipAssetPDA,
        contentHashRegistry: contentHashRegistryPDA,
        creator: creatorPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch the created account using the IDL client
    let ipAsset: IPAsset;
    try {
      const account = await this.sporeProgram.account.ipAsset.fetch(ipAssetPDA);
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
    };
  }

  async getIPAsset(pubkey: string): Promise<IPAsset | null> {
    try {
      const pk = new PublicKey(pubkey);
      const account = await this.sporeProgram.account.ipAsset.fetch(pk);
      return anchorAccountToIPAsset(pk, account);
    } catch {
      return null;
    }
  }

  async searchIP(query: SearchQuery): Promise<SearchResult> {
    // Strategy: Use the Anchor program's account.ipAsset.all() with optional
    // memcmp filters. For devnet with small dataset, this is acceptable.
    // Production should use Helius indexer + Postgres.

    try {
      const filters: Array<{
        memcmp: { offset: number; bytes: string };
      }> = [];

      // Filter by creator if specified
      // Offset: 8 (discriminator) + 32 (original_creator) = 40 is where creator starts
      if (query.creator) {
        filters.push({
          memcmp: {
            offset: 8 + 32, // skip discriminator + original_creator
            bytes: query.creator,
          },
        });
      }

      const accounts = await this.sporeProgram.account.ipAsset.all(filters);

      let assets: IPAsset[] = accounts.map((acc) =>
        anchorAccountToIPAsset(acc.publicKey, acc.account)
      );

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
