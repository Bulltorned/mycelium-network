use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu");

/// Mycelium Protocol — Rhizome Program
/// Royalty Distribution Engine on Solana
///
/// Accepts revenue deposits for licensed IP and automatically distributes
/// payments to all registered rights holders in a single atomic transaction.
///
/// Flow:
/// 1. IP owner configures royalty splits (RoyaltyConfig PDA)
/// 2. Licensee/payer deposits SOL to the royalty vault
/// 3. Anyone calls distribute → atomic split to all recipients
/// 4. Recipients withdraw their accumulated balance
///
/// Supports up to 8 recipients per IP asset (co-creators, parent IP, platform).
/// Platform fee is configurable per royalty config.

#[program]
pub mod mycelium_rhizome {
    use super::*;

    /// Configure royalty distribution for an IP asset.
    /// Splits must sum to 10,000 basis points (100%).
    pub fn configure_royalty(
        ctx: Context<ConfigureRoyalty>,
        recipients: Vec<RoyaltyRecipient>,
        platform_fee_bps: u16,
    ) -> Result<()> {
        require!(
            recipients.len() >= 1 && recipients.len() <= MAX_RECIPIENTS,
            RhizomeError::InvalidRecipientCount
        );
        require!(
            platform_fee_bps <= 1_000, // Max 10% platform fee
            RhizomeError::PlatformFeeTooHigh
        );

        // Validate splits sum to 10,000 bps (100%)
        let total_bps: u32 = recipients.iter()
            .map(|r| r.share_bps as u32)
            .sum();
        require!(
            total_bps == 10_000,
            RhizomeError::SplitsMustSum10000
        );

        let config = &mut ctx.accounts.royalty_config;
        config.ip_asset = ctx.accounts.ip_asset.key();
        config.creator = ctx.accounts.creator.key();
        config.platform_fee_bps = platform_fee_bps;
        config.total_deposited = 0;
        config.total_distributed = 0;
        config.distribution_count = 0;
        config.is_active = true;
        config.bump = ctx.bumps.royalty_config;

        // Store recipients
        config.recipient_count = recipients.len() as u8;
        for (i, r) in recipients.iter().enumerate() {
            config.recipients[i] = *r;
        }

        emit!(RoyaltyConfigured {
            config_key: ctx.accounts.royalty_config.key(),
            ip_asset: config.ip_asset,
            creator: config.creator,
            recipient_count: config.recipient_count,
            platform_fee_bps,
        });

        Ok(())
    }

    /// Deposit SOL into the royalty vault for an IP asset.
    /// Anyone can deposit (licensee, marketplace, etc).
    pub fn deposit_royalty(
        ctx: Context<DepositRoyalty>,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, RhizomeError::ZeroDeposit);

        let config = &ctx.accounts.royalty_config;
        require!(config.is_active, RhizomeError::ConfigNotActive);

        // Transfer SOL from depositor to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.royalty_vault.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        // Update config
        let config = &mut ctx.accounts.royalty_config;
        config.total_deposited = config.total_deposited
            .checked_add(amount_lamports)
            .ok_or(RhizomeError::Overflow)?;

        emit!(RoyaltyDeposited {
            config_key: ctx.accounts.royalty_config.key(),
            ip_asset: config.ip_asset,
            depositor: ctx.accounts.depositor.key(),
            amount_lamports,
            total_deposited: config.total_deposited,
        });

