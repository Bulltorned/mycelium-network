use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5");

/// Protocol treasury wallet — receives the protocol-fee share of every
/// `acquire_license` payment. Bound at program level to prevent attacker-
/// supplied treasury accounts from draining fees.
///
/// Devnet authority keypair: PublicKey(d2194100b3da7b566353be43d4177abde...)
/// Matches Meridian's PROTOCOL_AUTHORITY and the multisig target at mainnet.
pub const PROTOCOL_TREASURY: Pubkey = Pubkey::new_from_array([
    210, 25, 65, 11, 61, 167, 181, 102, 53, 59, 228, 61, 65, 119, 171, 222,
    167, 100, 173, 240, 141, 16, 248, 42, 246, 189, 158, 228, 114, 5, 1, 237,
]);

/// Basis points the protocol treasury takes from every acquire_license payment.
/// 50 bps = 0.5% — matches the Jakarta Protocol §9.4 revenue model.
pub const PROTOCOL_FEE_BPS: u16 = 50;

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
        let template_key = ctx.accounts.license_template.key();
        let ip_asset_key = ctx.accounts.ip_asset.key();
        let licensor_key = ctx.accounts.licensor.key();

        let template = &mut ctx.accounts.license_template;
        template.ip_asset = ip_asset_key;
        template.licensor = licensor_key;
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
            template_key,
            ip_asset: ip_asset_key,
            licensor: licensor_key,
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

        // Capture keys before mutable borrows
        let license_key = ctx.accounts.license.key();
        let template_key = ctx.accounts.license_template.key();

        let template = &mut ctx.accounts.license_template;
        require!(template.is_active, HyphaError::TemplateNotActive);

        let clock = Clock::get()?;

        let expires_at = template.duration_seconds
            .map(|d| clock.unix_timestamp.checked_add(d))
            .flatten();

        // Cache template values before mutating
        let ip_asset = template.ip_asset;
        let licensor = template.licensor;
        let license_type = template.license_type.clone();
        let royalty_rate_bps = template.royalty_rate_bps;
        let commercial_use = template.commercial_use;
        let ai_training_allowed = template.ai_training_allowed;
        let territory = template.territory.clone();
        let max_sublicenses = template.max_sublicenses;

        template.active_licenses = template.active_licenses.checked_add(1)
            .ok_or(HyphaError::Overflow)?;
        template.total_issued = template.total_issued.checked_add(1)
            .ok_or(HyphaError::Overflow)?;

        let license = &mut ctx.accounts.license;
        license.template = template_key;
        license.ip_asset = ip_asset;
        license.licensor = licensor;
        license.licensee = ctx.accounts.licensee.key();
        license.licensee_name = licensee_name;
        license.purpose = purpose;
        license.license_type = license_type.clone();
        license.royalty_rate_bps = royalty_rate_bps;
        license.commercial_use = commercial_use;
        license.ai_training_allowed = ai_training_allowed;
        license.territory = territory;
        license.issued_at = clock.unix_timestamp;
        license.expires_at = expires_at;
        license.status = LicenseStatus::Active;
        license.sublicense_count = 0;
        license.max_sublicenses = max_sublicenses;
        license.total_royalties_paid = 0;
        license.bump = ctx.bumps.license;

        emit!(LicenseIssued {
            license_key,
            template_key,
            ip_asset,
            licensor,
            licensee: license.licensee,
            license_type,
            royalty_rate_bps,
            issued_at: license.issued_at,
            expires_at: license.expires_at,
        });

        Ok(())
    }

    /// Revoke a license. Only the licensor can revoke.
    pub fn revoke_license(ctx: Context<RevokeLicense>) -> Result<()> {
        let license_key = ctx.accounts.license.key();

        let license = &mut ctx.accounts.license;
        require!(
            license.status == LicenseStatus::Active,
            HyphaError::LicenseNotActive
        );

        license.status = LicenseStatus::Revoked;
        let ip_asset = license.ip_asset;
        let licensor = license.licensor;
        let licensee = license.licensee;

        let template = &mut ctx.accounts.license_template;
        template.active_licenses = template.active_licenses.saturating_sub(1);

        emit!(LicenseRevoked {
            license_key,
            ip_asset,
            licensor,
            licensee,
        });

        Ok(())
    }

    /// Set the acquisition price for an existing license template.
    /// Creates a PriceConfig PDA bound to the template. Price is in USDC lamports
    /// (6 decimals: 1_000_000 = $1.00). Setting price > 0 enables licensee-initiated
    /// acquire_license; price = 0 means free (CreativeCommons-style).
    ///
    /// The PriceConfig also declares the licensor's payment receiving token account
    /// and the licensor's optional royalty Rhizome config (for downstream royalty
    /// splits). Both are bound at set_price time — attacker-supplied accounts at
    /// acquire time fail the constraint check.
    pub fn set_price(
        ctx: Context<SetPrice>,
        price_usdc: u64,
    ) -> Result<()> {
        let template_key = ctx.accounts.license_template.key();
        let template = &ctx.accounts.license_template;
        require!(template.is_active, HyphaError::TemplateNotActive);

        let price_config = &mut ctx.accounts.price_config;
        price_config.license_template = template_key;
        price_config.licensor = template.licensor;
        price_config.licensor_payment_account = ctx.accounts.licensor_payment_account.key();
        price_config.usdc_mint = ctx.accounts.usdc_mint.key();
        price_config.price_usdc = price_usdc;
        price_config.protocol_fee_bps = PROTOCOL_FEE_BPS;
        price_config.is_active = true;
        price_config.bump = ctx.bumps.price_config;

        emit!(PriceSet {
            template_key,
            price_usdc,
            protocol_fee_bps: PROTOCOL_FEE_BPS,
        });

        Ok(())
    }

    /// Licensee-initiated acquire. The licensee pays `price_usdc` in a single
    /// atomic transaction that:
    ///   1. Transfers (price - protocol_fee) USDC → licensor_payment_account
    ///   2. Transfers protocol_fee USDC → protocol_treasury_account
    ///   3. Creates the License PDA with status=Active
    ///   4. Increments template.active_licenses and template.total_issued
    ///
    /// This is the Jakarta Protocol §6 programmable commerce primitive. A licensee
    /// agent (human or AI) with a funded USDC account can self-serve acquire a
    /// license without manual licensor action. License terms are inherited from
    /// the template at acquisition time and are immutable on the License PDA.
    ///
    /// Security invariants:
    ///   - usdc_mint constrained to match price_config.usdc_mint
    ///   - licensor_payment_account constrained to match price_config.licensor_payment_account
    ///   - protocol_treasury_account constrained to the PROTOCOL_TREASURY constant
    ///   - price_config.is_active must be true (licensor can disable via set_price with is_active=false)
    pub fn acquire_license(
        ctx: Context<AcquireLicense>,
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

        let price_config = &ctx.accounts.price_config;
        require!(price_config.is_active, HyphaError::PriceConfigNotActive);

        let template = &ctx.accounts.license_template;
        require!(template.is_active, HyphaError::TemplateNotActive);

        // Calculate splits
        let price = price_config.price_usdc;
        let fee_bps = price_config.protocol_fee_bps as u128;
        let protocol_fee: u64 = ((price as u128)
            .checked_mul(fee_bps)
            .ok_or(HyphaError::Overflow)?
            .checked_div(10_000)
            .ok_or(HyphaError::Overflow)?) as u64;
        let licensor_amount = price.checked_sub(protocol_fee)
            .ok_or(HyphaError::Overflow)?;

        // Transfer to licensor (net of fee)
        if licensor_amount > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.licensee_payment_account.to_account_info(),
                        to: ctx.accounts.licensor_payment_account.to_account_info(),
                        authority: ctx.accounts.licensee.to_account_info(),
                    },
                ),
                licensor_amount,
            )?;
        }

        // Transfer protocol fee to treasury
        if protocol_fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.licensee_payment_account.to_account_info(),
                        to: ctx.accounts.protocol_treasury_account.to_account_info(),
                        authority: ctx.accounts.licensee.to_account_info(),
                    },
                ),
                protocol_fee,
            )?;
        }

        // Create License PDA
        let clock = Clock::get()?;
        let license_key = ctx.accounts.license.key();
        let template_key = ctx.accounts.license_template.key();

        let ip_asset = template.ip_asset;
        let licensor = template.licensor;
        let license_type = template.license_type.clone();
        let royalty_rate_bps = template.royalty_rate_bps;
        let commercial_use = template.commercial_use;
        let ai_training_allowed = template.ai_training_allowed;
        let territory = template.territory.clone();
        let max_sublicenses = template.max_sublicenses;
        let expires_at = template.duration_seconds
            .map(|d| clock.unix_timestamp.checked_add(d))
            .flatten();

        // Update template counters
        let template_mut = &mut ctx.accounts.license_template;
        template_mut.active_licenses = template_mut.active_licenses.checked_add(1)
            .ok_or(HyphaError::Overflow)?;
        template_mut.total_issued = template_mut.total_issued.checked_add(1)
            .ok_or(HyphaError::Overflow)?;

        let license = &mut ctx.accounts.license;
        license.template = template_key;
        license.ip_asset = ip_asset;
        license.licensor = licensor;
        license.licensee = ctx.accounts.licensee.key();
        license.licensee_name = licensee_name;
        license.purpose = purpose;
        license.license_type = license_type.clone();
        license.royalty_rate_bps = royalty_rate_bps;
        license.commercial_use = commercial_use;
        license.ai_training_allowed = ai_training_allowed;
        license.territory = territory;
        license.issued_at = clock.unix_timestamp;
        license.expires_at = expires_at;
        license.status = LicenseStatus::Active;
        license.sublicense_count = 0;
        license.max_sublicenses = max_sublicenses;
        license.total_royalties_paid = licensor_amount;
        license.bump = ctx.bumps.license;

        emit!(LicenseAcquired {
            license_key,
            template_key,
            ip_asset,
            licensor,
            licensee: license.licensee,
            license_type,
            royalty_rate_bps,
            price_paid: price,
            licensor_received: licensor_amount,
            protocol_fee,
            issued_at: license.issued_at,
            expires_at: license.expires_at,
        });

        Ok(())
    }

    /// Check whether a wallet holds a valid license for an IP asset under a
    /// specific template. This is a read-only helper designed for AI agents
    /// and platform connectors — no state mutation, no fees. Emits the result
    /// as an event for indexer consumption.
    pub fn verify_license(ctx: Context<VerifyLicense>) -> Result<()> {
        let license = &ctx.accounts.license;
        let clock = Clock::get()?;

        let is_active = license.status == LicenseStatus::Active;
        let is_unexpired = license.expires_at
            .map(|e| clock.unix_timestamp < e)
            .unwrap_or(true);
        let is_valid = is_active && is_unexpired;

        emit!(LicenseVerified {
            license_key: ctx.accounts.license.key(),
            ip_asset: license.ip_asset,
            licensee: license.licensee,
            is_valid,
            checked_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Deactivate a license template. No new licenses can be issued.
    pub fn deactivate_template(ctx: Context<DeactivateTemplate>) -> Result<()> {
        let template_key = ctx.accounts.license_template.key();

        let template = &mut ctx.accounts.license_template;
        template.is_active = false;
        let ip_asset = template.ip_asset;

        emit!(TemplateDeactivated {
            template_key,
            ip_asset,
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

/// Acquisition pricing for a license template. Set by the licensor via
/// set_price. Enables licensee-initiated acquire_license (programmable commerce).
/// Bound fields prevent attacker-supplied payment routing.
#[account]
#[derive(InitSpace)]
pub struct PriceConfig {
    pub license_template: Pubkey,
    pub licensor: Pubkey,
    /// Licensor's USDC token account — receives (price - protocol_fee) at acquire.
    pub licensor_payment_account: Pubkey,
    /// USDC mint — constrained at acquire to prevent spoof-token attacks.
    pub usdc_mint: Pubkey,
    /// Price in USDC base units (6 decimals: 1_000_000 = $1.00). Zero = free.
    pub price_usdc: u64,
    /// Protocol fee in bps. Copied from PROTOCOL_FEE_BPS at set_price.
    pub protocol_fee_bps: u16,
    pub is_active: bool,
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
    /// CHECK: Validated by owner constraint -- must be owned by the Spore program.
    /// This ensures the account is a real IPAsset PDA, not an arbitrary account.
    #[account(owner = mycelium_spore::ID)]
    pub ip_asset: AccountInfo<'info>,
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
pub struct SetPrice<'info> {
    #[account(
        init_if_needed,
        payer = licensor,
        space = 8 + PriceConfig::INIT_SPACE,
        seeds = [
            SEED_PRICE_CONFIG,
            license_template.key().as_ref(),
        ],
        bump
    )]
    pub price_config: Account<'info, PriceConfig>,
    #[account(
        constraint = license_template.licensor == licensor.key()
            @ HyphaError::Unauthorized,
    )]
    pub license_template: Account<'info, LicenseTemplate>,
    /// USDC mint the licensor wants to be paid in.
    pub usdc_mint: Account<'info, Mint>,
    /// Licensor's receiving token account for this mint.
    #[account(
        constraint = licensor_payment_account.mint == usdc_mint.key()
            @ HyphaError::MintMismatch,
        constraint = licensor_payment_account.owner == licensor.key()
            @ HyphaError::PaymentAccountOwnerMismatch,
    )]
    pub licensor_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub licensor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcquireLicense<'info> {
    #[account(
        init,
        payer = licensee,
        space = 8 + License::INIT_SPACE,
        seeds = [
            SEED_LICENSE,
            license_template.key().as_ref(),
            licensee.key().as_ref(),
        ],
        bump
    )]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub license_template: Account<'info, LicenseTemplate>,
    #[account(
        seeds = [SEED_PRICE_CONFIG, license_template.key().as_ref()],
        bump = price_config.bump,
        constraint = price_config.license_template == license_template.key()
            @ HyphaError::PriceConfigMismatch,
        constraint = price_config.is_active
            @ HyphaError::PriceConfigNotActive,
    )]
    pub price_config: Account<'info, PriceConfig>,
    /// USDC mint — must match the mint bound in price_config.
    #[account(
        constraint = usdc_mint.key() == price_config.usdc_mint
            @ HyphaError::MintMismatch,
    )]
    pub usdc_mint: Account<'info, Mint>,
    /// Licensee's funded USDC account.
    #[account(
        mut,
        constraint = licensee_payment_account.mint == usdc_mint.key()
            @ HyphaError::MintMismatch,
        constraint = licensee_payment_account.owner == licensee.key()
            @ HyphaError::PaymentAccountOwnerMismatch,
    )]
    pub licensee_payment_account: Account<'info, TokenAccount>,
    /// Licensor's receiving USDC account — must match price_config binding.
    #[account(
        mut,
        constraint = licensor_payment_account.key() == price_config.licensor_payment_account
            @ HyphaError::PaymentAccountMismatch,
        constraint = licensor_payment_account.mint == usdc_mint.key()
            @ HyphaError::MintMismatch,
    )]
    pub licensor_payment_account: Account<'info, TokenAccount>,
    /// Protocol treasury USDC account. The OWNER of this token account MUST be
    /// PROTOCOL_TREASURY — prevents attacker-supplied treasury from stealing fees.
    #[account(
        mut,
        constraint = protocol_treasury_account.mint == usdc_mint.key()
            @ HyphaError::MintMismatch,
        constraint = protocol_treasury_account.owner == PROTOCOL_TREASURY
            @ HyphaError::UnauthorizedTreasury,
    )]
    pub protocol_treasury_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub licensee: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyLicense<'info> {
    pub license: Account<'info, License>,
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
pub struct PriceSet {
    pub template_key: Pubkey,
    pub price_usdc: u64,
    pub protocol_fee_bps: u16,
}

