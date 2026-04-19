/**
 * Indonesia Jurisdiction Adapter
 *
 * Formats MEPs for submission to Pengadilan Niaga (Commercial Court) under
 * UU ITE Pasal 5 and Putusan MK No. 20/PUU-XIV/2016. Bahasa Indonesia by
 * default. Returns structured blocks the MEP generator merges into the
 * final JSON.
 *
 * This is the flagship adapter — Indonesia is the Jakarta Protocol's first
 * pilot jurisdiction (§13 of the main submission). Every field is cross-
 * referenced with the legal-integration playbook at
 * docs/Mycelium_Legal_Integration_Playbook.md.
 */

import type { JurisdictionAdapter, ExpertWitnessDoc } from "./base.js";
import type {
  IPAssetSnapshot,
  JurisdictionFormatBlock,
  MEPDisclaimer,
  VerificationBlock,
} from "../mep-schema.js";

const LEGAL_BASIS_ID = [
  "Undang-Undang Nomor 11 Tahun 2008 tentang Informasi dan Transaksi Elektronik, Pasal 5",
  "Putusan Mahkamah Konstitusi Nomor 20/PUU-XIV/2016",
  "Undang-Undang Nomor 28 Tahun 2014 tentang Hak Cipta",
  "Undang-Undang Nomor 20 Tahun 2016 tentang Merek dan Indikasi Geografis",
];

const DISCLAIMER_ID =
  "Paket Bukti Mycelium ini merupakan bukti elektronik pelengkap berdasarkan Protokol Jakarta v1.0. " +
  "Paket ini tidak memberikan hak kekayaan intelektual statutoris. Hak statutoris timbul dari " +
  "pendaftaran merek, hak cipta, dan paten nasional. MEP ini menegaskan, dengan integritas " +
  "kriptografis, fakta-fakta tentang penciptaan, lisensi, dan distribusi royalti yang tercatat " +
  "pada slot Solana yang dirujuk di sini.";

export class IndonesiaAdapter implements JurisdictionAdapter {
  readonly jurisdiction = "Indonesia" as const;
  readonly languageCode = "id-ID";

  constructor(
    private readonly options: {
      court?: string; // default "Pengadilan Niaga Jakarta Pusat"
      includeExpertWitness?: boolean; // default true
      includeNotarizationGuidance?: boolean; // default true
      expertWitnessArweaveUri?: string | null;
    } = {},
  ) {}

  legalBasis(): string[] {
    return [...LEGAL_BASIS_ID];
  }

  formatJurisdictionBlock(): JurisdictionFormatBlock {
    return {
      target_jurisdiction: "Indonesia",
      legal_basis: this.legalBasis(),
      language: this.languageCode,
      court_format: this.options.court ?? "Pengadilan Niaga Jakarta Pusat",
      expert_witness_declaration_included: this.options.includeExpertWitness ?? true,
      verification_instructions_included: true,
      notarization_guidance_included: this.options.includeNotarizationGuidance ?? true,
      expert_witness_statement_arweave_uri: this.options.expertWitnessArweaveUri ?? null,
    };
  }

  reproductionSteps(asset: IPAssetSnapshot): VerificationBlock["reproduction_steps"] {
    const slot = asset.registration_slot;
    const ts = asset.registration_timestamp_utc;
    return [
      {
        step: 1,
        action: `Buka URL explorer_url untuk ip_asset di browser manapun`,
        expected: `Konfirmasi registration_slot = ${slot} dan registration_timestamp_utc = ${ts} cocok dengan data on-chain`,
      },
      {
        step: 2,
        action: "Buka URL Arweave untuk content_metadata dan unduh file yang dikembalikan",
        expected: "File berhasil diunduh; konten deterministik (tidak berubah setiap pengunduhan)",
      },
      {
        step: 3,
        action: "Hitung SHA-256 dari file yang diunduh (gunakan sha256sum, hashlib Python, atau crypto.subtle JavaScript)",
        expected: "Hash yang dihitung sama persis dengan field ip_asset.content_hash",
      },
      {
        step: 4,
        action: "Verifikasi protocol_signature terhadap protocol_authority menggunakan Ed25519 (RFC 8032)",
        expected: "Tanda tangan valid — pesan yang ditandatangani adalah package_hash dokumen ini",
      },
      {
        step: 5,
        action: "Serialisasi dokumen MEP ini dalam JSON kanonikal (JCS RFC 8785) dengan field package_hash dikosongkan, lalu SHA-256",
        expected: "Hash yang dihitung sama dengan nilai field package_hash",
      },
    ];
  }

  disclaimerText(baseDisclaimer: MEPDisclaimer): MEPDisclaimer {
    return {
      ...baseDisclaimer,
      id: DISCLAIMER_ID,
    };
  }

  async generateExpertWitnessDeclaration(asset: IPAssetSnapshot): Promise<ExpertWitnessDoc> {
    const content = this.expertWitnessTemplate(asset);
    return {
      language: "id-ID",
      content,
      arweave_uri: this.options.expertWitnessArweaveUri ?? "",
      signature_required: true,
      signatory_role: "Ahli Forensik Digital Bersertifikasi",
    };
  }

  private expertWitnessTemplate(asset: IPAssetSnapshot): string {
    return `SURAT KETERANGAN AHLI
(Expert Witness Declaration)

Perkara: Pembuktian Bukti Elektronik Protokol Jakarta (MEP)
Aset IP: ${asset.pda_address}
Pengadilan: ${this.options.court ?? "Pengadilan Niaga Jakarta Pusat"}

I. IDENTITAS AHLI

Saya, yang bertanda tangan di bawah ini, selaku ahli forensik digital bersertifikasi,
dengan ini memberikan keterangan mengenai integritas kriptografis Paket Bukti Mycelium
(Mycelium Evidence Package, "MEP") yang diajukan dalam perkara ini.

II. LANDASAN HUKUM

Keterangan ini disampaikan berdasarkan:
${LEGAL_BASIS_ID.map((l) => `  - ${l}`).join("\n")}

III. METODE PEMERIKSAAN

1. Verifikasi hash konten SHA-256 terhadap file asli di Arweave
2. Verifikasi tanda tangan Ed25519 terhadap otoritas protokol yang terdaftar
3. Verifikasi kanonikal hash dokumen MEP menurut RFC 8785
4. Konfirmasi timestamp Solana Proof of History pada slot ${asset.registration_slot}

IV. HASIL

Berdasarkan pemeriksaan yang saya lakukan pada tanggal _____________, dengan ini saya
menyatakan bahwa MEP yang diajukan:

  [ ] MEMENUHI seluruh persyaratan integritas kriptografis Protokol Jakarta v1.0
  [ ] TIDAK MEMENUHI persyaratan (uraian ketidaksesuaian dilampirkan)

V. PENUTUP

Demikian surat keterangan ini saya buat dengan sebenar-benarnya dan disertai sumpah
sesuai ketentuan hukum yang berlaku.

Jakarta, _____________
Ahli Forensik Digital

(_________________________________)
Nama: _____________________________
Sertifikasi: ______________________
Institusi: ________________________
`;
  }
}
