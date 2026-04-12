import { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS, SEEDS } from "./constants";

/**
 * Derive the IPAsset PDA address.
 * @param originalCreator The original creator pubkey (immutable, set at registration).
 *   For new registrations, this is the signer. For lookups after transfer,
 *   use the original creator -- NOT the current owner.
 * @param contentHash The SHA-256 content hash (32 bytes).
 */
export function findIPAssetPDA(
  originalCreator: PublicKey,
  contentHash: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.IP_ASSET, originalCreator.toBuffer(), contentHash],
    PROGRAM_IDS.spore
  );
}

/**
 * Derive the ContentHashRegistry PDA address.
 * Used for global content hash uniqueness -- one PDA per unique content hash.
 * @param contentHash The SHA-256 content hash (32 bytes).
 */
export function findContentHashRegistryPDA(
  contentHash: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CONTENT_HASH, contentHash],
    PROGRAM_IDS.spore
  );
}

export function findLicenseTemplatePDA(
  ipAsset: PublicKey,
  licensor: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.LICENSE_TEMPLATE, ipAsset.toBuffer(), licensor.toBuffer()],
    PROGRAM_IDS.hypha
  );
}

export function findLicensePDA(
  template: PublicKey,
  licensee: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.LICENSE, template.toBuffer(), licensee.toBuffer()],
    PROGRAM_IDS.hypha
  );
}

export function findRoyaltyConfigPDA(
  ipAsset: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.ROYALTY_CONFIG, ipAsset.toBuffer()],
    PROGRAM_IDS.rhizome
  );
}

export function findEvidencePDA(
  ipAsset: PublicKey,
  requester: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EVIDENCE, ipAsset.toBuffer(), requester.toBuffer()],
    PROGRAM_IDS.meridian
  );
}
