use anchor_lang::prelude::*;

// Devnet: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS (Anchor default placeholder)
// Mainnet: BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU
// Note: Anchor replaces declare_id at build time based on Anchor.toml cluster setting.
// This value is used for devnet builds; mainnet builds use [programs.mainnet-beta].
declare_id!("BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU");

/// Mycelium Protocol -- Dispute Resolution Protocol (DRP)
///
/// On-chain dispute filing and resolution for IP assets registered via Spore.
/// Completes the IP protection triangle: evidence (Meridian) + similarity + disputes (DRP).
///
/// Flow:
/// 1. Anyone can file a dispute against an IP asset -> creates Dispute PDA
/// 2. Protocol authority initializes ArbiterConfig with whitelisted arbiters
/// 3. Whitelisted arbiter resolves dispute -> triggers CPI to Spore update_status
/// 4. IP status changes based on resolution (Suspended, Active, Disputed)
///
/// The DRP program reads IP asset data via raw AccountInfo deserialization
/// (cross-program, no Spore dependency). Arbiter management uses a PDA whitelist.

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_DISPUTE: &[u8] = b"dispute";
pub const SEED_DRP_AUTHORITY: &[u8] = b"drp_authority";
pub const SEED_ARBITER_CONFIG: &[u8] = b"arbiter_config";
pub const DISPUTE_DEADLINE_SLOTS: u64 = 216_000; // ~24 hours at 400ms/slot
pub const MAX_EVIDENCE_HASHES: usize = 8;
pub const MAX_ARBITERS: usize = 10;

/// Spore program ID -- used to validate ip_asset account ownership.
/// Mainnet: GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR
/// Devnet:  AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz
///
/// This constant must match the Spore program's deployed address on the target network.
/// For mainnet deployment, this uses the mainnet Spore program ID.
/// Note: Anchor replaces declare_id at build time, but cross-program references
/// like this constant must be updated manually when switching networks.
pub const SPORE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    // GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR (mainnet)
    228, 216, 207, 162,  28,  40,  12, 175,
    193,  57, 254, 120, 214,   1,  83, 230,
     74,  86, 226,  49, 228,  12,  23,  85,
     70, 213, 118, 130, 225, 170,  19,  46,
]);

// ============================================================================
// PROGRAM
// ============================================================================

#[program]
pub mod mycelium_drp {
    use super::*;

    /// Initialize the arbiter configuration PDA.
    /// Only callable once. Authority = signer (protocol deployer).
    pub fn initialize_arbiter_config(ctx: Context<InitArbiterConfig>) -> Result<()> {
        let config = &mut ctx.accounts.arbiter_config;
        config.authority = ctx.accounts.authority.key();
        config.arbiters = Vec::new();
        config.bump = ctx.bumps.arbiter_config;

        msg!("ArbiterConfig initialized. Authority: {}", config.authority);
        Ok(())
    }

    /// Add a pubkey to the arbiter whitelist.
    /// Requires authority == config.authority.
    pub fn add_arbiter(ctx: Context<ManageArbiter>, arbiter: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.arbiter_config;
        require!(
            config.arbiters.len() < MAX_ARBITERS,
            DrpError::ArbiterListFull
        );
        // Prevent duplicates
        require!(
            !config.arbiters.contains(&arbiter),
            DrpError::ArbiterListFull
        );
        config.arbiters.push(arbiter);

        msg!("Arbiter added: {}. Total: {}", arbiter, config.arbiters.len());
        Ok(())
    }

    /// Remove a pubkey from the arbiter whitelist.
    /// Requires authority == config.authority.
    pub fn remove_arbiter(ctx: Context<ManageArbiter>, arbiter: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.arbiter_config;
        let idx = config.arbiters.iter().position(|a| *a == arbiter);
        match idx {
            Some(i) => {
                config.arbiters.remove(i);
                msg!("Arbiter removed: {}. Remaining: {}", arbiter, config.arbiters.len());
            }
            None => {
                msg!("Arbiter not found: {}", arbiter);
            }
        }
        Ok(())
    }

