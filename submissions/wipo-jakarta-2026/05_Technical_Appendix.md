# Appendix 05 — Technical Appendix

*Companion to the Jakarta Protocol WIPO Submission, October 2026*

---

## A. Canonical JSON serialisation for MEP hashing

The `package_hash` field in an MEP is computed over the MEP document itself, minus the `package_hash` field. To avoid serialisation ambiguity, the Protocol requires the following canonical form:

- UTF-8 encoding
- No trailing whitespace
- Keys sorted lexicographically at every nesting level
- Arrays preserve order (arrays are semantically ordered in MEP)
- Numbers serialised without scientific notation
- Unicode strings in NFC normalisation
- `package_hash` field: empty string `""` during hashing
- Newline termination: single `\n` at end of document

Reference implementation: `jc.canonicalize(obj)` using JCS (RFC 8785).

---

## B. Ed25519 signature verification — strict mode

Meridian's `generate_mep` instruction requires a preceding Ed25519 verification instruction in the same transaction. Presence-only checking is explicitly insufficient. The program parses the Ed25519 instruction data and enforces:

1. `num_signatures == 1` (bytes 0–1, little-endian u16)
2. `pubkey_offset + 32 ≤ ix_data.len()` (bytes 8–9 point to valid pubkey region)
3. `ed25519_pubkey == PROTOCOL_AUTHORITY.as_ref()` (exact match on declared authority)
4. `message_offset + message_size ≤ ix_data.len()` (bytes 12–15 point to valid message region)
5. `ed25519_message == package_hash` (signed message is the exact MEP hash being stored)

Any mismatch returns `MeridianError::InvalidProtocolAuthority` or `MeridianError::PackageHashMismatch`.

This pattern prevents two common attacks:

- **Signature-substitution attack.** Attacker submits a valid Ed25519 instruction signed by someone else, hoping the program only checks instruction presence. Rejected at step 3.
- **Message-mismatch attack.** Attacker submits a valid signature over arbitrary data, hoping the program does not verify the signed message equals the MEP hash. Rejected at step 5.

Source: `programs/mycelium-meridian/src/lib.rs` lines 72–140.

---

## C. Content-hash global uniqueness

The Spore program enforces global uniqueness of content hashes via a `ContentHashRegistry` PDA seeded at `["content_hash_registry", content_hash]`.

- A registration with an existing `content_hash` fails at PDA-init time (address already exists).
- This prevents a third party from re-registering someone else's work under a new PDA.
- The registry PDA stores: `content_hash` (32 bytes), `ip_asset` (pubkey of first-registering IPAsset), `bump`.

Attack vector closed: "spore race." Without the registry, a monitor could detect a new registration, extract the content hash from the emitted event, and attempt to register the same hash under their own creator key with a different PDA seed. The registry prevents this.

Edge case: what if two creators genuinely create identical content? The first to register wins. The second receives a transaction failure and must either challenge via `mycelium_drp` (Stage 2: direct resolution) or adjust their content. This is the correct outcome — identical content cannot have two first-creators.

---

## D. Platform-wallet binding in Rhizome

Rhizome's `configure_royalty` accepts a `platform_wallet: Pubkey` at configuration time. This address is stored in the `RoyaltyConfig` PDA.

`distribute_royalties` has a constraint:

```rust
#[account(
    mut,
    constraint = platform_wallet.key() == royalty_config.platform_wallet
        @ RhizomeError::Unauthorized
)]
pub platform_wallet: SystemAccount<'info>,
```

This prevents the platform-fee-drain attack: an attacker cannot call `distribute_royalties` with an attacker-controlled `platform_wallet` account to redirect platform fees to themselves. The binding is at configuration time; subsequent distributions must use the bound wallet.

Source: `programs/mycelium-rhizome/src/lib.rs` lines 304–308.

---

## E. DRP authority PDA

The DRP program has the authority to mutate `IPAsset.status` in Spore via CPI — for example, setting an IP to `Disputed` status during Stage 1 dispute resolution, or to `Revoked` after Stage 4 arbitration.

This CPI is gated by a `DRP_AUTHORITY` PDA constant in Spore, derived from the DRP program ID + `"drp_authority"` seed:

- Mainnet DRP program: `BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU`
- Derived PDA: `MG5mccsiGSx2GLRoyBG4aZvUSejPGTqChxzSXJ5kAGM` (bump=255)

Only the DRP program, signing via the PDA, can call `update_status` on IPAssets. This is enforced by Anchor's `has_one` / signer constraint on the update_status context.

Consequence: no other program can mutate IPAsset status. Dispute outcomes flow through the DRP program by design.

---

## F. Jurisdiction adapter interface

Jurisdiction-specific MEP formatting is pluggable:

