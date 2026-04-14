/**
 * Mycelium Protocol -- Irys/Arweave Upload Pipeline
 *
 * Wraps the @irys/upload SDK (pre-1.0, API may change) in a stable
 * adapter pattern. Uploads IP metadata and evidence packages to Arweave
 * via Irys, returning permanent URIs.
 *
 * All uploads are tagged with App-Name=Mycelium-Protocol for discoverability.
 * Payment is in SOL via the provided keypair.
 */

import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

/**
 * Create an Irys uploader instance configured for Solana.
 * Uses the provided keypair bytes for signing and payment.
 */
async function getIrysUploader(keypairBytes: Uint8Array) {
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
    return irys;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to initialize Irys uploader: ${message}`);
  }
}

/**
 * Build a permanent Arweave URL from a transaction ID.
 */
export function getArweaveUrl(txId: string): string {
  return `https://arweave.net/${txId}`;
}

/**
 * Upload IP metadata JSON to Arweave via Irys.
 *
 * Tags:
 *   Content-Type: application/json
 *   App-Name: Mycelium-Protocol
 *   Type: ip-metadata
 *
 * @returns Permanent Arweave URL (https://arweave.net/{id})
 */
export async function uploadMetadata(
  metadata: object,
  keypairBytes: Uint8Array
): Promise<string> {
  try {
    const irys = await getIrysUploader(keypairBytes);
    const data = JSON.stringify(metadata);
    const tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Mycelium-Protocol" },
      { name: "Type", value: "ip-metadata" },
    ];

    const receipt = await irys.upload(data, { tags });
    const url = getArweaveUrl(receipt.id);

    console.error(
      `[mycelium-storage] Uploaded metadata: size=${data.length}B id=${receipt.id} url=${url}`
    );

    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Irys metadata upload failed: ${message}. ` +
        "Check SOL balance on the signing wallet and SOLANA_RPC_URL."
    );
  }
}

/**
 * Upload an evidence package JSON to Arweave via Irys.
 *
 * Tags:
 *   Content-Type: application/json
 *   App-Name: Mycelium-Protocol
 *   Type: evidence-package
 *
 * @returns Permanent Arweave URL (https://arweave.net/{id})
 */
export async function uploadEvidence(
  evidenceJson: object,
  keypairBytes: Uint8Array
): Promise<string> {
  try {
    const irys = await getIrysUploader(keypairBytes);
    const data = JSON.stringify(evidenceJson);
    const tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Mycelium-Protocol" },
      { name: "Type", value: "evidence-package" },
    ];

    const receipt = await irys.upload(data, { tags });
    const url = getArweaveUrl(receipt.id);

    console.error(
      `[mycelium-storage] Uploaded evidence: size=${data.length}B id=${receipt.id} url=${url}`
    );

    return url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Irys evidence upload failed: ${message}. ` +
        "Check SOL balance on the signing wallet and SOLANA_RPC_URL."
    );
  }
}

/**
 * Check the Irys balance for the given keypair.
 * Useful for pre-upload verification to avoid failed uploads.
 *
 * @returns Balance in atomic units (lamports equivalent on Irys)
 */
export async function checkBalance(
  keypairBytes: Uint8Array
): Promise<number> {
  try {
    const irys = await getIrysUploader(keypairBytes);
    const balance = await irys.getBalance();
    const balanceNum =
      typeof balance === "bigint" ? Number(balance) : Number(balance);

    console.error(
      `[mycelium-storage] Irys balance: ${balanceNum} atomic units`
    );

    return balanceNum;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to check Irys balance: ${message}`);
  }
}
