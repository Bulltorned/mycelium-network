use anchor_lang::prelude::*;

declare_id!("7UkHLH3qUNxAn9ixVvDckUnqVmNJazppXcDGZ57JtXe");

/// Mycelium Protocol — Spore Program
/// IP Registration & Proof of Existence on Solana
///
/// No token. No speculation. Pure infrastructure.
/// Fees denominated in SOL (rent) + USDC (protocol fee via separate program).
///
/// Core flow:
/// 1. Creator hashes content client-side (SHA-256 + perceptual hash)
/// 2. Creator uploads full content to Arweave (permanent storage)
/// 3. Creator calls register_ip → creates IPAsset PDA + emits event
/// 4. Solana's PoH provides cryptographic timestamp
/// 5. IPAsset PDA is the on-chain proof of existence
///
/// The on-chain data is minimal by design:
/// - Content hash (32 bytes) — proves WHAT was registered
/// - Perceptual hash (32 bytes) — enables similarity matching
/// - Slot + timestamp — proves WHEN (via PoH)
/// - Creator pubkey — proves WHO
/// - Arweave URI — links to the full content
/// - WIPO-compatible metadata — Nice class, Berne category, country, first use
///
/// Everything else (title, description, tags, AI provenance)
/// lives in the Arweave metadata JSON. On-chain = evidence. Off-chain = context.

#[program]
pub mod mycelium_spore {
    use super::*;

    /// Register a new IP asset on-chain.
    ///
    /// Creates an IPAsset PDA with a cryptographic proof of existence.
    /// The content_hash serves as both a unique identifier and evidence
    /// that this specific content existed at this specific Solana slot.
    pub fn register_ip(
        ctx: Context<RegisterIP>,
        content_hash: [u8; 32],
        perceptual_hash: [u8; 32],
        ip_type: IPType,
        metadata_uri: String,
        nice_class: Option<u8>,
        berne_category: Option<u8>,
        country_of_origin: [u8; 2],
        first_use_date: Option<i64>,
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= MAX_URI_LENGTH,
            MyceliumError::MetadataUriTooLong
        );
        require!(
            !metadata_uri.is_empty(),
            MyceliumError::MetadataUriEmpty
        );
        require!(
            content_hash != [0u8; 32],
            MyceliumError::InvalidContentHash
        );

        let clock = Clock::get()?;
        let ip_asset = &mut ctx.accounts.ip_asset;

        ip_asset.creator = ctx.accounts.creator.key();
        ip_asset.content_hash = content_hash;
        ip_asset.perceptual_hash = perceptual_hash;
        ip_asset.ip_type = ip_type.clone();
        ip_asset.metadata_uri = metadata_uri.clone();
        ip_asset.registration_slot = clock.slot;
        ip_asset.registration_timestamp = clock.unix_timestamp;
        ip_asset.parent_ip = None;
        ip_asset.status = IPStatus::Active;
        ip_asset.license_count = 0;
        ip_asset.dispute_count = 0;
        ip_asset.version = 1;
        ip_asset.nice_class = nice_class;
        ip_asset.berne_category = berne_category;
        ip_asset.country_of_origin = country_of_origin;
        ip_asset.first_use_date = first_use_date;
        ip_asset.wipo_aligned = nice_class.is_some() || berne_category.is_some();
        ip_asset.bump = ctx.bumps.ip_asset;

        emit!(IPRegistered {
            creator: ip_asset.creator,
            ip_asset_key: ctx.accounts.ip_asset.key(),
            content_hash,
            perceptual_hash,
            ip_type,
            metadata_uri,
            slot: ip_asset.registration_slot,
            timestamp: ip_asset.registration_timestamp,
        });