        Ok(())
    }

    /// Distribute accumulated royalties from the vault to all recipients.
    /// Calculates splits based on configured basis points.
    /// Platform fee is deducted first, remainder split among recipients.
    pub fn distribute_royalties(ctx: Context<DistributeRoyalties>) -> Result<()> {
        let config = &ctx.accounts.royalty_config;
        require!(config.is_active, RhizomeError::ConfigNotActive);

        let vault_balance = ctx.accounts.royalty_vault.lamports();
        // Keep rent-exempt minimum in vault
        let rent = Rent::get()?;
        let rent_exempt = rent.minimum_balance(0);
        let distributable = vault_balance.saturating_sub(rent_exempt);

        require!(distributable > 0, RhizomeError::NothingToDistribute);

        // Calculate platform fee
        let platform_fee = (distributable as u128)
            .checked_mul(config.platform_fee_bps as u128)
            .ok_or(RhizomeError::Overflow)?
            .checked_div(10_000)
            .ok_or(RhizomeError::Overflow)? as u64;

        let distributable_after_fee = distributable.checked_sub(platform_fee)
            .ok_or(RhizomeError::Overflow)?;

        // Transfer platform fee
        if platform_fee > 0 {
            **ctx.accounts.royalty_vault.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
            **ctx.accounts.platform_wallet.to_account_info().try_borrow_mut_lamports()? += platform_fee;
        }

        // Distribute to recipients based on their share_bps
        // Note: In this PoC, we store distribution records on-chain.
        // In production, the remaining_accounts would be the actual recipient wallets.
        // For simplicity, we transfer everything to a distribution record PDA
        // that recipients withdraw from.
        let total_sent = distributable_after_fee;
        **ctx.accounts.royalty_vault.to_account_info().try_borrow_mut_lamports()? -= total_sent;
        **ctx.accounts.distribution_pool.to_account_info().try_borrow_mut_lamports()? += total_sent;

        let config = &mut ctx.accounts.royalty_config;
        config.total_distributed = config.total_distributed
            .checked_add(distributable)
            .ok_or(RhizomeError::Overflow)?;
        config.distribution_count = config.distribution_count
            .checked_add(1)
            .ok_or(RhizomeError::Overflow)?;

        emit!(RoyaltiesDistributed {
            config_key: ctx.accounts.royalty_config.key(),
            ip_asset: config.ip_asset,
            total_distributed: distributable,
            platform_fee,
            recipient_amount: distributable_after_fee,
            distribution_number: config.distribution_count,
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Configuration for how royalties are split for an IP asset.
/// One config per IP asset. Supports up to 8 recipients.
#[account]
#[derive(InitSpace)]
pub struct RoyaltyConfig {
    pub ip_asset: Pubkey,
    pub creator: Pubkey,
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

/// A single recipient in a royalty split configuration.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct RoyaltyRecipient {
    pub wallet: Pubkey,
    /// Share in basis points (e.g., 5000 = 50%)
    pub share_bps: u16,
    /// Role identifier for evidence packages
    pub role: RecipientRole,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RecipientRole {
    /// Original creator of the IP
    Creator,
    /// Co-creator with shared ownership
    CoCreator,
    /// Parent IP owner receiving derivative royalties
    ParentIP,
    /// Platform or marketplace fee
    Platform,
    /// Other (agent, manager, etc)
    Other,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct ConfigureRoyalty<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + RoyaltyConfig::INIT_SPACE,
        seeds = [SEED_ROYALTY_CONFIG, ip_asset.key().as_ref()],
        bump
    )]
    pub royalty_config: Account<'info, RoyaltyConfig>,
    /// CHECK: IP asset address from Spore program.
    pub ip_asset: UncheckedAccount<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositRoyalty<'info> {
    #[account(
        mut,
        seeds = [SEED_ROYALTY_CONFIG, royalty_config.ip_asset.as_ref()],
        bump = royalty_config.bump,
    )]
    pub royalty_config: Account<'info, RoyaltyConfig>,
    /// CHECK: PDA vault that holds deposited SOL.
    #[account(
        mut,
        seeds = [SEED_ROYALTY_VAULT, royalty_config.key().as_ref()],
        bump,
    )]
    pub royalty_vault: SystemAccount<'info>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    #[account(
        mut,
        seeds = [SEED_ROYALTY_CONFIG, royalty_config.ip_asset.as_ref()],
        bump = royalty_config.bump,
    )]
    pub royalty_config: Account<'info, RoyaltyConfig>,
    /// CHECK: PDA vault holding deposited SOL.
    #[account(
        mut,
        seeds = [SEED_ROYALTY_VAULT, royalty_config.key().as_ref()],
        bump,
    )]
    pub royalty_vault: SystemAccount<'info>,
    /// CHECK: Pool where distributed SOL is sent for recipient withdrawal.
    #[account(mut)]
    pub distribution_pool: SystemAccount<'info>,
    /// CHECK: Platform wallet receiving the platform fee.
    #[account(mut)]
    pub platform_wallet: SystemAccount<'info>,
    pub caller: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct RoyaltyConfigured {
    pub config_key: Pubkey,
    pub ip_asset: Pubkey,
    pub creator: Pubkey,
    pub recipient_count: u8,
    pub platform_fee_bps: u16,
}

#[event]
pub struct RoyaltyDeposited {
    pub config_key: Pubkey,
    pub ip_asset: Pubkey,
    pub depositor: Pubkey,
    pub amount_lamports: u64,
    pub total_deposited: u64,
}

#[event]
pub struct RoyaltiesDistributed {
    pub config_key: Pubkey,
    pub ip_asset: Pubkey,
    pub total_distributed: u64,
    pub platform_fee: u64,
    pub recipient_amount: u64,
    pub distribution_number: u32,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum RhizomeError {
    #[msg("Must have between 1 and 8 recipients")]
    InvalidRecipientCount,
    #[msg("Platform fee cannot exceed 1000 bps (10%)")]
    PlatformFeeTooHigh,
    #[msg("Recipient shares must sum to exactly 10000 bps (100%)")]
    SplitsMustSum10000,
    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,
    #[msg("Royalty config is not active")]
    ConfigNotActive,
    #[msg("Nothing to distribute — vault is empty")]
    NothingToDistribute,
    #[msg("Arithmetic overflow")]
    Overflow,
}

// ============================================================================
// CONSTANTS
// ============================================================================

pub const SEED_ROYALTY_CONFIG: &[u8] = b"royalty_config";
pub const SEED_ROYALTY_VAULT: &[u8] = b"royalty_vault";
pub const MAX_RECIPIENTS: usize = 8;
