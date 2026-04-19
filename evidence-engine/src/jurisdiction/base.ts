/**
 * Jurisdiction Adapter interface
 *
 * Every jurisdiction-specific MEP formatter implements this interface.
 * Adding a new jurisdiction is a pure extension — no core changes.
 *
 * Implementations populate the jurisdiction_format block, localize the
 * disclaimer, and supply the reproduction_steps language. They do NOT
 * touch the cryptographic fields (package_hash, protocol_signature).
 */

import type {
  Jurisdiction,
  JurisdictionFormatBlock,
  VerificationBlock,
  MEPDisclaimer,
  IPAssetSnapshot,
} from "../mep-schema.js";

export interface ExpertWitnessDoc {
  language: string;
  content: string;
  arweave_uri: string;
  signature_required: boolean;
  signatory_role: string;
}

export interface JurisdictionAdapter {
  readonly jurisdiction: Jurisdiction;
  readonly languageCode: string; // BCP 47

  /** Legal basis citations for the target jurisdiction. */
  legalBasis(): string[];

  /** Format the jurisdiction_format block. */
  formatJurisdictionBlock(): JurisdictionFormatBlock;

  /** Localize reproduction steps into the jurisdiction's language. */
  reproductionSteps(asset: IPAssetSnapshot): VerificationBlock["reproduction_steps"];

  /** Add jurisdiction-specific disclaimer language. */
  disclaimerText(baseDisclaimer: MEPDisclaimer): MEPDisclaimer;

  /**
   * Optional: generate an expert witness declaration document.
   * Court-specific. Not required at v1.0 but strongly recommended.
   */
  generateExpertWitnessDeclaration?(asset: IPAssetSnapshot): Promise<ExpertWitnessDoc>;
}
