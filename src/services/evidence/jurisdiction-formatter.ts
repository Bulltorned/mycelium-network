/**
 * Mycelium Protocol -- Jurisdiction Formatter
 *
 * Produces jurisdiction-specific legal compliance sections for Mycelium
 * Evidence Packages (MEPs). Each jurisdiction has different requirements
 * for electronic evidence admissibility.
 *
 * Currently supported:
 *   - Indonesia (UU ITE Pasal 5) -- primary market
 *   - WIPO Arbitration (ECAF-compatible)
 *   - Generic international format (fallback)
 *
 * Future: Kenya (Evidence Act 106B), Colombia (Ley 527 / CGP 247),
 *         China (SPC Provisions), US (Federal Rules of Evidence 902(14))
 */

import type { Jurisdiction, IPAsset } from "../../types.js";

// ── Types ─────────────────────────────────────────────────────────────

interface IndonesiaJurisdictionSection {
  jurisdiction_code: "ID";
  jurisdiction_name: "Republik Indonesia";
  legal_basis: string;
  compliance: {
    electronic_system_compliant: boolean;
    system_description: string;
    integrity_guarantee: {
      method: string;
      arweave_permanence: string;
      protocol_signature: string;
    };
    accessibility: {
      arweave_uri: string;
      solana_explorer: string;
      verification_instructions_bahasa: string;
    };
    juridical_justification: string;
  };
  verification_guide_id: string;
}

interface WIPOJurisdictionSection {
  jurisdiction_code: "WIPO";
  jurisdiction_name: "WIPO Arbitration and Mediation Center";
  legal_basis: string;
  submission_format: string;
  evidence_classification: string;
  chain_of_custody: {
    registration: string;
    timestamp: string;
    storage: string;
    integrity: string;
    authentication: string;
  };
  wipo_compatible_metadata: {
    nice_class: number | null;
    berne_category: number | null;
    country_of_origin: string;
    first_use_date: string | null;
  };
}

interface GenericJurisdictionSection {
  jurisdiction_code: string;
  jurisdiction_name: string;
  legal_basis: string;
  evidence_type: string;
  integrity_method: string;
  timestamp_source: string;
  storage_permanence: string;
  authentication_method: string;
}

// ── Jurisdiction Formatter ────────────────────────────────────────────

/**
 * Format jurisdiction-specific legal compliance section for a MEP.
 *
 * @param jurisdiction - Target jurisdiction code from Mycelium types
 * @param asset - The IP asset being packaged
 * @param licenses - License history for the asset
 * @param provenance - Provenance chain entries
 * @returns Jurisdiction-specific compliance object for inclusion in MEP JSON
 */
export function formatForJurisdiction(
  jurisdiction: Jurisdiction,
  asset: any,
  licenses: any[],
  provenance: any[]
): object {
  switch (jurisdiction) {
    case "ID":
      return formatIndonesia(asset);

    case "GENERIC":
      // GENERIC can serve as WIPO Arbitration format when the asset has
      // WIPO-aligned metadata (niceClass or berneCategory set)
      if (asset.wipoAligned || asset.niceClass || asset.berneCategory) {
        return formatWIPOArbitration(asset);
      }
      return formatGenericInternational(jurisdiction, asset);

    case "KE":
      return formatGenericInternational(jurisdiction, asset);

    case "CO":
      return formatGenericInternational(jurisdiction, asset);

    default:
      return formatGenericInternational(jurisdiction, asset);
  }
}

/**
 * Format WIPO Arbitration section explicitly.
 * Exported for direct use when WIPO formatting is needed regardless of jurisdiction code.
 */
export function formatWIPOArbitration(asset: any): WIPOJurisdictionSection {
  const countryOfOrigin = String.fromCharCode(
    asset.countryOfOrigin[0],
    asset.countryOfOrigin[1]
  );
  const firstUseDate = asset.firstUseDate
    ? new Date(asset.firstUseDate * 1000).toISOString()
    : null;

  return {
    jurisdiction_code: "WIPO",
    jurisdiction_name: "WIPO Arbitration and Mediation Center",
    legal_basis: "WIPO Arbitration Rules (effective July 1, 2021)",
    submission_format: "WIPO Electronic Case Facility (ECAF) compatible",
    evidence_classification: "Digital Evidence — Blockchain Proof of Existence",
    chain_of_custody: {
      registration: `Content hash registered on Solana blockchain at slot ${asset.registrationSlot}`,
      timestamp:
        "Solana Proof of History provides cryptographic timestamp — " +
        "each slot has a verifiable position in a SHA-256 hash chain",
      storage:
        "Full content stored on Arweave permaweb with permanent URI — " +
        "data is replicated across 1000+ miners with 200-year endowment guarantee",
      integrity:
        "SHA-256 hash chain from content to on-chain record — " +
        "any modification to the evidence document changes the hash, " +
        "which would not match the immutable on-chain record",
      authentication:
        "Ed25519 protocol signature by Mycelium Protocol authority — " +
        "the protocol key is verified on-chain via Solana's Ed25519 precompile",
    },
    wipo_compatible_metadata: {
      nice_class: asset.niceClass ?? null,
      berne_category: asset.berneCategory ?? null,
      country_of_origin: countryOfOrigin,
      first_use_date: firstUseDate,
    },
  };
}