        Ok(())
    }

    /// Register a derivative work that references a parent IP asset.
    pub fn register_derivative(
        ctx: Context<RegisterDerivative>,
        content_hash: [u8; 32],
        perceptual_hash: [u8; 32],
        ip_type: IPType,
        metadata_uri: String,
        country_of_origin: [u8; 2],
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= MAX_URI_LENGTH,
            MyceliumError::MetadataUriTooLong
        );
        require!(
            content_hash != [0u8; 32],
            MyceliumError::InvalidContentHash
        );

        let parent = &ctx.accounts.parent_ip_asset;
        require!(
            parent.status == IPStatus::Active,
            MyceliumError::ParentIPNotActive
        );

        let clock = Clock::get()?;
        let ip_asset = &mut ctx.accounts.ip_asset;

        ip_asset.creator = ctx.accounts.creator.key();
        ip_asset.content_hash = content_hash;
        ip_asset.perceptual_hash = perceptual_hash;
        ip_asset.ip_type = ip_type.clone();
        ip_asset.metadata_uri = metadata_uri.clone();
        ip_asset.registration_slot = clock.slot;
        ip_asset.registration_timestamp = clock.unix_timestamp;
        ip_asset.parent_ip = Some(ctx.accounts.parent_ip_asset.key());
        ip_asset.status = IPStatus::Active;
        ip_asset.license_count = 0;
        ip_asset.dispute_count = 0;
        ip_asset.version = 1;
        ip_asset.nice_class = None;
        ip_asset.berne_category = None;
        ip_asset.country_of_origin = country_of_origin;
        ip_asset.first_use_date = None;
        ip_asset.wipo_aligned = false;
        ip_asset.bump = ctx.bumps.ip_asset;

        emit!(DerivativeRegistered {
            creator: ip_asset.creator,
            ip_asset_key: ctx.accounts.ip_asset.key(),
            parent_ip_key: ctx.accounts.parent_ip_asset.key(),
            parent_creator: parent.creator,
            content_hash,
            ip_type,
            slot: ip_asset.registration_slot,
            timestamp: ip_asset.registration_timestamp,
        });

        Ok(())
    }

    /// Update the metadata URI for an existing IP asset.
    /// Content hash is IMMUTABLE. Only metadata pointer changes.
    pub fn update_metadata(
        ctx: Context<UpdateMetadata>,
        new_metadata_uri: String,
    ) -> Result<()> {
        require!(
            new_metadata_uri.len() <= MAX_URI_LENGTH,
            MyceliumError::MetadataUriTooLong
        );
        require!(
            !new_metadata_uri.is_empty(),
            MyceliumError::MetadataUriEmpty
        );

        let ip_asset = &mut ctx.accounts.ip_asset;
        require!(
            ip_asset.creator == ctx.accounts.creator.key(),
            MyceliumError::Unauthorized
        );

        let old_uri = ip_asset.metadata_uri.clone();
        ip_asset.metadata_uri = new_metadata_uri.clone();
        ip_asset.version = ip_asset.version.checked_add(1)
            .ok_or(MyceliumError::Overflow)?;

        emit!(MetadataUpdated {
            ip_asset_key: ctx.accounts.ip_asset.key(),
            creator: ip_asset.creator,
            old_metadata_uri: old_uri,
            new_metadata_uri,
            version: ip_asset.version,
        });

        Ok(())
    }

    /// Transfer ownership of an IP asset. Both parties must sign.
    pub fn transfer_ownership(ctx: Context<TransferOwnership>) -> Result<()> {
        let ip_asset = &mut ctx.accounts.ip_asset;
        require!(
            ip_asset.status == IPStatus::Active,
            MyceliumError::IPAssetNotActive
        );

        let old_creator = ip_asset.creator;
        ip_asset.creator = ctx.accounts.new_owner.key();

        emit!(OwnershipTransferred {
            ip_asset_key: ctx.accounts.ip_asset.key(),
            from: old_creator,
            to: ctx.accounts.new_owner.key(),
            content_hash: ip_asset.content_hash,
        });

        Ok(())
    }

    /// Flag an IP asset's status (used by DRP program via CPI).
    pub fn update_status(ctx: Context<UpdateStatus>, new_status: IPStatus) -> Result<()> {
        let ip_asset = &mut ctx.accounts.ip_asset;
        let old_status = ip_asset.status.clone();

        match (&old_status, &new_status) {
            (IPStatus::Active, IPStatus::Disputed) => {},
            (IPStatus::Disputed, IPStatus::Active) => {},
            (IPStatus::Disputed, IPStatus::Suspended) => {},
            (IPStatus::Disputed, IPStatus::Revoked) => {},
            (IPStatus::Suspended, IPStatus::Active) => {},
            _ => return Err(MyceliumError::InvalidStatusTransition.into()),
        }

        ip_asset.status = new_status.clone();

        if new_status == IPStatus::Disputed {
            ip_asset.dispute_count = ip_asset.dispute_count.checked_add(1)
                .ok_or(MyceliumError::Overflow)?;
        }

        emit!(StatusUpdated {
            ip_asset_key: ctx.accounts.ip_asset.key(),
            old_status,
            new_status,
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct IPAsset {
    pub creator: Pubkey,
    pub content_hash: [u8; 32],
    pub perceptual_hash: [u8; 32],
    pub ip_type: IPType,
    #[max_len(128)]
    pub metadata_uri: String,
    pub registration_slot: u64,
    pub registration_timestamp: i64,
    pub parent_ip: Option<Pubkey>,
    pub status: IPStatus,
    pub license_count: u32,
    pub dispute_count: u32,
    pub version: u16,
    // WIPO-compatible metadata
    pub nice_class: Option<u8>,
    pub berne_category: Option<u8>,
    pub country_of_origin: [u8; 2],
    pub first_use_date: Option<i64>,
    pub wipo_aligned: bool,
    pub bump: u8,
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum IPType {
    LiteraryWork,
    VisualArt,
    Music,
    Software,
    CharacterIP,
    Meme,
    Video,
    AIGenerated,
    TraditionalKnowledge,
    Dataset,
    BrandMark,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum IPStatus {
    Active,
    Disputed,
    Suspended,
    Revoked,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32])]
pub struct RegisterIP<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + IPAsset::INIT_SPACE,
        seeds = [SEED_IP_ASSET, creator.key().as_ref(), &content_hash],
        bump
    )]
    pub ip_asset: Account<'info, IPAsset>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32])]
pub struct RegisterDerivative<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + IPAsset::INIT_SPACE,
        seeds = [SEED_IP_ASSET, creator.key().as_ref(), &content_hash],
        bump
    )]
    pub ip_asset: Account<'info, IPAsset>,
    #[account(
        constraint = parent_ip_asset.status == IPStatus::Active
            @ MyceliumError::ParentIPNotActive
    )]
    pub parent_ip_asset: Account<'info, IPAsset>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMetadata<'info> {
    #[account(
        mut,
        seeds = [SEED_IP_ASSET, ip_asset.creator.as_ref(), &ip_asset.content_hash],
        bump = ip_asset.bump,
    )]
    pub ip_asset: Account<'info, IPAsset>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(
        mut,
        constraint = ip_asset.creator == current_owner.key() @ MyceliumError::Unauthorized,
        seeds = [SEED_IP_ASSET, ip_asset.creator.as_ref(), &ip_asset.content_hash],
        bump = ip_asset.bump,
    )]
    pub ip_asset: Account<'info, IPAsset>,
    pub current_owner: Signer<'info>,
    pub new_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateStatus<'info> {
    #[account(
        mut,
        seeds = [SEED_IP_ASSET, ip_asset.creator.as_ref(), &ip_asset.content_hash],
        bump = ip_asset.bump,
    )]
    pub ip_asset: Account<'info, IPAsset>,
    pub authority: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct IPRegistered {
    pub creator: Pubkey,
    pub ip_asset_key: Pubkey,
    pub content_hash: [u8; 32],
    pub perceptual_hash: [u8; 32],
    pub ip_type: IPType,
    pub metadata_uri: String,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct DerivativeRegistered {
    pub creator: Pubkey,
    pub ip_asset_key: Pubkey,
    pub parent_ip_key: Pubkey,
    pub parent_creator: Pubkey,
    pub content_hash: [u8; 32],
    pub ip_type: IPType,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct MetadataUpdated {
    pub ip_asset_key: Pubkey,
    pub creator: Pubkey,
    pub old_metadata_uri: String,
    pub new_metadata_uri: String,
    pub version: u16,
}

#[event]
pub struct OwnershipTransferred {
    pub ip_asset_key: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub content_hash: [u8; 32],
}

#[event]
pub struct StatusUpdated {
    pub ip_asset_key: Pubkey,
    pub old_status: IPStatus,
    pub new_status: IPStatus,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum MyceliumError {
    #[msg("Metadata URI exceeds maximum length of 128 characters")]
    MetadataUriTooLong,
    #[msg("Metadata URI cannot be empty")]
    MetadataUriEmpty,
    #[msg("Content hash cannot be all zeros")]
    InvalidContentHash,
    #[msg("Parent IP asset is not in Active status")]
    ParentIPNotActive,
    #[msg("Only the creator can perform this action")]
    Unauthorized,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("IP asset is not in Active status")]
    IPAssetNotActive,
    #[msg("Arithmetic overflow")]
    Overflow,
}

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_IP_ASSET: &[u8] = b"ip_asset";
pub const MAX_URI_LENGTH: usize = 128;
