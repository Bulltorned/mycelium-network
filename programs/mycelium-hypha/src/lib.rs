use anchor_lang::prelude::*;

declare_id!("9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5");

/// Mycelium Protocol — Hypha Program
/// Programmable IP Licensing on Solana
///
/// Manages the creation, issuance, validation, and revocation of IP licenses.
/// Four standard license archetypes + custom parameters.
///
/// License flow:
/// 1. IP owner creates a LicenseTemplate (terms for their IP)
/// 2. Licensee requests a license → creates License PDA
/// 3. IP owner approves → license becomes Active
/// 4. License is validated on-chain for downstream use (royalties, evidence)
///
/// License terms are machine-readable — designed for AI agents to parse
/// and for smart contracts to enforce automatically.

#[program]
pub mod mycelium_hypha {
    use super::*;

    /// Create a license template for an IP asset.
    /// The IP owner defines the terms under which their work can be used.
    pub fn create_license_template(
        ctx: Context<CreateLicenseTemplate>,
        license_type: LicenseType,
        royalty_rate_bps: u16,
        max_sublicenses: u32,
        territory: Territory,
        duration_seconds: Option<i64>,
        commercial_use: bool,
        ai_training_allowed: bool,
    ) -> Result<()> {
        require!(
            royalty_rate_bps <= 10_000,
            HyphaError::InvalidRoyaltyRate
        );

        let clock = Clock::get()?;
        let template = &mut ctx.accounts.license_template;

        template.ip_asset = ctx.accounts.ip_asset.key();
        template.licensor = ctx.accounts.licensor.key();
        template.license_type = license_type.clone();
        template.royalty_rate_bps = royalty_rate_bps;
        template.max_sublicenses = max_sublicenses;
        template.territory = territory;
        template.duration_seconds = duration_seconds;
        template.commercial_use = commercial_use;
        template.ai_training_allowed = ai_training_allowed;
        template.active_licenses = 0;
        template.total_issued = 0;
        template.is_active = true;
        template.created_at = clock.unix_timestamp;
        template.bump = ctx.bumps.license_template;

        emit!(LicenseTemplateCreated {
            template_key: ctx.accounts.license_template.key(),
            ip_asset: template.ip_asset,
            licensor: template.licensor,
            license_type,
            royalty_rate_bps,
            commercial_use,
            ai_training_allowed,
        });

        Ok(())
    }

    /// Issue a license to a licensee under an existing template.
    /// The licensor (IP owner) must sign to approve.
    pub fn issue_license(
        ctx: Context<IssueLicense>,
        licensee_name: String,
        purpose: String,
    ) -> Result<()> {
        require!(
            licensee_name.len() <= MAX_NAME_LENGTH,
            HyphaError::NameTooLong
        );
        require!(
            purpose.len() <= MAX_PURPOSE_LENGTH,
            HyphaError::PurposeTooLong
        );

        let template = &mut ctx.accounts.license_template;
        require!(template.is_active, HyphaError::TemplateNotActive);

        let clock = Clock::get()?;
        let license = &mut ctx.accounts.license;

        let expires_at = template.duration_seconds
            .map(|d| clock.unix_timestamp.checked_add(d))
            .flatten();

        license.template = ctx.accounts.license_template.key();
        license.ip_asset = template.ip_asset;
        license.licensor = template.licensor;
        license.licensee = ctx.accounts.licensee.key();
        license.licensee_name = licensee_name;
        license.purpose = purpose;
        license.license_type = template.license_type.clone();
        license.royalty_rate_bps = template.royalty_rate_bps;
        license.commercial_use = template.commercial_use;
        license.ai_training_allowed = template.ai_training_allowed;
        license.territory = template.territory.clone();
        license.issued_at = clock.unix_timestamp;
        license.expires_at = expires_at;
        license.status = LicenseStatus::Active;
        license.sublicense_count = 0;
        license.max_sublicenses = template.max_sublicenses;
        license.total_royalties_paid = 0;
        license.bump = ctx.bumps.license;

        template.active_licenses = template.active_licenses.checked_add(1)
            .ok_or(HyphaError::Overflow)?;
        template.total_issued = template.total_issued.checked_add(1)
            .ok_or(HyphaError::Overflow)?;

        emit!(LicenseIssued {
            license_key: ctx.accounts.license.key(),
            template_key: ctx.accounts.license_template.key(),
            ip_asset: license.ip_asset,
            licensor: license.licensor,
            licensee: license.licensee,
            license_type: license.license_type.clone(),
            royalty_rate_bps: license.royalty_rate_bps,
            issued_at: license.issued_at,
            expires_at: license.expires_at,
        });

        Ok(())
    }

    /// Revoke a license. Only the licensor can revoke.
    pub fn revoke_license(ctx: Context<RevokeLicense>) -> Result<()> {
        let license = &mut ctx.accounts.license;
        require!(
            license.status == LicenseStatus::Active,
            HyphaError::LicenseNotActive
        );

        license.status = LicenseStatus::Revoked;

        let template = &mut ctx.accounts.license_template;
        template.active_licenses = template.active_licenses.saturating_sub(1);

        emit!(LicenseRevoked {
            license_key: ctx.accounts.license.key(),
            ip_asset: license.ip_asset,
            licensor: license.licensor,
            licensee: license.licensee,
        });

        Ok(())
    }

