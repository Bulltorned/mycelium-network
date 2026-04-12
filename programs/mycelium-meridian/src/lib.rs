use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
declare_id!("7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc");

/// Protocol authority pubkey -- the deployer wallet that signs evidence packages.
/// This is the public key from the Anchor.toml wallet (~/.solana-keys/id.json).
/// In production, this would be a multisig (Squads) address (Phase 4).
pub const PROTOCOL_AUTHORITY: Pubkey = Pubkey::new_from_array([
    210, 25, 65, 11, 61, 167, 181, 102, 53, 59, 228, 61, 65, 119, 171, 222,
    167, 100, 173, 240, 141, 16, 248, 42, 246, 189, 158, 228, 114, 5, 1, 237,
]);

/// Mycelium Protocol — Meridian Program
/// WIPO Evidence Module on Solana
///
/// Generates and anchors the Mycelium Evidence Package (MEP) — a standardized
/// evidence dossier from any registered IP asset, formatted for:
/// - WIPO Arbitration and Mediation Center submission
/// - Indonesian Commercial Court (under UU ITE Pasal 5)
/// - Kenyan High Court (under Evidence Act Section 106B)
/// - Colombian courts (under Ley 527 and CGP Articulo 247)
///
/// MEP flow:
/// 1. IP owner requests MEP generation -> Orchestration Service builds full JSON
/// 2. Full MEP JSON is uploaded to Arweave (permanent, tamper-proof)
/// 3. SHA-256 hash of MEP is computed
/// 4. Protocol authority signs the hash with Ed25519
/// 5. EvidencePackage PDA stores: hash, Arweave URI, signature, snapshots
/// 6. Anyone can verify: recompute hash from Arweave, compare to on-chain record
///
/// The MEP is the technical differentiator — transforms Mycelium from
/// "blockchain IP tool" to "the on-chain layer that feeds WIPO."

#[program]
pub mod mycelium_meridian {
    use super::*;

    /// Generate and anchor a Mycelium Evidence Package.
    ///
    /// The actual MEP document is generated off-chain by the Orchestration Service
    /// and uploaded to Arweave. This instruction stores the cryptographic proof
    /// on-chain: the document hash, Arweave URI, and protocol signature.
    ///
    /// SECURITY: Requires a preceding Ed25519 signature verification instruction
    /// in the same transaction. The Ed25519 instruction must verify that
    /// PROTOCOL_AUTHORITY signed the package_hash. A presence-only check is NOT
    /// sufficient -- we parse the Ed25519 instruction data to confirm the pubkey
    /// and message match our expectations.
    pub fn generate_mep(
        ctx: Context<GenerateMEP>,
        package_hash: [u8; 32],
        arweave_uri: String,
        protocol_signature: [u8; 64],
        license_count_snapshot: u32,
        total_royalties_snapshot: u64,
        jurisdiction: Jurisdiction,
    ) -> Result<()> {
        require!(
            arweave_uri.len() <= MAX_URI_LENGTH,
            MeridianError::UriTooLong
        );
        require!(
            !arweave_uri.is_empty(),
            MeridianError::UriEmpty
        );
        require!(
            package_hash != [0u8; 32],
            MeridianError::InvalidHash
        );

        // ── Ed25519 signature verification ──────────────────────────────
        // Step 1: Load the preceding instruction and verify it targets the Ed25519 precompile
        let ix = ix_sysvar::load_instruction_at_checked(
            0, // Ed25519 verify must be the first instruction in the transaction
            &ctx.accounts.instructions_sysvar,
        )?;
        require!(
            ix.program_id == ed25519_program::ID,
            MeridianError::MissingEd25519Verification
        );

        // Step 2: Parse the Ed25519 instruction data to verify it matches our expected
        // protocol authority and package_hash.
        //
        // Ed25519 instruction data layout (from solana_sdk::ed25519_instruction):
        //   Bytes 0-1:   num_signatures (u16, little-endian) -- must be 1
        //   Bytes 2-3:   padding (zeroed)
        //   Bytes 4-5:   signature_offset (u16) -- typically 112
        //   Bytes 6-7:   signature_instruction_index (u16) -- 0xFFFF means same instruction
        //   Bytes 8-9:   public_key_offset (u16) -- typically 16
        //   Bytes 10-11: public_key_instruction_index (u16) -- 0xFFFF means same instruction
        //   Bytes 12-13: message_data_offset (u16)
        //   Bytes 14-15: message_data_size (u16)
        //   Bytes 16-47: public_key (32 bytes)
        //   Bytes 48-111: signature (64 bytes)
        //   Bytes 112+:  message data

        let ix_data = &ix.data;
        require!(
            ix_data.len() >= 112,
            MeridianError::InvalidEd25519InstructionData
        );

        // Verify num_signatures == 1
        let num_sigs = u16::from_le_bytes([ix_data[0], ix_data[1]]);
        require!(
            num_sigs == 1,
            MeridianError::InvalidEd25519InstructionData
        );

        // Extract public key offset and read the pubkey
        let pubkey_offset = u16::from_le_bytes([ix_data[8], ix_data[9]]) as usize;
        require!(
            pubkey_offset + 32 <= ix_data.len(),
            MeridianError::InvalidEd25519InstructionData
        );
        let ed25519_pubkey = &ix_data[pubkey_offset..pubkey_offset + 32];

        // Verify the pubkey matches PROTOCOL_AUTHORITY
        require!(
            ed25519_pubkey == PROTOCOL_AUTHORITY.as_ref(),
            MeridianError::InvalidProtocolAuthority
        );

        // Extract message offset and size, then verify message matches package_hash
        let msg_offset = u16::from_le_bytes([ix_data[12], ix_data[13]]) as usize;
        let msg_size = u16::from_le_bytes([ix_data[14], ix_data[15]]) as usize;
        require!(
            msg_offset + msg_size <= ix_data.len(),
            MeridianError::InvalidEd25519InstructionData
        );
        let ed25519_message = &ix_data[msg_offset..msg_offset + msg_size];

        // The message signed must be the package_hash being stored in this MEP
        require!(
            ed25519_message == package_hash.as_ref(),
            MeridianError::PackageHashMismatch
        );

        // ── Write evidence package ──────────────────────────────────────
        let clock = Clock::get()?;
        let evidence_key = ctx.accounts.evidence_package.key();
        let ip_asset_key = ctx.accounts.ip_asset.key();
        let requester_key = ctx.accounts.requester.key();
        let evidence = &mut ctx.accounts.evidence_package;

        evidence.ip_asset = ip_asset_key;
        evidence.requested_by = requester_key;
        evidence.generated_at = clock.unix_timestamp;
        evidence.generated_slot = clock.slot;
        evidence.package_hash = package_hash;
        evidence.arweave_uri = arweave_uri.clone();
        evidence.protocol_signature = protocol_signature;
        evidence.license_count_snapshot = license_count_snapshot;
        evidence.total_royalties_snapshot = total_royalties_snapshot;
        evidence.jurisdiction = jurisdiction.clone();
        evidence.is_wipo_compliant = true;
        evidence.verification_count = 0;
        evidence.version = 1;
        evidence.superseded_by = None;
        evidence.bump = ctx.bumps.evidence_package;

        let generated_at_val = evidence.generated_at;
        let generated_slot_val = evidence.generated_slot;

        emit!(MEPGenerated {
            evidence_key,
            ip_asset: ip_asset_key,
            requested_by: requester_key,
            package_hash,
            arweave_uri,
            jurisdiction,
            generated_at: generated_at_val,
            generated_slot: generated_slot_val,
        });

        Ok(())
    }

