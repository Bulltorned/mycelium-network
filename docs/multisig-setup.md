# Mycelium Protocol -- Squads v4 Multisig Setup Guide

> **DANGER:** The multisig created in this guide will control all program upgrade authority
> for Mycelium Protocol on mainnet. Mistakes here are irreversible without multisig consensus.
> Follow every step exactly. Do NOT skip the test transaction.

---

## Decision Required: Multisig Members

Before proceeding, Aji must decide on the 2nd and 3rd multisig members.

**Options considered:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Aji + 2 trusted team members | Operational flexibility, team can approve when Aji unavailable | More wallets to manage |
| B | Aji + 2 hardware wallets (same person) | Simpler key management, faster approvals | Bus factor = 1, defeats purpose of multisig |
| C | Aji + 1 team member + 1 cold storage backup | Balance of speed and security | Cold storage harder for routine upgrades |

**Recommendation:** Option A or C. Option B provides no real security benefit over a single key.

**Current member configuration (PLACEHOLDERS -- fill before execution):**

| Member | Wallet Address | Permission | Role |
|--------|---------------|------------|------|
| Member 1 (Aji) | `<MEMBER_1_WALLET>` | 7 (Proposer + Voter + Executor) | Primary operator |
| Member 2 | `<MEMBER_2_WALLET>` | 6 (Voter + Executor) | Trusted co-signer |
| Member 3 | `<MEMBER_3_WALLET>` | 2 (Voter) | Backup voter |

**Threshold:** 2-of-3 (any 2 members must approve for a transaction to execute)

---

## Prerequisites

1. **Solana wallets** for all 3 members
   - Hardware wallets (Ledger) strongly recommended for mainnet governance
   - Each member must share their public key (wallet address)
2. **SOL for fees**
   - Member 1 needs ~0.02 SOL for multisig creation transaction
   - Vault needs ~0.05 SOL for test transactions
3. **Browser wallet extension** (Phantom, Solflare, or Backpack)
4. **All 5 programs deployed to mainnet** (see 04-01-SUMMARY.md)
   - Confirm deployment: `solana program show <PROGRAM_ID> -u mainnet-beta`

---

## Step 1: Create the Squads Multisig

### 1.1 Navigate to Squads

1. Open https://app.squads.so in your browser
2. Connect Member 1's wallet (Aji) -- click "Connect Wallet" top-right
3. Select your wallet provider and approve the connection
4. Ensure you are on **Mainnet** (check network selector in Squads UI)

### 1.2 Create New Multisig

1. Click **"Create Multisig"** (or "Create Squad")
2. Give it a name: `Mycelium Protocol Governance`
3. Add members:

   **Member 1 (Aji):**
   - Address: `<MEMBER_1_WALLET>`
   - Permissions: Check all boxes (Proposer + Voter + Executor = permission 7)

   **Member 2:**
   - Address: `<MEMBER_2_WALLET>`
   - Permissions: Voter + Executor (permission 6)

   **Member 3:**
   - Address: `<MEMBER_3_WALLET>`
   - Permissions: Voter only (permission 2)

4. Set **Threshold: 2** (2-of-3 required to approve transactions)
5. Review the configuration carefully
6. Click **"Create"** and sign the transaction in your wallet

### 1.3 Record Addresses

After creation, Squads will show:

- **Multisig Address:** `_______________________________________________`
- **Vault PDA (index 0):** `_______________________________________________`

**Save these immediately.** The vault PDA is what receives program upgrade authority.

Add to GitHub repository secrets:
- `MAINNET_MULTISIG` = multisig address
- `MAINNET_MULTISIG_VAULT` = vault PDA

### 1.4 Permission Reference

| Permission Value | Capability | Who Should Have It |
|-----------------|------------|-------------------|
| 1 | Proposer (create transactions) | Primary operators |
| 2 | Voter (approve/reject) | All members |
| 4 | Executor (execute approved txs) | Trusted operators |
| 7 | All (1+2+4) | Member 1 (Aji) |
| 6 | Voter + Executor (2+4) | Trusted co-signers |
| 3 | Proposer + Voter (1+2) | Active participants |

