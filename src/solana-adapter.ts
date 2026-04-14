/**
 * Mycelium Protocol — Solana Adapter
 *
 * Abstraction layer between MCP tools and on-chain Solana programs.
 * In production, each method builds and submits Anchor transactions.
 * This module defines the interface + a mock implementation for
 * development/testing. Swap to `SolanaLiveAdapter` for mainnet.
 *
 * Architecture:
 *   MCP Tool → SolanaAdapter → Anchor Program (Solana RPC)
 *                             → Helius Indexer (read queries)
 *                             → Qdrant (similarity search)
 *                             → Evidence Engine (PDF generation)
 */

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
  SimilarityCandidate,
  EvidencePackage,
  Jurisdiction,
  SearchResult,
  ProvenanceChain,
  AgentWallet,
} from "./types.js";

// ── Adapter Interface ────────────────────────────────────────────────

export interface SolanaAdapter {
  // IP Registration (mycelium-spore program)
  registerIP(params: RegisterIPParams): Promise<RegisterIPResult>;
  getIPAsset(pubkey: string): Promise<IPAsset | null>;
  searchIP(query: SearchQuery): Promise<SearchResult>;
  getProvenance(pubkey: string): Promise<ProvenanceChain | null>;

  // Licensing (mycelium-hypha program)
  createLicense(params: CreateLicenseParams): Promise<LicenseTemplate>;
  acquireLicense(params: AcquireLicenseParams): Promise<LicenseToken>;
  verifyLicense(ipAsset: string, wallet: string): Promise<LicenseVerification>;
  listLicenses(ipAsset: string): Promise<LicenseTemplate[]>;

  // Similarity Oracle
  checkSimilarity(contentHash: string, ipType: IPType): Promise<SimilarityResult>;

  // Evidence Engine
  generateEvidence(ipAsset: string, jurisdiction: Jurisdiction): Promise<EvidencePackage>;

  // Dispute Resolution (mycelium-drp program)
  fileDispute(params: FileDisputeParams): Promise<Dispute>;
  getDispute(pubkey: string): Promise<Dispute | null>;

  // Agent Wallet
  getOrCreateWallet(agentId: string): Promise<AgentWallet>;
  getWalletBalance(agentId: string): Promise<number>;
}

// ── Parameter Types ──────────────────────────────────────────────────

export interface RegisterIPParams {
  agentId: string;
  contentHash: string;
  perceptualHash: string;
  ipType: IPType;
  metadataUri: string;
  parentIp?: string;
  title: string;
  description: string;
  tags: string[];
}

export interface RegisterIPResult {
  ipAsset: IPAsset;
  txSignature: string;
  solanaExplorerUrl: string;
  arweaveUrl: string;
  costSol: number;
}

export interface SearchQuery {
  text?: string;
  ipType?: IPType;
  creator?: string;
  status?: IPStatus;
  registeredAfter?: number;
  registeredBefore?: number;
  page?: number;
  pageSize?: number;
}

export interface CreateLicenseParams {
  agentId: string;
  ipAsset: string;
  licenseType: LicenseType;
  commercialUse: boolean;
  derivativesAllowed: DerivativePolicy;
  aiTraining: AITrainingPolicy;
  priceUsdc: number;
  royaltyBps: number;
  maxDerivativeDepth: number;
  territories: string[];
  exclusive: boolean;
  expiryTimestamp?: number;
  maxLicenses?: number;
}

export interface AcquireLicenseParams {
  agentId: string;
  licenseTemplate: string;
}

export interface LicenseVerification {
  licensed: boolean;
  licenseToken: LicenseToken | null;
  availableLicenses: LicenseTemplate[];
}

export interface FileDisputeParams {
  agentId: string;
  claimantIp: string;
  respondentIp: string;
  evidenceHash: string;
  similarityScore: number;
  matchType: string;
}

// ── Mock Adapter (Development/Testing) ───────────────────────────────

/**
 * MockSolanaAdapter provides a fully functional in-memory implementation
 * for development and testing. Every response mirrors the shape of real
 * on-chain data. Replace with SolanaLiveAdapter for production.
 */