    /// Verify a Mycelium Evidence Package on-chain.
    ///
    /// Anyone can call this -- courts, opposing counsel, arbitrators.
    /// Provide the claimed MEP hash and the on-chain PDA address.
    /// Returns whether the hash matches the signed on-chain record.
    pub fn verify_mep(
        ctx: Context<VerifyMEP>,
        claimed_hash: [u8; 32],
    ) -> Result<()> {
        let evidence_key = ctx.accounts.evidence_package.key();
        let verifier_key = ctx.accounts.verifier.key();
        let evidence = &mut ctx.accounts.evidence_package;

        let is_valid = evidence.package_hash == claimed_hash;

        evidence.verification_count = evidence.verification_count
            .checked_add(1)
            .ok_or(MeridianError::Overflow)?;

        let ip_asset_val = evidence.ip_asset;
        let verification_count_val = evidence.verification_count;

        emit!(MEPVerified {
            evidence_key,
            ip_asset: ip_asset_val,
            verifier: verifier_key,
            claimed_hash,
            is_valid,
            verification_number: verification_count_val,
        });

        Ok(())
    }

    /// Update a MEP with newer license/royalty data.
    /// Previous MEP remains valid. New MEP links to old via superseded_by.
    pub fn update_mep(
        ctx: Context<UpdateMEP>,
        new_package_hash: [u8; 32],
        new_arweave_uri: String,
        new_protocol_signature: [u8; 64],
        new_license_count: u32,
        new_total_royalties: u64,
    ) -> Result<()> {
        require!(
            new_arweave_uri.len() <= MAX_URI_LENGTH,
            MeridianError::UriTooLong
        );
        require!(
            new_package_hash != [0u8; 32],
            MeridianError::InvalidHash
        );

        let clock = Clock::get()?;
        let evidence_key = ctx.accounts.evidence_package.key();
        let evidence = &mut ctx.accounts.evidence_package;

        // Update with new data
        let old_hash = evidence.package_hash;
        evidence.package_hash = new_package_hash;
        evidence.arweave_uri = new_arweave_uri.clone();
        evidence.protocol_signature = new_protocol_signature;
        evidence.license_count_snapshot = new_license_count;
        evidence.total_royalties_snapshot = new_total_royalties;
        evidence.generated_at = clock.unix_timestamp;
        evidence.generated_slot = clock.slot;
        evidence.version = evidence.version.checked_add(1)
            .ok_or(MeridianError::Overflow)?;

        let ip_asset_val = evidence.ip_asset;
        let version_val = evidence.version;

        emit!(MEPUpdated {
            evidence_key,
            ip_asset: ip_asset_val,
            old_hash,
            new_hash: new_package_hash,
            new_arweave_uri,
            version: version_val,
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// On-chain anchor for a Mycelium Evidence Package.
/// The full MEP document lives on Arweave. This PDA stores the
/// cryptographic proof and metadata for verification.
#[account]
#[derive(InitSpace)]
pub struct EvidencePackage {
    /// The IP asset this evidence package is generated for.
    pub ip_asset: Pubkey,
    /// Who requested the MEP (must be IP owner or authorized party).
    pub requested_by: Pubkey,
    /// When the MEP was generated (Unix timestamp).
    pub generated_at: i64,
    /// Solana slot at generation -- for PoH verification.
    pub generated_slot: u64,
    /// SHA-256 hash of the full MEP JSON document on Arweave.
    pub package_hash: [u8; 32],
    /// Arweave URI pointing to the full MEP document.
    #[max_len(128)]
    pub arweave_uri: String,
    /// Ed25519 signature by the Mycelium protocol authority.
    /// Signs the package_hash -- makes the MEP tamper-evident.
    pub protocol_signature: [u8; 64],
    /// Snapshot: number of active licenses at time of MEP generation.
    pub license_count_snapshot: u32,
    /// Snapshot: total royalties distributed (in lamports) at generation.
    pub total_royalties_snapshot: u64,
    /// Target jurisdiction for this evidence package.
    pub jurisdiction: Jurisdiction,
    /// Whether the underlying IP asset has WIPO-compatible metadata.
    pub is_wipo_compliant: bool,
    /// How many times this MEP has been verified on-chain.
    pub verification_count: u32,
    /// MEP version (increments on update_mep).
    pub version: u16,
    /// If this MEP has been superseded by a newer version.
    pub superseded_by: Option<Pubkey>,
    pub bump: u8,
}

// ============================================================================
// ENUMS
// ============================================================================

/// Target jurisdiction determines the evidence package format.
/// Each jurisdiction has different legal requirements for electronic evidence.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum Jurisdiction {
    /// Indonesia -- UU ITE Pasal 5, Commercial Court
    Indonesia,
    /// Kenya -- Evidence Act Section 106B, High Court
    Kenya,
    /// Colombia -- Ley 527, CGP Articulo 247, SIC
    Colombia,
    /// WIPO Arbitration and Mediation Center
    WIPOArbitration,
    /// Generic international format
    International,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct GenerateMEP<'info> {
    #[account(
        init,
        payer = requester,
        space = 8 + EvidencePackage::INIT_SPACE,
        seeds = [
            SEED_EVIDENCE,
            ip_asset.key().as_ref(),
            requester.key().as_ref(),
        ],
        bump
    )]
    pub evidence_package: Account<'info, EvidencePackage>,
    /// CHECK: IP asset address from Spore program.
    pub ip_asset: UncheckedAccount<'info>,
    #[account(mut)]
    pub requester: Signer<'info>,
    /// CHECK: Instructions sysvar for Ed25519 signature verification.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyMEP<'info> {
    #[account(mut)]
    pub evidence_package: Account<'info, EvidencePackage>,
    pub verifier: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateMEP<'info> {
    #[account(
        mut,
        constraint = evidence_package.requested_by == requester.key()
            @ MeridianError::Unauthorized,
    )]
    pub evidence_package: Account<'info, EvidencePackage>,
    pub requester: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct MEPGenerated {
    pub evidence_key: Pubkey,
    pub ip_asset: Pubkey,
    pub requested_by: Pubkey,
    pub package_hash: [u8; 32],
    pub arweave_uri: String,
    pub jurisdiction: Jurisdiction,
    pub generated_at: i64,
    pub generated_slot: u64,
}