    /// File a dispute against an IP asset.
    ///
    /// Creates a Dispute PDA seeded by [ip_asset, claimant].
    /// The respondent (IP asset creator) is read from raw AccountInfo bytes
    /// at offset 40..72 (8-byte discriminator + 32-byte original_creator + 32-byte creator).
    /// The ip_asset account must be owned by the Spore program.
    pub fn file_dispute(
        ctx: Context<FileDispute>,
        evidence_hashes: Vec<[u8; 32]>,
        similarity_score: u16,
        match_type: MatchType,
    ) -> Result<()> {
        // Validate input
        require!(
            evidence_hashes.len() <= MAX_EVIDENCE_HASHES,
            DrpError::TooManyEvidenceHashes
        );
        require!(
            similarity_score <= 10_000,
            DrpError::InvalidSimilarityScore
        );

        // Read respondent (ip_asset.creator) from raw AccountInfo data.
        // IPAsset layout: 8 (discriminator) + 32 (original_creator) + 32 (creator)
        // Creator starts at byte offset 40
        let ip_asset_data = ctx.accounts.ip_asset.try_borrow_data()?;
        require!(ip_asset_data.len() >= 72, DrpError::InvalidIPAsset);
        let creator_bytes: [u8; 32] = ip_asset_data[40..72]
            .try_into()
            .map_err(|_| DrpError::InvalidIPAsset)?;
        let respondent = Pubkey::new_from_array(creator_bytes);
        // Drop the borrow before writing to dispute account
        drop(ip_asset_data);

        let clock = Clock::get()?;
        let filed_slot = clock.slot;
        let deadline_slot = filed_slot
            .checked_add(DISPUTE_DEADLINE_SLOTS)
            .ok_or(DrpError::InvalidSimilarityScore)?; // overflow guard

        let dispute = &mut ctx.accounts.dispute;
        dispute.claimant = ctx.accounts.claimant.key();
        dispute.respondent = respondent;
        dispute.ip_asset = ctx.accounts.ip_asset.key();
        dispute.stage = DisputeStage::DirectResolution;
        dispute.evidence_hashes = evidence_hashes.clone();
        dispute.similarity_score = similarity_score;
        dispute.match_type = match_type.clone();
        dispute.arbiter = None;
        dispute.resolution = None;
        dispute.filed_slot = filed_slot;
        dispute.deadline_slot = deadline_slot;
        dispute.resolved_slot = None;
        dispute.bump = ctx.bumps.dispute;

        let dispute_key = ctx.accounts.dispute.key();
        let ip_asset_key = ctx.accounts.ip_asset.key();
        let claimant_key = ctx.accounts.claimant.key();

        emit!(DisputeFiled {
            dispute_key,
            claimant: claimant_key,
            respondent,
            ip_asset: ip_asset_key,
            similarity_score,
            match_type,
            filed_slot,
        });

        Ok(())
    }

    /// Resolve a dispute. Only whitelisted arbiters can call this.
    ///
    /// Based on the resolution:
    /// - InFavorOfClaimant -> CPI to Spore: IP status = Suspended
    /// - InFavorOfRespondent -> CPI to Spore: IP status = Active (no change needed)
    /// - PartiallyUpheld -> CPI to Spore: IP status = Disputed
    ///
    /// CPI is signed by the DRP authority PDA.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, resolution: Resolution) -> Result<()> {
        // Verify arbiter is whitelisted
        require!(
            ctx.accounts.arbiter_config.arbiters.contains(&ctx.accounts.arbiter.key()),
            DrpError::UnauthorizedArbiter
        );

        // Verify dispute is not already resolved
        let dispute = &mut ctx.accounts.dispute;
        require!(dispute.resolution.is_none(), DrpError::AlreadyResolved);

        let clock = Clock::get()?;
        let resolved_slot = clock.slot;

        dispute.resolution = Some(resolution.clone());
        dispute.arbiter = Some(ctx.accounts.arbiter.key());
        dispute.resolved_slot = Some(resolved_slot);
        dispute.stage = DisputeStage::Resolved;

        // Determine new IP status based on resolution
        // InFavorOfClaimant -> Suspended (0x02)
        // InFavorOfRespondent -> Active (0x00) -- no CPI needed
        // PartiallyUpheld -> Disputed (0x01)
        let needs_cpi = match resolution {
            Resolution::InFavorOfRespondent => false,
            _ => true,
        };

        if needs_cpi {
            let new_status: u8 = match resolution {
                Resolution::InFavorOfClaimant => 2,   // IPStatus::Suspended
                Resolution::PartiallyUpheld => 1,     // IPStatus::Disputed
                Resolution::InFavorOfRespondent => 0,  // unreachable but exhaustive
            };

            // Derive DRP authority PDA seeds for CPI signing
            let authority_bump = ctx.bumps.drp_authority;
            let authority_seeds: &[&[u8]] = &[SEED_DRP_AUTHORITY, &[authority_bump]];

            // Build CPI to Spore update_status
            // We use invoke_signed with raw instruction since we avoid adding
            // mycelium-spore as a Rust dependency (keeps programs decoupled).
            let ip_asset_info = ctx.accounts.ip_asset.to_account_info();
            let drp_authority_info = ctx.accounts.drp_authority.to_account_info();
            let spore_program_info = ctx.accounts.spore_program.to_account_info();

            // Anchor discriminator for update_status = first 8 bytes of SHA256("global:update_status")
            // Precomputed: [109, 175, 108, 45, 15, 43, 134, 90]
            let discriminator: [u8; 8] = [109, 175, 108, 45, 15, 43, 134, 90];

            // Instruction data = discriminator (8 bytes) + new_status as Anchor enum (1 byte index)
            let mut ix_data = Vec::with_capacity(9);
            ix_data.extend_from_slice(&discriminator);
            ix_data.push(new_status);

            let ix = anchor_lang::solana_program::instruction::Instruction {
                program_id: spore_program_info.key(),
                accounts: vec![
                    anchor_lang::solana_program::instruction::AccountMeta::new(
                        ip_asset_info.key(),
                        false,
                    ),
                    anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                        drp_authority_info.key(),
                        true, // signer via PDA
                    ),
                ],
                data: ix_data,
            };

