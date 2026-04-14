#!/usr/bin/env node

/**
 * @mycelium-protocol/mcp-server
 *
 * MCP server exposing Mycelium Protocol's IP infrastructure to any AI agent.
 *
 * Architecture Decision: We use standard MCP (Model Context Protocol) instead
 * of inventing a custom agent protocol. MCP has 97M+ monthly SDK downloads
 * (March 2026), adopted by Anthropic, OpenAI, Google, Microsoft, Amazon.
 * Any agent that speaks MCP gets native IP licensing — no blockchain knowledge
 * required.
 *
 * This is the "enforcement-backed TCP/IP for IP" that Story Protocol's Agent
 * TCP/IP describes but can't deliver through standard protocols. We plug into
 * the protocols that already won.
 *
 * Environment variables:
 * - MYCELIUM_AGENT_ID: Agent identity for wallet derivation (required in production)
 * - MASTER_MNEMONIC: BIP-39 24-word seed for HD wallet derivation (enables persistent wallets)
 * - MASTER_ENCRYPTION_KEY: 32-byte hex key for encrypting stored keypairs
 * - DATABASE_URL: PostgreSQL connection string (required for persistent wallets and indexer)
 * - SOLANA_LIVE: Set to "1" to use live Solana adapter
 * - SOLANA_RPC_URL: Solana RPC endpoint
 * - SOLANA_KEYPAIR_PATH: Authority keypair file path
 * - HELIUS_API_KEY: Helius API key for webhook indexing
 * - USDC_MINT: USDC token mint address (defaults to devnet)
 *
 * Tools exposed:
 *   register_ip          — Register new IP asset (content hash -> Solana PoH timestamp)
 *   get_ip               — Get details of a specific IP asset by pubkey
 *   search_ip            — Search the IP graph by text, type, creator, status
 *   check_license        — Verify if a wallet/agent holds valid license for content
 *   acquire_license      — Pay USDC and receive license token
 *   create_license       — Define licensing terms for your IP
 *   verify_provenance    — Full chain of custody for any IP asset
 *   check_similarity     — Run content against the similarity oracle
 *   generate_evidence    — Court-ready evidence package for any jurisdiction
 *   file_dispute         — File IP dispute through the DRP
 *   get_wallet           — Check agent wallet balance
 *   list_my_assets       — All IP registered by this agent
 *   list_my_licenses     — All licenses held by this agent
 *
 * Resources:
 *   ip://asset/{pubkey}             — Read IP asset details
 *   ip://license/{pubkey}           — Read license terms
 *   ip://provenance/{pubkey}        — Full provenance tree
 *   ip://registry/stats             — Registry-wide statistics
 *
 * Transport: stdio (local dev), Streamable HTTP (production)
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MockSolanaAdapter, type SolanaAdapter } from "./solana-adapter.js";
import { SolanaLiveAdapter } from "./solana-live-adapter.js";
import type { IPType, LicenseType, Jurisdiction } from "./types.js";

// ── Server Initialization ────────────────────────────────────────────

// Use live adapter when SOLANA_LIVE=1 or SOLANA_RPC_URL is set.
// Otherwise fall back to mock for development.
const useLive = process.env.SOLANA_LIVE === "1" || !!process.env.SOLANA_RPC_URL;
const adapter: SolanaAdapter = useLive
  ? new SolanaLiveAdapter()
  : new MockSolanaAdapter();

if (!useLive) {
  console.error("[mycelium-mcp] Using MockSolanaAdapter (set SOLANA_LIVE=1 for devnet)");
}

const server = new McpServer(
  {
    name: "mycelium-ip",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Agent identity: resolved from MYCELIUM_AGENT_ID env var.
// In production, each agent has a unique ID for BIP-44 wallet derivation.
// Without this, all operations share one wallet (acceptable for local dev only).
const agentIdEnv = process.env.MYCELIUM_AGENT_ID;
if (!agentIdEnv) {
  console.error(
    "WARNING: MYCELIUM_AGENT_ID not set. Using 'default-agent' — all operations will share one wallet."
  );
}
const AGENT_ID = agentIdEnv || "default-agent";

// ── Enums as Zod literals for tool schemas ───────────────────────────

const ipTypeEnum = z.enum([
  "literary_work", "visual_art", "music", "software", "character_ip",
  "meme", "video", "ai_generated", "traditional_knowledge", "dataset",
  "brand_mark",
]);

const licenseTypeEnum = z.enum([
  "open_spore", "selective_hypha", "exclusive_root",
  "community_canopy", "ai_training", "derivative_bloom",
]);

const jurisdictionEnum = z.enum([
  "ID", "KE", "CO", "CN", "US", "GB", "EU", "ZA", "GENERIC",
]);

const aiTrainingPolicyEnum = z.enum([
  "opt_out", "opt_in_free", "opt_in_paid", "require_attribution",
]);

const derivativePolicyEnum = z.enum([
  "forbidden", "allowed_noncommercial", "allowed_with_royalty", "allowed_unrestricted",
]);

// ═══════════════════════════════════════════════════════════════════════
//  TOOLS — IP Operations
// ═══════════════════════════════════════════════════════════════════════

// ── get_ip ──────────────────────────────────────────────────────────

server.tool(
  "get_ip",
  "Get details of a specific IP asset by its Solana pubkey. Returns the full " +
  "on-chain record including content hash, creator, registration timestamp, " +
  "license count, dispute count, and current status.",
  {
    pubkey: z.string().describe("Solana pubkey (base58) of the IP asset."),
  },
  async (args) => {
    try {
      const asset = await adapter.getIPAsset(args.pubkey);
      if (!asset) {
        return {
          content: [{ type: "text" as const, text: `IP asset ${args.pubkey} not found in registry.` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pubkey: asset.pubkey,
                original_creator: asset.originalCreator,
                creator: asset.creator,
                content_hash: asset.contentHash,
                perceptual_hash: asset.perceptualHash,
                ip_type: asset.ipType,
                metadata_uri: asset.metadataUri,
                registration_slot: asset.registrationSlot,
                registration_timestamp: asset.registrationTimestamp,
                registered: new Date(asset.registrationTimestamp * 1000).toISOString(),
                parent_ip: asset.parentIp,
                status: asset.status,
                license_count: asset.licenseCount,
                dispute_count: asset.disputeCount,
                version: asset.version,
                solana_explorer: `https://explorer.solana.com/address/${asset.pubkey}?cluster=devnet`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `get_ip failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── register_ip ──────────────────────────────────────────────────────

server.tool(
  "register_ip",
  "Register new intellectual property on Mycelium Protocol. Creates an on-chain " +
  "IP asset with SHA-256 content hash, perceptual fingerprint, and Solana Proof " +
  "of History timestamp. Cost: ~0.004 SOL (~$0.50). Returns the IP asset pubkey, " +
  "transaction signature, and Solana Explorer link as proof of registration.",
  {
    content_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe("SHA-256 hash of the content (64 hex characters). Compute client-side before calling."),
    perceptual_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe("Perceptual fingerprint hash (64 hex chars). Use pHash for images, Chromaprint for audio, SimHash for text."),
    ip_type: ipTypeEnum.describe("Type of intellectual property being registered."),
    title: z.string().max(200).describe("Human-readable title for the IP asset."),
    description: z.string().max(2000).describe("Description of the IP asset."),
    tags: z.array(z.string().max(50)).max(20).describe("Tags for discoverability."),
    metadata_uri: z
      .string()
      .url()
      .describe("Arweave or IPFS URI where full content is permanently stored."),
    parent_ip: z
      .string()
      .optional()
      .describe("If this is a derivative work, the pubkey of the parent IP asset."),
  },
  async (args) => {
    try {
      const result = await adapter.registerIP({
        agentId: AGENT_ID,
        contentHash: args.content_hash,
        perceptualHash: args.perceptual_hash,
        ipType: args.ip_type as IPType,
        metadataUri: args.metadata_uri,
        parentIp: args.parent_ip,
        title: args.title,
        description: args.description,
        tags: args.tags,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                ip_asset_pubkey: result.ipAsset.pubkey,
                registration_timestamp: result.ipAsset.registrationTimestamp,
                registration_slot: result.ipAsset.registrationSlot,
                tx_signature: result.txSignature,
                solana_explorer: result.solanaExplorerUrl,
                arweave_content: result.arweaveUrl,
                cost_sol: result.costSol,
                status: result.ipAsset.status,
                message:
                  `IP registered successfully. Solana PoH timestamp: slot ${result.ipAsset.registrationSlot}. ` +
                  `This provides cryptographic proof that this content existed at this moment. ` +
                  `The registration is independently verifiable at ${result.solanaExplorerUrl}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Registration failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── search_ip ────────────────────────────────────────────────────────

server.tool(
  "search_ip",
  "Search the Mycelium IP registry. Query by text, IP type, creator, status, " +
  "or date range. Returns matching IP assets with their registration details, " +
  "licensing status, and dispute history.",
  {
    query: z.string().optional().describe("Free-text search across the IP graph."),
    ip_type: ipTypeEnum.optional().describe("Filter by IP type."),
    creator: z.string().optional().describe("Filter by creator wallet pubkey."),
    status: z.enum(["active", "disputed", "suspended", "revoked"]).optional(),
    registered_after: z.number().optional().describe("Unix timestamp — only assets registered after this time."),
    registered_before: z.number().optional().describe("Unix timestamp — only assets registered before this time."),
    page: z.number().int().min(0).default(0),
    page_size: z.number().int().min(1).max(100).default(20),
  },
  async (args) => {
    try {
      const result = await adapter.searchIP({
        text: args.query,
        ipType: args.ip_type as IPType | undefined,
        creator: args.creator,
        status: args.status as any,
        registeredAfter: args.registered_after,
        registeredBefore: args.registered_before,
        page: args.page,
        pageSize: args.page_size,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_results: result.total,
                page: result.page,
                page_size: result.pageSize,
                assets: result.assets.map((a) => ({
                  pubkey: a.pubkey,
                  ip_type: a.ipType,
                  status: a.status,
                  registered: new Date(a.registrationTimestamp * 1000).toISOString(),
                  license_count: a.licenseCount,
                  dispute_count: a.disputeCount,
                  content_hash: a.contentHash,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Search failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── check_license ────────────────────────────────────────────────────

server.tool(
  "check_license",
  "Check if the current agent (or a specific wallet) holds a valid license for " +
  "an IP asset. If not licensed, returns available license options with pricing. " +
  "This is the tool AI agents should call BEFORE using any content to verify " +
  "they have proper authorization.",
  {
    ip_asset: z.string().describe("Pubkey of the IP asset to check license for."),
    wallet: z
      .string()
      .optional()
      .describe("Wallet to check. Defaults to this agent's custodial wallet."),
  },
  async (args) => {
    try {
      const wallet =
        args.wallet ?? (await adapter.getOrCreateWallet(AGENT_ID)).solanaWallet;
      const result = await adapter.verifyLicense(args.ip_asset, wallet);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                licensed: result.licensed,
                license_token: result.licenseToken
                  ? {
                      pubkey: result.licenseToken.pubkey,
                      acquired: new Date(
                        result.licenseToken.acquiredTimestamp * 1000
                      ).toISOString(),
                      valid: result.licenseToken.valid,
                    }
                  : null,
                available_licenses: result.availableLicenses.map((l) => ({
                  pubkey: l.pubkey,
                  license_type: l.licenseType,
                  commercial_use: l.commercialUse,
                  ai_training: l.aiTraining,
                  price_usdc: l.priceUsdcLamports / 1_000_000,
                  exclusive: l.exclusive,
                  issued: l.issuedCount,
                  max: l.maxLicenses,
                })),
                message: result.licensed
                  ? "Valid license found. Content may be used under the license terms."
                  : `No valid license found. ${result.availableLicenses.length} license option(s) available. Use acquire_license to obtain one.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `License check failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── acquire_license ──────────────────────────────────────────────────

server.tool(
  "acquire_license",
  "Acquire a license for an IP asset by paying USDC. The license token is minted " +
  "to the agent's custodial wallet. Payment is deducted from the agent's USDC " +
  "balance automatically. Royalties are split to the creator, protocol treasury, " +
  "and parent creators (for derivatives) in a single atomic transaction.",
  {
    license_template: z
      .string()
      .describe("Pubkey of the license template to acquire. Get this from check_license results."),
  },
  {
    title: "Acquire IP License",
    destructiveHint: true,
  },
  async (args) => {
    try {
      const token = await adapter.acquireLicense({
        agentId: AGENT_ID,
        licenseTemplate: args.license_template,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                license_token: token.pubkey,
                licensee: token.licensee,
                acquired: new Date(token.acquiredTimestamp * 1000).toISOString(),
                valid: token.valid,
                message:
                  "License acquired successfully. You are now authorized to use this " +
                  "content under the license terms. The license token is stored on-chain " +
                  "and can be independently verified.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `License acquisition failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── create_license ───────────────────────────────────────────────────

server.tool(
  "create_license",
  "Define licensing terms for an IP asset you own. Creates a license template " +
  "that other agents and users can acquire. Supports 6 license types: open_spore " +
  "(free+attribution), selective_hypha (free non-commercial, paid commercial), " +
  "exclusive_root (single licensee), community_canopy (DAO-governed), ai_training " +
  "(AI model training terms), derivative_bloom (derivatives with auto royalties).",
  {
    ip_asset: z.string().describe("Pubkey of the IP asset to license."),
    license_type: licenseTypeEnum,
    commercial_use: z.boolean().describe("Whether commercial use is permitted."),
    derivatives_allowed: derivativePolicyEnum,
    ai_training: aiTrainingPolicyEnum,
    price_usdc: z.number().min(0).describe("Price in USDC (e.g., 0.10 for $0.10). Use 0 for free licenses."),
    royalty_bps: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .describe("Royalty rate in basis points for derivatives (100 = 1%)."),
    max_derivative_depth: z
      .number()
      .int()
      .min(0)
      .max(10)
      .default(3)
      .describe("How many generations of derivatives share royalties."),
    territories: z
      .array(z.string())
      .default([])
      .describe("ISO 3166-1 country codes. Empty array = worldwide."),
    exclusive: z.boolean().default(false),
    expiry_timestamp: z.number().optional().describe("Unix timestamp when license expires. Omit for perpetual."),
    max_licenses: z.number().int().optional().describe("Maximum number of licenses to issue. Omit for unlimited."),
  },
  async (args) => {
    try {
      const license = await adapter.createLicense({
        agentId: AGENT_ID,
        ipAsset: args.ip_asset,
        licenseType: args.license_type as LicenseType,
        commercialUse: args.commercial_use,
        derivativesAllowed: args.derivatives_allowed as any,
        aiTraining: args.ai_training as any,
        priceUsdc: args.price_usdc,
        royaltyBps: args.royalty_bps,
        maxDerivativeDepth: args.max_derivative_depth,
        territories: args.territories,
        exclusive: args.exclusive,
        expiryTimestamp: args.expiry_timestamp,
        maxLicenses: args.max_licenses,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                license_template: license.pubkey,
                license_type: license.licenseType,
                price_usdc: license.priceUsdcLamports / 1_000_000,
                commercial_use: license.commercialUse,
                ai_training: license.aiTraining,
                territories: license.territories.length
                  ? license.territories.join(", ")
                  : "worldwide",
                message:
                  "License template created. Other agents can now discover and acquire " +
                  "this license through check_license and acquire_license.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `License creation failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── verify_provenance ────────────────────────────────────────────────

server.tool(
  "verify_provenance",
  "Get the full provenance chain for an IP asset — its creation record, parent " +
  "works (if derivative), child derivatives, license history, and dispute history. " +
  "Every element is cryptographically verifiable via Solana Explorer. Use this to " +
  "verify the authenticity and ownership history of any content before using it.",
  {
    ip_asset: z.string().describe("Pubkey of the IP asset to verify."),
  },
  async (args) => {
    try {
      const chain = await adapter.getProvenance(args.ip_asset);
      if (!chain) {
        return {
          content: [{ type: "text" as const, text: `IP asset ${args.ip_asset} not found in registry.` }],
        };
      }

      const formatAsset = (a: typeof chain.asset) => ({
        pubkey: a.pubkey,
        creator: a.creator,
        ip_type: a.ipType,
        content_hash: a.contentHash,
        registered: new Date(a.registrationTimestamp * 1000).toISOString(),
        slot: a.registrationSlot,
        status: a.status,
        verification_url: `https://explorer.solana.com/address/${a.pubkey}`,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                asset: formatAsset(chain.asset),
                parent: chain.parent ? formatAsset(chain.parent.asset) : null,
                derivatives: chain.children.map((c) => formatAsset(c.asset)),
                licenses: chain.licenses.map((l) => ({
                  pubkey: l.pubkey,
                  type: l.licenseType,
                  price_usdc: l.priceUsdcLamports / 1_000_000,
                  issued: l.issuedCount,
                })),
                disputes: chain.disputes.map((d) => ({
                  pubkey: d.pubkey,
                  stage: d.stage,
                  similarity_score: d.similarityScore,
                })),
                verification:
                  "All provenance data is stored on Solana with Proof of History timestamps. " +
                  "Every claim is independently verifiable via Solana Explorer using the pubkeys above.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Provenance check failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── check_similarity ─────────────────────────────────────────────────

server.tool(
  "check_similarity",
  "Check if content is similar to any existing IP in the Mycelium registry. " +
  "Uses a dual-layer detection system: Layer 1 (fast perceptual hashing) catches " +
  "exact and near-duplicate copies. Layer 2 (deep semantic embeddings via CLIP, " +
  "CLAP, multilingual-e5) catches derivatives, style transfers, translations, " +
  "and remixes. Call this BEFORE registering content to avoid disputes.",
  {
    content_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe("SHA-256 hash of the content to check."),
    ip_type: ipTypeEnum.describe("Type of content being checked."),
  },
  async (args) => {
    try {
      const result = await adapter.checkSimilarity(
        args.content_hash,
        args.ip_type as IPType
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                match_found: result.matchFound,
                candidates: result.candidates.map((c) => ({
                  ip_asset: c.ipAsset,
                  similarity_score: c.score,
                  match_type: c.matchType,
                  detection_layer: c.layer,
                  details: c.details,
                })),
                recommendation: result.matchFound
                  ? "Similar content found in the registry. Review the matches before " +
                    "registering. If this is a derivative work, register with the parent_ip " +
                    "field set. If this is an original work that happens to be similar, " +
                    "proceed with registration — the similarity oracle will flag it for " +
                    "review but won't block registration."
                  : "No similar content found. Safe to register.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Similarity check failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── generate_evidence ────────────────────────────────────────────────

server.tool(
  "generate_evidence",
  "Generate a court-ready evidence package for an IP asset in a specific " +
  "jurisdiction. The package includes: Solana PoH timestamp verification, " +
  "SHA-256 content hash proof, W3C PROV provenance chain, expert witness " +
  "declaration template, and jurisdiction-specific legal formatting. " +
  "Supported jurisdictions: ID (Indonesia), KE (Kenya), CO (Colombia), " +
  "CN (China), US (Federal), GB (UK), EU, ZA (South Africa), GENERIC.",
  {
    ip_asset: z.string().describe("Pubkey of the IP asset to generate evidence for."),
    jurisdiction: jurisdictionEnum.describe("Target jurisdiction for evidence formatting."),
  },
  async (args) => {
    try {
      const pkg = await adapter.generateEvidence(
        args.ip_asset,
        args.jurisdiction as Jurisdiction
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                download_url: pkg.downloadUrl,
                jurisdiction: pkg.jurisdiction,
                generated_at: new Date(pkg.generatedAt * 1000).toISOString(),
                package_hash: pkg.packageHash,
                components: pkg.components,
                message:
                  `Court-ready evidence package generated for ${pkg.jurisdiction}. ` +
                  `Download at ${pkg.downloadUrl}. The package includes blockchain ` +
                  `verification, content proof, identity attestation, and a jurisdiction-` +
                  `specific expert witness declaration template. All evidence is ` +
                  `independently verifiable without Mycelium software.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Evidence generation failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── file_dispute ─────────────────────────────────────────────────────

server.tool(
  "file_dispute",
  "File an IP dispute through the Mycelium Dispute Resolution Protocol (DRP). " +
  "Disputes escalate through 5 stages: automated detection ($0), direct " +
  "resolution ($0, 7 days), community mediation ($50 USDC, 14 days), " +
  "arbitration panel ($200-500 USDC, 30 days), and cross-jurisdictional " +
  "enforcement (court filing with evidence package).",
  {
    claimant_ip: z.string().describe("Pubkey of the IP asset claiming infringement."),
    respondent_ip: z.string().describe("Pubkey of the allegedly infringing IP asset."),
    evidence_hash: z.string().describe("SHA-256 hash of the evidence supporting the claim."),
    similarity_score: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .describe("Similarity score in basis points (8500 = 85%)."),
    match_type: z
      .enum(["exact", "near_duplicate", "derivative", "semantic"])
      .describe("Type of similarity detected."),
  },
  {
    title: "File IP Dispute",
    destructiveHint: true,
  },
  async (args) => {
    try {
      const dispute = await adapter.fileDispute({
        agentId: AGENT_ID,
        claimantIp: args.claimant_ip,
        respondentIp: args.respondent_ip,
        evidenceHash: args.evidence_hash,
        similarityScore: args.similarity_score,
        matchType: args.match_type,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                dispute_pubkey: dispute.pubkey,
                stage: dispute.stage,
                filed_slot: dispute.filedSlot,
                deadline_slot: dispute.deadlineSlot,
                message:
                  "Dispute filed at Stage 1 (Automated Detection). Both parties have been " +
                  "notified on-chain. The respondent has 7 days to respond before the " +
                  "dispute escalates to Stage 2 (Direct Resolution).",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Dispute filing failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── get_wallet ───────────────────────────────────────────────────────

server.tool(
  "get_wallet",
  "Check the agent's custodial wallet balance and details. The wallet is " +
  "automatically created when the agent first connects. USDC balance is used " +
  "for license acquisitions, dispute filings, and evidence generation.",
  {},
  async () => {
    try {
      const wallet = await adapter.getOrCreateWallet(AGENT_ID);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                agent_id: wallet.agentId,
                solana_wallet: wallet.solanaWallet,
                usdc_balance: wallet.usdcBalance / 1_000_000,
                usdc_balance_raw: wallet.usdcBalance,
                created: new Date(wallet.createdAt * 1000).toISOString(),
                last_activity: new Date(wallet.lastActivity * 1000).toISOString(),
                message:
                  "This is your custodial Solana wallet. USDC balance is used for " +
                  "license payments and dispute filings. Deposit via the Mycelium " +
                  "dashboard or Stripe integration.",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Wallet check failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── list_my_assets ───────────────────────────────────────────────────

server.tool(
  "list_my_assets",
  "List all IP assets registered by this agent. Returns pubkeys, types, " +
  "registration dates, license counts, and current status.",
  {
    status: z.enum(["active", "disputed", "suspended", "revoked"]).optional(),
    page: z.number().int().min(0).default(0),
    page_size: z.number().int().min(1).max(100).default(20),
  },
  async (args) => {
    try {
      const wallet = await adapter.getOrCreateWallet(AGENT_ID);
      const result = await adapter.searchIP({
        creator: wallet.solanaWallet,
        status: args.status as any,
        page: args.page,
        pageSize: args.page_size,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_assets: result.total,
                page: result.page,
                assets: result.assets.map((a) => ({
                  pubkey: a.pubkey,
                  ip_type: a.ipType,
                  status: a.status,
                  registered: new Date(a.registrationTimestamp * 1000).toISOString(),
                  licenses_issued: a.licenseCount,
                  active_disputes: a.disputeCount,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Asset listing failed: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── list_my_licenses ────────────────────────────────────────────────

server.tool(
  "list_my_licenses",
  "List all licenses held by this agent. Returns license tokens with their " +
  "associated IP assets, license types, acquisition dates, and validity status.",
  {
    valid_only: z.boolean().default(true).describe("If true, only return valid (non-expired, non-revoked) licenses."),
    page: z.number().int().min(0).default(0),
    page_size: z.number().int().min(1).max(100).default(20),
  },
  async (args) => {
    try {
      const wallet = await adapter.getOrCreateWallet(AGENT_ID);
      const allAssets = await adapter.searchIP({ page: 0, pageSize: 1000 });

      // Collect all licenses for all assets, then filter to ones held by this agent
      const heldLicenses: Array<{
        licenseToken: any;
        licenseTemplate: any;
        ipAsset: string;
      }> = [];

      for (const asset of allAssets.assets) {
        const verification = await adapter.verifyLicense(
          asset.pubkey,
          wallet.solanaWallet
        );
        if (verification.licensed && verification.licenseToken) {
          const templates = await adapter.listLicenses(asset.pubkey);
          const template = templates.find(
            (t) => t.pubkey === verification.licenseToken!.licenseTemplate
          );
          heldLicenses.push({
            licenseToken: verification.licenseToken,
            licenseTemplate: template,
            ipAsset: asset.pubkey,
          });
        }
      }

      const filtered = args.valid_only
        ? heldLicenses.filter((l) => l.licenseToken.valid)
        : heldLicenses;

      const page = args.page;
      const pageSize = args.page_size;
      const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_licenses: filtered.length,
                page,
                licenses: paged.map((l) => ({
                  license_token: l.licenseToken.pubkey,
                  ip_asset: l.ipAsset,
                  license_type: l.licenseTemplate?.licenseType ?? "unknown",
                  commercial_use: l.licenseTemplate?.commercialUse ?? false,
                  ai_training: l.licenseTemplate?.aiTraining ?? "unknown",
                  acquired: new Date(
                    l.licenseToken.acquiredTimestamp * 1000
                  ).toISOString(),
                  valid: l.licenseToken.valid,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `License listing failed: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  RESOURCES — IP Asset Data
// ═══════════════════════════════════════════════════════════════════════

// ── Static: registry stats ───────────────────────────────────────────

server.resource(
  "registry-stats",
  "ip://registry/stats",
  {
    description: "Mycelium Protocol registry statistics — total assets, licenses, disputes.",
    mimeType: "application/json",
  },
  async () => ({
    contents: [
      {
        uri: "ip://registry/stats",
        mimeType: "application/json",
        text: JSON.stringify({
          protocol: "Mycelium Protocol",
          version: "0.1.0",
          chain: "Solana",
          note: "Stats endpoint — connect to live indexer for real numbers",
          supported_ip_types: [
            "literary_work", "visual_art", "music", "software", "character_ip",
            "meme", "video", "ai_generated", "traditional_knowledge", "dataset",
            "brand_mark",
          ],
          supported_jurisdictions: ["ID", "KE", "CO", "CN", "US", "GB", "EU", "ZA"],
          license_types: [
            "open_spore", "selective_hypha", "exclusive_root",
            "community_canopy", "ai_training", "derivative_bloom",
          ],
        }),
      },
    ],
  })
);

// ── Dynamic: IP asset by pubkey ──────────────────────────────────────

server.resource(
  "ip-asset",
  new ResourceTemplate("ip://asset/{pubkey}", { list: undefined }),
  {
    description: "Read details of a specific IP asset by its Solana pubkey.",
    mimeType: "application/json",
  },
  async (uri, params) => {
    const pubkey = String(params.pubkey);
    const asset = await adapter.getIPAsset(pubkey);
    if (!asset) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `IP asset ${pubkey} not found.`,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(asset, null, 2),
        },
      ],
    };
  }
);

// ── Dynamic: license template by pubkey ──────────────────────────────

server.resource(
  "license-template",
  new ResourceTemplate("ip://license/{pubkey}", { list: undefined }),
  {
    description: "Read details of a specific license template.",
    mimeType: "application/json",
  },
  async (uri, params) => {
    const pubkey = String(params.pubkey);
    // In production, this would fetch from the indexer
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `License template ${pubkey} — connect to live indexer for data.`,
        },
      ],
    };
  }
);

// ── Dynamic: provenance tree ─────────────────────────────────────────

server.resource(
  "provenance",
  new ResourceTemplate("ip://provenance/{pubkey}", { list: undefined }),
  {
    description: "Full provenance tree for an IP asset — parents, children, licenses, disputes.",
    mimeType: "application/json",
  },
  async (uri, params) => {
    const pubkey = String(params.pubkey);
    const chain = await adapter.getProvenance(pubkey);
    if (!chain) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `IP asset ${pubkey} not found.`,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(chain, null, 2),
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mycelium MCP server running on stdio");
  console.error(`Agent ID: ${AGENT_ID}`);
  console.error("Tools: register_ip, get_ip, search_ip, check_license, acquire_license, " +
    "create_license, verify_provenance, check_similarity, generate_evidence, " +
    "file_dispute, get_wallet, list_my_assets, list_my_licenses (13 total)");
  console.error("Resources: ip://registry/stats, ip://asset/{pubkey}, " +
    "ip://license/{pubkey}, ip://provenance/{pubkey}");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
