/**
 * Mycelium Protocol -- Evidence Engine
 *
 * Orchestrates the full Mycelium Evidence Package (MEP) generation flow:
 *   1. Assemble MEP JSON from indexer data
 *   2. Canonical JSON serialization (deterministic key ordering)
 *   3. Compute SHA-256 hash of the exact bytes
 *   4. Upload the exact same bytes to Arweave via Irys
 *   5. Ed25519 sign the hash with the protocol authority key
 *   6. Build Solana transaction: Ed25519 verify ix (index 0) + generate_mep ix
 *   7. Send transaction to Meridian program
 *
 * CRITICAL: Hash consistency is guaranteed by using the same byte string
 * for both the SHA-256 hash computation and the Arweave upload. The
 * `uploadMEPRaw` function uploads raw bytes directly -- no re-serialization.
 */

import { createHash } from "crypto";
import nacl from "tweetnacl";
import {
  Ed25519Program,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { assembleMEP, JURISDICTION_MAP, WIPO_JURISDICTION_KEY } from "./mep-assembler.js";
import type { MEPDocument } from "./mep-assembler.js";
import type { Jurisdiction } from "../../types.js";

// Irys SDK imports for raw upload
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

// ── Program ID ────────────────────────────────────────────────────────

const SOLANA_NETWORK = process.env.SOLANA_NETWORK ?? "devnet";
const MERIDIAN_MAINNET_ID = "2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le";
const MERIDIAN_DEVNET_ID = "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc";

export const MERIDIAN_PROGRAM_ID = new PublicKey(
  process.env.MYCELIUM_MERIDIAN_PROGRAM_ID ??
    (SOLANA_NETWORK === "mainnet-beta" ? MERIDIAN_MAINNET_ID : MERIDIAN_DEVNET_ID)
);

const SEED_EVIDENCE = Buffer.from("evidence");

// ── Interfaces ────────────────────────────────────────────────────────

export interface GenerateMEPParams {
  ipAssetPubkey: string;
  jurisdiction: Jurisdiction;
  meridianProgram: any;       // Anchor Program instance
  requesterKeypair: any;      // Keypair for signing tx
  protocolKeypair: any;       // Protocol authority keypair for Ed25519 signing
  connection: any;            // Solana Connection
}

export interface GenerateMEPResult {
  arweaveUri: string;
  packageHash: string;         // hex-encoded SHA-256
  evidencePda: string;         // base58 EvidencePackage PDA
  transactionSignature: string;
  mepDocument: object;         // The full MEP JSON
}

// ── Raw MEP Upload ────────────────────────────────────────────────────
// Uploads the exact byte string to Arweave, bypassing uploadEvidence()
// which re-serializes via JSON.stringify() and could produce different bytes.
// This guarantees: hash(bytes) === hash(uploaded_bytes).

async function uploadMEPRaw(
  mepJsonString: string,
  keypairBytes: Uint8Array
): Promise<string> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error(
      "SOLANA_RPC_URL not set. Required for Irys uploads."
    );
  }

  try {
    const irys = await Uploader(Solana)
      .withWallet(keypairBytes)
      .withRpc(rpcUrl);

    const tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Mycelium-Protocol" },
      { name: "Type", value: "evidence-package" },
      { name: "MEP-Version", value: "1.0" },
    ];

    // Upload the raw string bytes -- same bytes that were hashed
    const receipt = await irys.upload(Buffer.from(mepJsonString), { tags });
    const url = `https://arweave.net/${receipt.id}`;

    console.error(
      `[evidence-engine] Uploaded MEP to Arweave: size=${mepJsonString.length}B id=${receipt.id} url=${url}`
    );

    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `MEP raw upload failed: ${message}. ` +
        "Check SOL balance on the signing wallet and SOLANA_RPC_URL."
    );
  }
}

// ── Evidence Engine ───────────────────────────────────────────────────

/**
 * Generate a complete Mycelium Evidence Package:
 * assemble -> serialize -> hash -> upload -> sign -> on-chain.
 *
 * The hash consistency invariant is maintained by:
 * 1. Serializing the MEP to a canonical JSON string (sorted keys)
 * 2. Computing SHA-256 from that exact string
 * 3. Uploading that exact string to Arweave (no re-serialization)
 * 4. Signing the hash with Ed25519
 * 5. Passing the hash + signature to the Meridian program
 *
 * The Meridian program verifies the Ed25519 signature matches the hash
 * by parsing the preceding Ed25519 verify instruction.
 */
