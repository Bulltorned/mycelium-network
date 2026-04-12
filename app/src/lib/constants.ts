import { PublicKey } from "@solana/web3.js";

// Program IDs — deployed on devnet
export const PROGRAM_IDS = {
  spore: new PublicKey("AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz"),
  hypha: new PublicKey("9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5"),
  rhizome: new PublicKey("9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu"),
  meridian: new PublicKey("7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc"),
} as const;

// PDA seeds — must match on-chain constants
export const SEEDS = {
  IP_ASSET: Buffer.from("ip_asset"),
  CONTENT_HASH: Buffer.from("content_hash_index"),
  LICENSE_TEMPLATE: Buffer.from("license_template"),
  LICENSE: Buffer.from("license"),
  ROYALTY_CONFIG: Buffer.from("royalty_config"),
  ROYALTY_VAULT: Buffer.from("royalty_vault"),
  EVIDENCE: Buffer.from("evidence"),
} as const;

// Cluster config
export const CLUSTER_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const CLUSTER =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as "devnet" | "mainnet-beta") ||
  "devnet";

export const EXPLORER_URL =
  CLUSTER === "devnet"
    ? "https://explorer.solana.com/address/{address}?cluster=devnet"
    : "https://explorer.solana.com/address/{address}";

export const TX_EXPLORER_URL =
  CLUSTER === "devnet"
    ? "https://explorer.solana.com/tx/{sig}?cluster=devnet"
    : "https://explorer.solana.com/tx/{sig}";

// Constraints
export const MAX_URI_LENGTH = 128;
export const MAX_NAME_LENGTH = 64;
export const MAX_PURPOSE_LENGTH = 128;