            anchor_lang::solana_program::program::invoke_signed(
                &ix,
                &[ip_asset_info, drp_authority_info, spore_program_info],
                &[authority_seeds],
            )?;

            msg!(
                "CPI to Spore update_status: new_status={}",
                new_status
            );
        }

        let dispute_key = ctx.accounts.dispute.key();
        let ip_asset_key = ctx.accounts.ip_asset.key();
        let arbiter_key = ctx.accounts.arbiter.key();

        emit!(DisputeResolved {
            dispute_key,
            arbiter: arbiter_key,
            resolution,
            ip_asset: ip_asset_key,
            resolved_slot,
        });

        Ok(())
    }
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum DisputeStage {
    DirectResolution,
    CommunityMediation,
    ArbitrationPanel,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum MatchType {
    Exact,
    NearDuplicate,
    Derivative,
    Semantic,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum Resolution {
    InFavorOfClaimant,
    InFavorOfRespondent,
    PartiallyUpheld,
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub claimant: Pubkey,
    pub respondent: Pubkey,      // ip_asset.creator at time of filing
    pub ip_asset: Pubkey,
    pub stage: DisputeStage,
    #[max_len(MAX_EVIDENCE_HASHES)]
    pub evidence_hashes: Vec<[u8; 32]>,
    pub similarity_score: u16,    // basis points 0-10000
    pub match_type: MatchType,
    pub arbiter: Option<Pubkey>,
    pub resolution: Option<Resolution>,
    pub filed_slot: u64,
    pub deadline_slot: u64,
    pub resolved_slot: Option<u64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ArbiterConfig {
    pub authority: Pubkey,        // Who can add/remove arbiters (protocol authority)
    #[max_len(MAX_ARBITERS)]
    pub arbiters: Vec<Pubkey>,
    pub bump: u8,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct FileDispute<'info> {
    #[account(
        init,
        payer = claimant,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [SEED_DISPUTE, ip_asset.key().as_ref(), claimant.key().as_ref()],
        bump,
    )]
    pub dispute: Account<'info, Dispute>,
    /// CHECK: IP asset account from Spore program. Validated by reading data at known offsets
    /// (discriminator + original_creator + creator). Owner must be the Spore program.
    #[account(
        constraint = ip_asset.owner == &SPORE_PROGRAM_ID @ DrpError::InvalidIPAsset
    )]
    pub ip_asset: UncheckedAccount<'info>,
    #[account(mut)]
    pub claimant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub dispute: Account<'info, Dispute>,
    pub arbiter: Signer<'info>,
    #[account(
        seeds = [SEED_ARBITER_CONFIG],
        bump = arbiter_config.bump,
    )]
    pub arbiter_config: Account<'info, ArbiterConfig>,
    /// CHECK: IP asset for CPI to Spore
    #[account(mut)]
    pub ip_asset: UncheckedAccount<'info>,
    /// CHECK: DRP authority PDA -- signs CPI to Spore
    #[account(
        seeds = [SEED_DRP_AUTHORITY],
        bump,
    )]
    pub drp_authority: UncheckedAccount<'info>,
    /// CHECK: Spore program for CPI
    pub spore_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitArbiterConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ArbiterConfig::INIT_SPACE,
        seeds = [SEED_ARBITER_CONFIG],
        bump,
    )]
    pub arbiter_config: Account<'info, ArbiterConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageArbiter<'info> {
    #[account(
        mut,
        seeds = [SEED_ARBITER_CONFIG],
        bump = arbiter_config.bump,
        constraint = arbiter_config.authority == authority.key() @ DrpError::Unauthorized,
    )]
    pub arbiter_config: Account<'info, ArbiterConfig>,
    pub authority: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct DisputeFiled {
    pub dispute_key: Pubkey,
    pub claimant: Pubkey,
    pub respondent: Pubkey,
    pub ip_asset: Pubkey,
    pub similarity_score: u16,
    pub match_type: MatchType,
    pub filed_slot: u64,
}

#[event]
pub struct DisputeResolved {
    pub dispute_key: Pubkey,
    pub arbiter: Pubkey,
    pub resolution: Resolution,
    pub ip_asset: Pubkey,
    pub resolved_slot: u64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum DrpError {
    #[msg("Arbiter not whitelisted")]
    UnauthorizedArbiter,
    #[msg("Dispute already resolved")]
    AlreadyResolved,
    #[msg("Too many evidence hashes")]
    TooManyEvidenceHashes,
    #[msg("Invalid similarity score")]
    InvalidSimilarityScore,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arbiter list full")]
    ArbiterListFull,
    #[msg("Invalid IP asset account data")]
    InvalidIPAsset,
}