export async function generateFullMEP(
  params: GenerateMEPParams
): Promise<GenerateMEPResult> {
  const {
    ipAssetPubkey,
    jurisdiction,
    meridianProgram,
    requesterKeypair,
    protocolKeypair,
    connection,
  } = params;

  // ── Step 1: Assemble MEP JSON ─────────────────────────────────────
  const mepDocument = await assembleMEP(ipAssetPubkey, jurisdiction);

  // ── Step 2: Canonical JSON serialization ──────────────────────────
  // Deterministic key ordering via sorted keys for reproducible hashing.
  // Anyone can verify: download from Arweave, sort keys, compute SHA-256.
  const mepJsonString = canonicalStringify(mepDocument);

  // ── Step 3: Compute SHA-256 hash from the canonical string ────────
  // CRITICAL: This hash MUST match the bytes uploaded to Arweave.
  const packageHashBuffer = createHash("sha256")
    .update(mepJsonString)
    .digest();
  const packageHashBytes = new Uint8Array(packageHashBuffer);
  const packageHashHex = packageHashBuffer.toString("hex");

  console.error(
    `[evidence-engine] MEP hash: ${packageHashHex} (${mepJsonString.length} bytes)`
  );

  // ── Step 4: Upload exact bytes to Arweave ─────────────────────────
  // Uses uploadMEPRaw to guarantee hash(uploaded_bytes) === packageHash
  const arweaveUri = await uploadMEPRaw(
    mepJsonString,
    protocolKeypair.secretKey
  );

  // ── Step 5: Ed25519 sign the package hash ─────────────────────────
  const protocolSignature = nacl.sign.detached(
    packageHashBytes,
    protocolKeypair.secretKey
  );

  // ── Step 6: Build Ed25519 verify instruction ──────────────────────
  // MUST be instruction index 0 in the transaction. The Meridian program
  // checks load_instruction_at_checked(0) for Ed25519 precompile.
  const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: protocolKeypair.secretKey,
    message: packageHashBytes,
  });

  // ── Step 7: Derive EvidencePackage PDA ────────────────────────────
  const ipAssetPk = new PublicKey(ipAssetPubkey);
  const [evidencePda] = PublicKey.findProgramAddressSync(
    [SEED_EVIDENCE, ipAssetPk.toBuffer(), requesterKeypair.publicKey.toBuffer()],
    MERIDIAN_PROGRAM_ID
  );

  // ── Step 8: Map jurisdiction to Anchor enum variant ───────────────
  // Anchor expects { variantName: {} } format for Rust enums.
  const jurisdictionVariant = mapJurisdictionToAnchor(jurisdiction);

  // ── Step 9: Build generate_mep instruction ────────────────────────
  const licenseCountSnapshot = mepDocument.license_history.length;
  const totalRoyaltiesSnapshot = 0; // Would need royalty indexer query for real value

  const generateMepIx = await meridianProgram.methods
    .generateMep(
      Array.from(packageHashBytes),           // package_hash: [u8; 32]
      arweaveUri,                              // arweave_uri: String
      Array.from(protocolSignature),           // protocol_signature: [u8; 64]
      licenseCountSnapshot,                    // license_count_snapshot: u32
      new BN(totalRoyaltiesSnapshot),          // total_royalties_snapshot: u64
      jurisdictionVariant                      // jurisdiction: Jurisdiction enum
    )
    .accounts({
      evidencePackage: evidencePda,
      ipAsset: ipAssetPk,
      requester: requesterKeypair.publicKey,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // ── Step 10: Build and send transaction ───────────────────────────
  // Ed25519 verify instruction MUST be at index 0.
  const tx = new Transaction().add(ed25519Ix).add(generateMepIx);

  const transactionSignature = await connection.sendTransaction(tx, [
    requesterKeypair,
  ]);

  // Wait for confirmation
  await connection.confirmTransaction(transactionSignature, "confirmed");

  console.error(
    `[evidence-engine] MEP anchored on-chain: tx=${transactionSignature} pda=${evidencePda.toBase58()}`
  );

  return {
    arweaveUri,
    packageHash: packageHashHex,
    evidencePda: evidencePda.toBase58(),
    transactionSignature,
    mepDocument,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Canonical JSON serialization with deterministic key ordering.
 *
 * Recursively sorts all object keys so that the same logical document
 * always produces the same byte string. This is essential for
 * hash-based verification: anyone can download the MEP from Arweave,
 * apply this same sort, compute SHA-256, and compare to the on-chain hash.
 */
function canonicalStringify(obj: any): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Sort keys alphabetically for deterministic output
      const sorted: Record<string, any> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Map TypeScript Jurisdiction to Anchor enum variant object.
 *
 * Anchor expects Rust enums as { variantName: {} } in JavaScript.
 * E.g., Jurisdiction::Indonesia becomes { indonesia: {} }.
 */
function mapJurisdictionToAnchor(jurisdiction: Jurisdiction): object {
  // Check WIPO-specific handling
  if (jurisdiction === "GENERIC") {
    // Default to international; WIPO handling is done if asset has WIPO metadata
    return { international: {} };
  }

  const variant = JURISDICTION_MAP[jurisdiction];
  if (!variant) {
    return { international: {} };
  }

  return { [variant]: {} };
}