// ── Indonesia (UU ITE Pasal 5) ────────────────────────────────────────

/**
 * Format for Indonesian courts under Undang-Undang Informasi dan
 * Transaksi Elektronik (UU ITE) Pasal 5.
 *
 * Requirements for electronic evidence admissibility in Indonesia:
 * 1. Dibuat melalui Sistem Elektronik yang terpercaya (trusted electronic system)
 * 2. Dapat ditampilkan dan diakses (displayable and accessible)
 * 3. Dijamin keutuhannya (integrity guaranteed)
 * 4. Dapat dipertanggungjawabkan (accountable / attributable)
 */
function formatIndonesia(asset: any): IndonesiaJurisdictionSection {
  return {
    jurisdiction_code: "ID",
    jurisdiction_name: "Republik Indonesia",
    legal_basis:
      "Undang-Undang Informasi dan Transaksi Elektronik (UU ITE) Pasal 5",
    compliance: {
      electronic_system_compliant: true,
      system_description:
        "Mycelium Protocol — Solana blockchain-based IP registration with " +
        "SHA-256 content hashing and Ed25519 protocol signatures",
      integrity_guarantee: {
        method:
          "SHA-256 hash of evidence document stored on Solana blockchain (immutable ledger)",
        arweave_permanence:
          "Full evidence document stored on Arweave permaweb (permanent, tamper-proof)",
        protocol_signature:
          "Ed25519 digital signature by Mycelium Protocol authority",
      },
      accessibility: {
        arweave_uri: "Permanent URI accessible via any web browser",
        solana_explorer: "On-chain record verifiable via Solana Explorer",
        verification_instructions_bahasa:
          "Petunjuk verifikasi tersedia dalam Bahasa Indonesia",
      },
      juridical_justification:
        "Bukti elektronik ini memenuhi syarat Pasal 5 ayat (1) UU ITE " +
        "sebagai alat bukti yang sah karena: " +
        "(1) dibuat melalui Sistem Elektronik yang terpercaya (blockchain Solana), " +
        "(2) dapat ditampilkan dan diakses (Arweave permaweb), " +
        "(3) dijamin keutuhannya (hash SHA-256), " +
        "(4) dapat dipertanggungjawabkan (tanda tangan digital Ed25519)",
    },
    verification_guide_id: "Panduan Verifikasi Bukti Digital Mycelium",
  };
}

// ── Generic International Format ──────────────────────────────────────

function formatGenericInternational(
  jurisdiction: Jurisdiction,
  asset: any
): GenericJurisdictionSection {
  const jurisdictionNames: Record<string, string> = {
    KE: "Republic of Kenya",
    CO: "Republic of Colombia",
    CN: "People's Republic of China",
    US: "United States of America (Federal)",
    GB: "United Kingdom",
    EU: "European Union",
    ZA: "Republic of South Africa",
    GENERIC: "International",
  };

  return {
    jurisdiction_code: jurisdiction,
    jurisdiction_name: jurisdictionNames[jurisdiction] ?? "International",
    legal_basis: "International digital evidence standards (ISO 27037:2012)",
    evidence_type: "Digital Evidence — Blockchain Proof of Existence",
    integrity_method:
      "SHA-256 cryptographic hash stored immutably on Solana blockchain",
    timestamp_source:
      "Solana Proof of History — cryptographic timestamp at slot " +
      asset.registrationSlot,
    storage_permanence:
      "Arweave permaweb — permanent, decentralized, tamper-proof storage",
    authentication_method:
      "Ed25519 digital signature by Mycelium Protocol authority, " +
      "verified on-chain via Solana Ed25519 precompile",
  };
}