export class MockSolanaAdapter implements SolanaAdapter {
  private assets: Map<string, IPAsset> = new Map();
  private licenses: Map<string, LicenseTemplate> = new Map();
  private licenseTokens: Map<string, LicenseToken> = new Map();
  private wallets: Map<string, AgentWallet> = new Map();
  private counter = 0;

  private genPubkey(): string {
    this.counter++;
    const hex = this.counter.toString(16).padStart(8, "0");
    return `myc${hex}${"0".repeat(36)}`;
  }

  private genTxSig(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }

  async registerIP(params: RegisterIPParams): Promise<RegisterIPResult> {
    const pubkey = this.genPubkey();
    const now = Date.now();
    const wallet = (await this.getOrCreateWallet(params.agentId)).solanaWallet;
    const asset: IPAsset = {
      pubkey,
      originalCreator: wallet,
      creator: wallet,
      contentHash: params.contentHash,
      perceptualHash: params.perceptualHash,
      ipType: params.ipType,
      metadataUri: params.metadataUri,
      registrationSlot: Math.floor(now / 400),
      registrationTimestamp: Math.floor(now / 1000),
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
    this.assets.set(pubkey, asset);

    const txSig = this.genTxSig();
    return {
      ipAsset: asset,
      txSignature: txSig,
      solanaExplorerUrl: `https://explorer.solana.com/tx/${txSig}`,
      arweaveUrl: params.metadataUri,
      costSol: 0.004,
    };
  }

  async getIPAsset(pubkey: string): Promise<IPAsset | null> {
    return this.assets.get(pubkey) ?? null;
  }

  async searchIP(query: SearchQuery): Promise<SearchResult> {
    let results = Array.from(this.assets.values());
    if (query.text) {
      const q = query.text.toLowerCase();
      results = results.filter(
        (a) =>
          a.contentHash.includes(q) ||
          a.pubkey.includes(q) ||
          a.ipType.includes(q)
      );
    }
    if (query.ipType) results = results.filter((a) => a.ipType === query.ipType);
    if (query.creator) results = results.filter((a) => a.creator === query.creator);
    if (query.status) results = results.filter((a) => a.status === query.status);

    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 20;
    const paged = results.slice(page * pageSize, (page + 1) * pageSize);
    return { assets: paged, total: results.length, page, pageSize };
  }

  async getProvenance(pubkey: string): Promise<ProvenanceChain | null> {
    const asset = this.assets.get(pubkey);
    if (!asset) return null;

    const children = Array.from(this.assets.values())
      .filter((a) => a.parentIp === pubkey)
      .map((child) => ({
        asset: child,
        parent: null,
        children: [],
        licenses: [],
        disputes: [],
      }));

    const licenses = Array.from(this.licenses.values()).filter(
      (l) => l.ipAsset === pubkey
    );

    return {
      asset,
      parent: asset.parentIp
        ? await this.getProvenance(asset.parentIp)
        : null,
      children,
      licenses,
      disputes: [],
    };
  }

  async createLicense(params: CreateLicenseParams): Promise<LicenseTemplate> {
    const pubkey = this.genPubkey();
    const license: LicenseTemplate = {
      pubkey,
      ipAsset: params.ipAsset,
      creator: (await this.getOrCreateWallet(params.agentId)).solanaWallet,
      licenseType: params.licenseType,
      commercialUse: params.commercialUse,
      derivativesAllowed: params.derivativesAllowed,
      aiTraining: params.aiTraining,
      priceUsdcLamports: Math.round(params.priceUsdc * 1_000_000),
      royaltyBps: params.royaltyBps,
      maxDerivativeDepth: params.maxDerivativeDepth,
      territories: params.territories,
      exclusive: params.exclusive,
      expiryTimestamp: params.expiryTimestamp ?? null,
      maxLicenses: params.maxLicenses ?? null,
      issuedCount: 0,
      active: true,
    };
    this.licenses.set(pubkey, license);
    return license;
  }

  async acquireLicense(params: AcquireLicenseParams): Promise<LicenseToken> {
    const template = this.licenses.get(params.licenseTemplate);
    if (!template) throw new Error(`License template ${params.licenseTemplate} not found`);
    if (!template.active) throw new Error("License template is not active");
    if (template.maxLicenses && template.issuedCount >= template.maxLicenses) {
      throw new Error("Maximum licenses issued");
    }

    const wallet = await this.getOrCreateWallet(params.agentId);
    if (wallet.usdcBalance < template.priceUsdcLamports) {
      throw new Error(
        `Insufficient USDC balance. Required: ${template.priceUsdcLamports / 1_000_000} USDC, ` +
        `Available: ${wallet.usdcBalance / 1_000_000} USDC`
      );
    }

    // Deduct balance
    wallet.usdcBalance -= template.priceUsdcLamports;
    template.issuedCount++;

    const pubkey = this.genPubkey();
    const now = Date.now();
    const token: LicenseToken = {
      pubkey,
      licenseTemplate: params.licenseTemplate,
      licensee: wallet.solanaWallet,
      acquiredSlot: Math.floor(now / 400),
      acquiredTimestamp: Math.floor(now / 1000),
      valid: true,
    };
    this.licenseTokens.set(pubkey, token);
    return token;
  }

  async verifyLicense(
    ipAsset: string,
    wallet: string
  ): Promise<LicenseVerification> {
    const ownedTokens = Array.from(this.licenseTokens.values()).filter(
      (t) => t.licensee === wallet && t.valid
    );
    const relevantLicenses = Array.from(this.licenses.values()).filter(
      (l) => l.ipAsset === ipAsset
    );
    const activeLicense = ownedTokens.find((t) =>
      relevantLicenses.some((l) => l.pubkey === t.licenseTemplate)
    );

    return {
      licensed: !!activeLicense,
      licenseToken: activeLicense ?? null,
      availableLicenses: relevantLicenses.filter((l) => l.active),
    };
  }

  async listLicenses(ipAsset: string): Promise<LicenseTemplate[]> {
    return Array.from(this.licenses.values()).filter(
      (l) => l.ipAsset === ipAsset
    );
  }

  async checkSimilarity(
    contentHash: string,
    _ipType: IPType
  ): Promise<SimilarityResult> {
    // Mock: check if any existing asset has the same content hash
    const exact = Array.from(this.assets.values()).find(
      (a) => a.contentHash === contentHash
    );
    if (exact) {
      return {
        matchFound: true,
        candidates: [
          {
            ipAsset: exact.pubkey,
            score: 1.0,
            matchType: "exact",
            layer: "perceptual",
            details: "Exact content hash match found in registry",
          },
        ],
      };
    }
    return { matchFound: false, candidates: [] };
  }

  async generateEvidence(
    ipAsset: string,
    jurisdiction: Jurisdiction
  ): Promise<EvidencePackage> {
    const asset = this.assets.get(ipAsset);
    if (!asset) throw new Error(`IP asset ${ipAsset} not found`);

    const now = Date.now();
    const packageHash = `sha256:ev_${ipAsset}_${now}`;

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

  async fileDispute(params: FileDisputeParams): Promise<Dispute> {
    const pubkey = this.genPubkey();
    const now = Date.now();
    const dispute: Dispute = {
      pubkey,
      claimant: (await this.getOrCreateWallet(params.agentId)).solanaWallet,
      respondent: "",
      ipAsset: params.claimantIp,
      stage: "automated_detection",
      evidenceHashes: [params.evidenceHash],
      similarityScore: params.similarityScore,
      matchType: params.matchType as Dispute["matchType"],
      mediator: null,
      resolution: null,
      escrowAmountUsdc: 0,
      filedSlot: Math.floor(now / 400),
      deadlineSlot: Math.floor(now / 400) + 604800,
    };
    return dispute;
  }

  async getDispute(_pubkey: string): Promise<Dispute | null> {
    return null;
  }

  async getOrCreateWallet(agentId: string): Promise<AgentWallet> {
    let wallet = this.wallets.get(agentId);
    if (!wallet) {
      wallet = {
        agentId,
        solanaWallet: this.genPubkey(),
        usdcBalance: 100_000_000, // $100 USDC for testing
        createdAt: Math.floor(Date.now() / 1000),
        lastActivity: Math.floor(Date.now() / 1000),
      };
      this.wallets.set(agentId, wallet);
    }
    wallet.lastActivity = Math.floor(Date.now() / 1000);
    return wallet;
  }

  async getWalletBalance(agentId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(agentId);
    return wallet.usdcBalance;
  }
}
