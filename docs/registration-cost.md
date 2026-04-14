# Mycelium Protocol -- Registration Cost Breakdown

> Last updated: 2026-04-13
> Network: Solana mainnet-beta

## Per-Registration Cost

Registering an IP asset via `register_ip` creates two on-chain accounts (PDAs) and pays a transaction fee.

| Component | Account Size | Rent-Exempt Deposit (SOL) | Notes |
|-----------|-------------|--------------------------|-------|
| IPAsset PDA | 352 bytes | 0.00334 | 8 (discriminator) + 344 (IPAsset fields) |
| ContentHashRegistry PDA | 73 bytes | 0.00140 | 8 (discriminator) + 65 (registry fields) |
| Transaction fee | -- | ~0.000005 | 5,000 lamports (1 signature) |
| **Total per registration** | **425 bytes** | **~0.00474 SOL** | |

### Cost in USD (at various SOL prices)

| SOL Price | Cost per Registration |
|-----------|----------------------|
| $50 | ~$0.24 |
| $85 | ~$0.40 |
| $100 | ~$0.47 |
| $150 | ~$0.71 |

## Correction Notice

The figure of "$0.004 per registration" previously cited in project documentation referred to the **transaction fee only** (5,000 lamports = ~$0.0004). The actual cost per registration is **~0.00474 SOL (~$0.40 at $85/SOL)** because it includes the rent-exempt deposits required for creating the IPAsset and ContentHashRegistry PDA accounts.

The transaction fee is negligible (~0.1% of total cost). The dominant cost is Solana's rent-exempt minimum balance for the two new accounts.

## Rent Recovery

Rent-exempt deposits are **reclaimable**. If an IP asset account is closed (e.g., via a future `close_ip_asset` instruction), the deposited SOL is returned to the payer. This means the effective long-term cost is only the transaction fee (~$0.0004).

## Program Deployment Cost Estimate

Deploying the 5 Mycelium programs to mainnet-beta:

| Component | Estimated Cost (SOL) | Notes |
|-----------|---------------------|-------|
| Program buffer accounts (5 programs) | ~10-12 SOL | Depends on compiled program size |
| Program rent-exempt deposits | ~2-3 SOL | Permanent unless program closed |
| Transaction fees | ~0.01 SOL | Multiple deploy transactions |
| **Total deployment estimate** | **~15 SOL** | One-time cost |

## Program IDs (Mainnet)

| Program | Mainnet Program ID |
|---------|-------------------|
| Spore (registration) | `GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR` |
| Hypha (licensing) | `BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV` |
| Rhizome (royalties) | `7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW` |
| Meridian (evidence) | `2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le` |
| DRP (disputes) | `BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU` |