```typescript
interface JurisdictionAdapter {
  readonly jurisdictionCode: Jurisdiction;
  readonly languageCode: string; // BCP 47

  formatMEP(ipAsset: IPAsset, licenses: License[], royalty: RoyaltyConfig):
    Promise<FormattedMEP>;

  generateExpertWitnessDeclaration(mep: FormattedMEP):
    Promise<ExpertWitnessDoc>;

  generateVerificationInstructions(mep: FormattedMEP):
    Promise<string>;

  legalBasis(): LegalBasis[];
}
```

Implementations (v1.0):
- `IndonesiaAdapter` — UU ITE Pasal 5, Bahasa Indonesia, Pengadilan Niaga
- `KenyaAdapter` — Evidence Act §106B, English, High Court, §53 Certificate
- `ColombiaAdapter` — Ley 527 Art 5/11/12, Spanish, SIC, CGP Art 247
- `WIPOArbitrationAdapter` — Arbitration Center submission, English, international format
- `InternationalAdapter` — Generic W3C PROV, English, no jurisdiction-specific framing

Planned v1.1:
- `ChinaInternetCourtAdapter` — Internet Court format, Mandarin, BSN integration
- `UKEnglandWalesAdapter` — Practice Direction 31B, English, High Court
- `USFederalAdapter` — FRE 901/902, English
- `EUeIDASAdapter` — qualified electronic signature mapping

---

## G. Verification procedure for a non-technical judge

The MEP document contains a `verification.reproduction_steps` array. Each step is actionable by a judge or court clerk with no cryptographic training:

1. **Browser explorer check.** Click the `explorer_urls.ip_asset` link. Confirm `registration_slot` and `registration_timestamp_utc` match the on-chain data. Estimated time: 2 minutes.

2. **Arweave retrieval.** Click `arweave_urls.content_metadata`. Download the returned content. Estimated time: 1 minute.

3. **Hash recomputation.** Open a command line. Run `sha256sum <downloaded_file>`. Compare output to `ip_asset.content_hash`. They must match. Estimated time: 2 minutes. (Alternatively, use any online SHA-256 calculator such as emn178.github.io/online-tools/sha256_checksum — paste the file, confirm hash.)

4. **Signature verification.** Use any Ed25519 verification tool (openssl, PyNaCl, Ed25519 JavaScript libraries) to verify that `protocol_signature` is a valid signature by `protocol_authority` over `package_hash`. Estimated time: 3 minutes for a court clerk with basic scripting; zero minutes if a pre-built verification web app is provided.

5. **MEP document canonicalisation.** Serialise this MEP document with `package_hash` set to empty string, canonicalise per §A, and SHA-256 the result. Confirm output equals the stored `package_hash`. Estimated time: 3 minutes with a pre-built canonicalisation tool.

Total: 12 minutes for a court clerk. The Protocol commits to providing a web-based verification tool (published at `verify.jakarta-protocol.org`) that automates all five steps for non-technical users, reducing verification time to under 60 seconds.

---

## H. What happens if Arweave disappears

Arweave is the default permanent-storage layer. Its economic endowment model guarantees retrieval for approximately 200 years at current storage rates.

If Arweave fails or the permanent-storage assumption is broken:

- The on-chain `IPAsset` and `EvidencePackage` PDAs remain valid — the content_hash, signatures, and metadata_uri are unchanged.
- Verifiers can no longer retrieve the content to recompute the hash, losing step 3 of the verification procedure.
- Steps 1, 2 (URL ping only), 4 (signature check), and 5 (hash-of-doc check) remain possible.

Mitigation path: the Protocol v1.1 permits alternative permanent-storage backends (Filecoin with a PoSt endowment, IPFS with a pinning SLA from at least 3 independent providers, S3 Glacier Deep Archive with a notarised 100-year SLA). Creators can opt into redundant storage at registration time.

---

## I. Quantum-resistance posture

Ed25519 is vulnerable to a sufficiently large quantum computer. Current NIST estimates place practical cryptographically relevant quantum computers at 15–25 years out.

The Protocol's response:

- **Short term (v1.0):** Ed25519 is used. Signatures signed today remain verifiable today. If a quantum attack emerges, historical MEPs can be re-anchored under a post-quantum signature scheme via `update_mep` — the `superseded_by` chain preserves evidentiary continuity.
- **Medium term (v2.0):** Add post-quantum signature support (likely Dilithium from NIST PQC standardisation) as an alternate `protocol_signature` field. Backward-compatible with v1.0 MEPs.
- **Long term:** When quantum attacks on Ed25519 become practical, the Protocol will issue a coordinated revocation of all v1.0 signatures and require re-anchoring under post-quantum schemes. Historical evidentiary value is preserved via `superseded_by`; forward evidentiary value transitions.

This is documented transparently in the governance charter, not hidden in a footnote.

---

## J. Program addresses and bytecode hashes

Devnet deployments (April 2026):

| Program | Address | Deployed slot | Bytecode SHA-256 (to be computed at audit) |
|---|---|---|---|
| mycelium_spore | AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz | TBD | TBD |
| mycelium_hypha | 9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5 | TBD | TBD |
| mycelium_rhizome | 9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu | TBD | TBD |
| mycelium_meridian | 7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc | TBD | TBD |
| mycelium_drp | Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS | TBD | TBD |