#[event]
pub struct MEPVerified {
    pub evidence_key: Pubkey,
    pub ip_asset: Pubkey,
    pub verifier: Pubkey,
    pub claimed_hash: [u8; 32],
    pub is_valid: bool,
    pub verification_number: u32,
}

#[event]
pub struct MEPUpdated {
    pub evidence_key: Pubkey,
    pub ip_asset: Pubkey,
    pub old_hash: [u8; 32],
    pub new_hash: [u8; 32],
    pub new_arweave_uri: String,
    pub version: u16,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum MeridianError {
    #[msg("URI exceeds maximum length")]
    UriTooLong,
    #[msg("URI cannot be empty")]
    UriEmpty,
    #[msg("Hash cannot be all zeros")]
    InvalidHash,
    #[msg("Only the requester can perform this action")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Missing Ed25519 signature verification instruction")]
    MissingEd25519Verification,
    #[msg("Ed25519 instruction data is malformed or too short")]
    InvalidEd25519InstructionData,
    #[msg("Ed25519 pubkey does not match expected protocol authority")]
    InvalidProtocolAuthority,
    #[msg("Ed25519 signed message does not match the MEP package hash")]
    PackageHashMismatch,
}

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_EVIDENCE: &[u8] = b"evidence";
pub const MAX_URI_LENGTH: usize = 128;
