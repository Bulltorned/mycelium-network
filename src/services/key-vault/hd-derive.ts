/**
 * Mycelium Protocol -- BIP-44 HD Key Derivation
 *
 * Derives unique Solana keypairs for each agent using standard
 * BIP-44 path: m/44'/501'/{agentIndex}'/0'
 *
 * Master mnemonic is read from MASTER_MNEMONIC env var.
 * Each agent gets a deterministic keypair based on its index.
 * Keypairs are encrypted and stored in PostgreSQL via encrypted-store.
 */

import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";
import { query } from "../db/pool.js";
import { storeEncryptedKey, loadEncryptedKey } from "./encrypted-store.js";
import type { AgentWallet } from "../../types.js";

/**
 * Derive a Solana keypair from a master mnemonic at a specific BIP-44 index.
 * Path: m/44'/501'/{agentIndex}'/0'
 *   44'  = BIP-44 purpose
 *   501' = Solana coin type (SLIP-44)
 *   N'   = agent index (account)
 *   0'   = change index
 */
export function deriveAgentKeypair(
  masterMnemonic: string,
  agentIndex: number
): Keypair {
  const seed = mnemonicToSeedSync(masterMnemonic);
  const path = `m/44'/501'/${agentIndex}'/0'`;
  const derived = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(derived.key);
}

/**
 * Get an existing agent wallet or create a new one.
 *
 * 1. Check agent_wallets table for existing agent_id
 * 2. If found, return stored wallet info (no re-derivation)
 * 3. If not found:
 *    a. Get next derivation_index (MAX + 1, or 0 if none)
 *    b. Derive keypair from master mnemonic
 *    c. Encrypt and store in PostgreSQL
 *    d. Return AgentWallet
 */
export async function getOrCreateAgentWallet(
  agentId: string,
  masterMnemonic: string
): Promise<AgentWallet> {
  // Check for existing wallet
  const existing = await query(
    "SELECT public_key, derivation_index, created_at FROM agent_wallets WHERE agent_id = $1",
    [agentId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      agentId,
      solanaWallet: row.public_key,
      usdcBalance: 0, // Balance is fetched on-chain, not stored in DB
      createdAt: Math.floor(new Date(row.created_at).getTime() / 1000),
      lastActivity: Math.floor(Date.now() / 1000),
    };
  }

  // Determine next derivation index
  const maxResult = await query(
    "SELECT COALESCE(MAX(derivation_index), -1) + 1 AS next_index FROM agent_wallets"
  );
  const nextIndex: number = maxResult.rows[0].next_index;

  // Derive keypair
  const keypair = deriveAgentKeypair(masterMnemonic, nextIndex);
  const publicKey = keypair.publicKey.toBase58();

  // Encrypt and store
  await storeEncryptedKey(
    agentId,
    nextIndex,
    publicKey,
    keypair.secretKey
  );

  console.error(
    `[mycelium-vault] Created wallet for agent=${agentId} index=${nextIndex} pubkey=${publicKey}`
  );

  return {
    agentId,
    solanaWallet: publicKey,
    usdcBalance: 0,
    createdAt: Math.floor(Date.now() / 1000),
    lastActivity: Math.floor(Date.now() / 1000),
  };
}