    /// Deactivate a license template. No new licenses can be issued.
    pub fn deactivate_template(ctx: Context<DeactivateTemplate>) -> Result<()> {
        let template = &mut ctx.accounts.license_template;
        template.is_active = false;

        emit!(TemplateDeactivated {
            template_key: ctx.accounts.license_template.key(),
            ip_asset: template.ip_asset,
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Defines the terms under which an IP asset can be licensed.
/// One template per IP asset per license type configuration.
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
    pub ai_training_allowed: bool,
    pub active_licenses: u32,
    pub total_issued: u32,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

/// An issued license linking a licensee to an IP asset under specific terms.
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

// ============================================================================
// ENUMS
// ============================================================================

/// Four standard license archetypes.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum LicenseType {
    /// Free to use, attribution required, non-commercial.
    CreativeCommons,
    /// Commercial use allowed, royalties required.
    Commercial,
    /// Exclusive rights in a territory. One licensee only.
    Exclusive,
    /// AI model training use. Specific terms for data ingestion.
    AITraining,
}

/// Territory scope for license.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum Territory {
    /// Worldwide rights.
    Global,
    /// Single country (ISO 3166-1 alpha-2).
    Country { code: [u8; 2] },
    /// ASEAN region.
    ASEAN,
    /// Custom territory defined in metadata.
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum LicenseStatus {
    Active,
    Expired,
    Revoked,
    Suspended,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct CreateLicenseTemplate<'info> {
    #[account(
        init,
        payer = licensor,
        space = 8 + LicenseTemplate::INIT_SPACE,
        seeds = [
            SEED_LICENSE_TEMPLATE,
            ip_asset.key().as_ref(),
            licensor.key().as_ref(),
        ],
        bump
    )]
    pub license_template: Account<'info, LicenseTemplate>,
    /// CHECK: Validated as an IPAsset from the Spore program.
    /// In production, use CPI to verify. For PoC, we trust the address.
    pub ip_asset: UncheckedAccount<'info>,
    #[account(mut)]
    pub licensor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IssueLicense<'info> {
    #[account(
        init,
        payer = licensor,
        space = 8 + License::INIT_SPACE,
        seeds = [
            SEED_LICENSE,
            license_template.key().as_ref(),
            licensee.key().as_ref(),
        ],
        bump
    )]
    pub license: Account<'info, License>,
    #[account(
        mut,
        constraint = license_template.licensor == licensor.key()
            @ HyphaError::Unauthorized,
        constraint = license_template.is_active
            @ HyphaError::TemplateNotActive,
    )]
    pub license_template: Account<'info, LicenseTemplate>,
    /// CHECK: The licensee receiving the license. Does not need to sign —
    /// the licensor is granting access.
    pub licensee: UncheckedAccount<'info>,
    #[account(mut)]
    pub licensor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeLicense<'info> {
    #[account(
        mut,
        constraint = license.licensor == licensor.key() @ HyphaError::Unauthorized,
    )]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub license_template: Account<'info, LicenseTemplate>,
    pub licensor: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateTemplate<'info> {
    #[account(
        mut,
        constraint = license_template.licensor == licensor.key()
            @ HyphaError::Unauthorized,
    )]
    pub license_template: Account<'info, LicenseTemplate>,
    pub licensor: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct LicenseTemplateCreated {
    pub template_key: Pubkey,
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub license_type: LicenseType,
    pub royalty_rate_bps: u16,
    pub commercial_use: bool,
    pub ai_training_allowed: bool,
}

#[event]
pub struct LicenseIssued {
    pub license_key: Pubkey,
    pub template_key: Pubkey,
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub licensee: Pubkey,
    pub license_type: LicenseType,
    pub royalty_rate_bps: u16,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
}

#[event]
pub struct LicenseRevoked {
    pub license_key: Pubkey,
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub licensee: Pubkey,
}

#[event]
pub struct TemplateDeactivated {
    pub template_key: Pubkey,
    pub ip_asset: Pubkey,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum HyphaError {
    #[msg("Royalty rate must be between 0 and 10000 basis points")]
    InvalidRoyaltyRate,
    #[msg("License template is not active")]
    TemplateNotActive,
    #[msg("License is not in Active status")]
    LicenseNotActive,
    #[msg("Only the licensor can perform this action")]
    Unauthorized,
    #[msg("Name exceeds maximum length")]
    NameTooLong,
    #[msg("Purpose exceeds maximum length")]
    PurposeTooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
}

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_LICENSE_TEMPLATE: &[u8] = b"license_template";
pub const SEED_LICENSE: &[u8] = b"license";
pub const MAX_NAME_LENGTH: usize = 64;
pub const MAX_PURPOSE_LENGTH: usize = 128;