#[event]
pub struct LicenseAcquired {
    pub license_key: Pubkey,
    pub template_key: Pubkey,
    pub ip_asset: Pubkey,
    pub licensor: Pubkey,
    pub licensee: Pubkey,
    pub license_type: LicenseType,
    pub royalty_rate_bps: u16,
    pub price_paid: u64,
    pub licensor_received: u64,
    pub protocol_fee: u64,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
}

#[event]
pub struct LicenseVerified {
    pub license_key: Pubkey,
    pub ip_asset: Pubkey,
    pub licensee: Pubkey,
    pub is_valid: bool,
    pub checked_at: i64,
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
    #[msg("Price config is not active for this template")]
    PriceConfigNotActive,
    #[msg("Price config does not match the license template")]
    PriceConfigMismatch,
    #[msg("USDC mint does not match price config binding")]
    MintMismatch,
    #[msg("Payment account owner does not match declared owner")]
    PaymentAccountOwnerMismatch,
    #[msg("Licensor payment account does not match price config binding")]
    PaymentAccountMismatch,
    #[msg("Protocol treasury account owner does not match bound PROTOCOL_TREASURY")]
    UnauthorizedTreasury,
}

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_LICENSE_TEMPLATE: &[u8] = b"license_template";
pub const SEED_LICENSE: &[u8] = b"license";
pub const SEED_PRICE_CONFIG: &[u8] = b"price_config";
pub const MAX_NAME_LENGTH: usize = 64;
pub const MAX_PURPOSE_LENGTH: usize = 128;