Mainnet-beta addresses (reserved, pending OtterSec audit):

| Program | Address |
|---|---|
| mycelium_spore | GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR |
| mycelium_hypha | BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV |
| mycelium_rhizome | 7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW |
| mycelium_meridian | 2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le |
| mycelium_drp | BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU |

Upgrade authority: Squads 3-of-5 multisig. Setup script at `docs/multisig-setup.md`. Authority transfer procedure at `docs/authority-transfer.sh`.

---

## K. Full Anchor account schemas

For standards-body review, the full on-chain account structures are reproduced here. Source of truth: `programs/**/src/lib.rs`.

### K.1 Spore — IPAsset

```rust
#[account]
#[derive(InitSpace)]
pub struct IPAsset {
    pub original_creator: Pubkey,       // immutable — first-registration creator
    pub creator: Pubkey,                // current owner (mutates on transfer)
    pub content_hash: [u8; 32],         // SHA-256 of original content
    pub perceptual_hash: [u8; 32],      // pHash-256 for similarity matching
    pub ip_type: IPType,
    #[max_len(MAX_URI_LENGTH)]
    pub metadata_uri: String,           // Arweave or equivalent
    pub registration_slot: u64,         // PoH-attested slot
    pub registration_timestamp: i64,    // Unix epoch
    pub parent_ip: Option<Pubkey>,      // for derivatives
    pub status: IPStatus,               // Active, Disputed, Revoked, Suspended
    pub license_count: u32,
    pub dispute_count: u32,
    pub version: u16,
    pub nice_class: Option<u8>,         // WIPO Nice 1-45
    pub berne_category: Option<u8>,     // WIPO Berne 1-9
    pub country_of_origin: [u8; 2],     // ISO 3166-1 α2
    pub first_use_date: Option<i64>,
    pub wipo_aligned: bool,
    pub bump: u8,
}
```

### K.2 Hypha — LicenseTemplate + License

```rust
#[account]
#[derive(InitSpace)]
pub struct LicenseTemplate {
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub license_type: LicenseType,
    pub royalty_rate_bps: u16,
    pub max_sublicenses: u32,
    pub territory: Territory,
    pub duration_seconds: Option<i64>,
    pub commercial_use: bool,
    pub ai_training_allowed: bool,      // MANDATORY — machine-readable
    pub active_licenses: u32,
    pub total_issued: u32,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct License {
    pub template: Pubkey,
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub licensee: Pubkey,
    #[max_len(64)]
    pub licensee_name: String,
    #[max_len(128)]
    pub purpose: String,
    pub license_type: LicenseType,
    pub royalty_rate_bps: u16,
    pub commercial_use: bool,
    pub ai_training_allowed: bool,
    pub territory: Territory,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub status: LicenseStatus,
    pub sublicense_count: u32,
    pub max_sublicenses: u32,
    pub total_royalties_paid: u64,
    pub bump: u8,
}
```

### K.3 Rhizome — RoyaltyConfig

```rust
#[account]
#[derive(InitSpace)]
pub struct RoyaltyConfig {
    pub ip_asset: Pubkey,
    pub creator: Pubkey,
    pub platform_wallet: Pubkey,        // bound at configure — cannot change
    pub platform_fee_bps: u16,
    pub total_deposited: u64,
    pub total_distributed: u64,
    pub distribution_count: u32,
    pub is_active: bool,
    pub recipient_count: u8,
    #[max_len(8)]
    pub recipients: Vec<RoyaltyRecipient>,
    pub bump: u8,
}
```

### K.4 Meridian — EvidencePackage

```rust
#[account]
#[derive(InitSpace)]
pub struct EvidencePackage {
    pub ip_asset: Pubkey,
    pub requested_by: Pubkey,
    pub generated_at: i64,
    pub generated_slot: u64,
    pub package_hash: [u8; 32],         // SHA-256 of MEP JSON
    #[max_len(128)]
    pub arweave_uri: String,
    pub protocol_signature: [u8; 64],   // Ed25519 over package_hash
    pub license_count_snapshot: u32,
    pub total_royalties_snapshot: u64,
    pub jurisdiction: Jurisdiction,
    pub is_wipo_compliant: bool,
    pub verification_count: u32,
    pub version: u16,
    pub superseded_by: Option<Pubkey>,
    pub bump: u8,
}
```

---

## L. Reproducibility

All programs compile with Anchor 0.30.1 + Rust stable. A reviewer can reproduce the build:

```bash
git clone https://github.com/infia-group/mycelium-network
cd mycelium-network
npm install
anchor build
anchor test  # requires local validator or devnet
```

A reviewer can reproduce the devnet deployment:

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

The bytecode hash of each deployed program is recorded in Appendix J and can be independently verified by anyone with Solana CLI and the source tree. An audit report from OtterSec (scheduled Q3 2026) will be published under the same address.

---

*End of Appendix 05.*
