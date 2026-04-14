/**
 * Mycelium Protocol -- AES-256-GCM Encrypted Key Store
 *
 * Encrypts agent secret keys before storing in PostgreSQL.
 * Master encryption key is read from MASTER_ENCRYPTION_KEY env var (32 bytes hex).
 *
 * SECURITY: Never log secret key material. Only log public keys and agent IDs.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { query } from "../db/pool.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard: 96-bit IV
const TAG_LENGTH = 16; // GCM standard: 128-bit auth tag

/**
 * Get the master encryption key from environment.
 * Must be exactly 32 bytes (64 hex chars).
 */
function getMasterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY not set. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must be 64 hex chars (32 bytes), got ${hex.length}`
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt data with AES-256-GCM using a random IV.
 * Returns iv, encrypted ciphertext, and auth tag -- all hex-encoded.
 */
export function encrypt(data: Buffer): {
  iv: string;
  encrypted: string;
  tag: string;
} {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    encrypted: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * All inputs are hex-encoded strings.
 */
export function decrypt(
  encrypted: string,
  iv: string,
  tag: string
): Buffer {
  const key = getMasterKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);
}

/**
 * Store an encrypted agent keypair in PostgreSQL.
 * The secret key is encrypted with AES-256-GCM before storage.
 * Only the public key is stored in plaintext (for lookups).
 *
 * encrypted_metadata column format: JSON { iv, encrypted, tag }
 */
export async function storeEncryptedKey(
  agentId: string,
  derivationIndex: number,
  publicKey: string,
  secretKey: Uint8Array
): Promise<void> {
  const { iv, encrypted, tag } = encrypt(Buffer.from(secretKey));
  const metadata = JSON.stringify({ iv, encrypted, tag });

  await query(
    `INSERT INTO agent_wallets (agent_id, derivation_index, public_key, encrypted_metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id) DO UPDATE SET
       encrypted_metadata = EXCLUDED.encrypted_metadata`,
    [agentId, derivationIndex, publicKey, metadata]
  );

  // Safe to log: only public key and agent ID, never secret key
  console.error(
    `[mycelium-vault] Stored encrypted key for agent=${agentId} pubkey=${publicKey}`
  );
}

/**
 * Load and decrypt an agent keypair from PostgreSQL.
 * Returns null if agent_id not found.
 */
export async function loadEncryptedKey(
  agentId: string
): Promise<Keypair | null> {
  const result = await query(
    "SELECT encrypted_metadata FROM agent_wallets WHERE agent_id = $1",
    [agentId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const { iv, encrypted, tag } = JSON.parse(
    result.rows[0].encrypted_metadata
  ) as { iv: string; encrypted: string; tag: string };

  const secretKeyBytes = decrypt(encrypted, iv, tag);
  return Keypair.fromSecretKey(new Uint8Array(secretKeyBytes));
}