---

## Step 2: Verify Multisig Works (CRITICAL)

> **DO NOT proceed to authority transfer until this step passes.**
> A broken multisig with program authority = locked programs forever.

### 2.1 Fund the Vault

1. In Squads UI, find the vault address (index 0)
2. Send **0.01 SOL** to the vault from any wallet
3. Confirm the balance shows in Squads

### 2.2 Create a Test Transaction

1. Member 1 (Aji): In Squads, click **"New Transaction"**
2. Select **"Transfer SOL"**
3. Destination: Member 1's wallet address
4. Amount: **0.001 SOL**
5. Click **"Create"** and sign

### 2.3 Approve the Test Transaction

1. Member 2: Connect their wallet to Squads
2. Navigate to the pending transaction
3. Click **"Approve"** and sign
4. The transaction should now show 2/2 approvals (meeting the 2-of-3 threshold)

### 2.4 Execute the Test Transaction

1. Any member with Executor permission (Member 1 or 2): Click **"Execute"**
2. Sign the execution transaction
3. Verify the 0.001 SOL arrived in Member 1's wallet

### 2.5 Verify on Explorer

1. Check the transaction on https://explorer.solana.com (mainnet)
2. Confirm it shows as successful
3. Confirm the vault balance decreased by 0.001 SOL + fees

**If any step fails:** Do NOT proceed. Debug the multisig configuration first. Common issues:
- Wrong network (devnet vs mainnet)
- Member connected wrong wallet
- Insufficient SOL for fees

---

## Step 3: Transfer Program Upgrade Authority

Once the test transaction passes, run the authority transfer script:

```bash
# First, dry-run to verify commands (no changes made):
bash docs/authority-transfer.sh --dry-run <VAULT_PDA_ADDRESS>

# Review the output. Then execute for real:
bash docs/authority-transfer.sh <VAULT_PDA_ADDRESS>
```

See `docs/authority-transfer.sh` for the full script. It transfers upgrade authority
for all 5 Mycelium programs to the Squads vault PDA.

---

## Step 4: Post-Transfer Verification

After authority transfer, verify each program:

```bash
# For each program, confirm authority is the Squads vault PDA:
solana program show GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR -u mainnet-beta
solana program show BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV -u mainnet-beta
solana program show 7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW -u mainnet-beta
solana program show 2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le -u mainnet-beta
solana program show BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU -u mainnet-beta
```

Each should show `Authority: <VAULT_PDA_ADDRESS>` instead of the deployer key.

---

## Step 5: Test a Program Upgrade via Multisig

> Recommended but optional. Only do this if you have a pending upgrade to deploy.

1. In Squads, create a **"Program Upgrade"** transaction
2. Select the program to upgrade and provide the new buffer
3. Member 1 proposes, Member 2 approves
4. Execute the upgrade
5. Verify the program was updated on-chain

---

## Emergency Procedures

### Lost Member Key
- If 1 member loses their key, the remaining 2 can still meet the 2-of-3 threshold
- Create a new multisig with a replacement member and transfer authority again (requires 2-of-3 approval)

### All Authority Lost
- If 2+ members lose keys simultaneously, **programs are permanently locked**
- This is why hardware wallets with secure backup seeds are critical

### Changing Threshold or Members
- Squads v4 supports member management transactions
- Adding/removing members or changing threshold requires meeting the current threshold
- Plan these changes carefully -- test on devnet first

---

## Squads v4 Reference

- **Squads Program ID:** `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`
- **Documentation:** https://docs.squads.so
- **App:** https://app.squads.so
- **Source:** https://github.com/Squads-Protocol/v4

---

## Programs Under Governance

| Program | Mainnet ID |
|---------|-----------|
| mycelium_spore | `GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR` |
| mycelium_hypha | `BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV` |
| mycelium_rhizome | `7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW` |
| mycelium_meridian | `2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le` |
| mycelium_drp | `BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU` |
