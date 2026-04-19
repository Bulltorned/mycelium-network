/**
 * @mycelium/evidence-engine
 *
 * Generates Mycelium Evidence Packages (MEPs) — the canonical JSON document
 * that anchors to the blockchain via mycelium_meridian::generate_mep.
 *
 * This is the Jakarta Protocol's off-chain evidence layer. Every function
 * in this package operates on data, not chains. The on-chain anchoring
 * (Meridian CPI) is the caller's responsibility.
 */

export * from "./mep-schema.js";
export { canonicalize, canonicalizeBytes, sha256Hex, hashCanonical } from "./canonical-json.js";
export type { JsonValue } from "./canonical-json.js";
export { generateUnsignedMEP, attachSignature } from "./mep-generator.js";
export type { GenerateMEPInput, UnsignedMEP } from "./mep-generator.js";
export { getAdapter, IndonesiaAdapter } from "./jurisdiction/index.js";
export type { JurisdictionAdapter, ExpertWitnessDoc } from "./jurisdiction/index.js";
