# Mycelium Protocol - Deployment Runbook

> Complete procedure for deploying Mycelium Protocol programs to Solana mainnet-beta.
> Covers first-time deployment, upgrades, verification, and rollback.
> Last updated: 2026-04-13

---

## Table of Contents

1. [Prerequisites Checklist](#1-prerequisites-checklist)
2. [First-Time Deployment Procedure](#2-first-time-deployment-procedure)
3. [Deployment Order (CRITICAL)](#3-deployment-order-critical)
4. [Post-Deployment Verification](#4-post-deployment-verification)
5. [Upgrade Procedure](#5-upgrade-procedure)
6. [Rollback Procedures](#6-rollback-procedures)
7. [Emergency Contacts and Escalation](#7-emergency-contacts-and-escalation)
8. [Cost Reference](#8-cost-reference)
9. [GitHub Secrets Reference](#9-github-secrets-reference)

---

## 1. Prerequisites Checklist

Before ANY deployment, confirm every item:

- [ ] **Deployer wallet funded** with >= 15 SOL on mainnet-beta
  - Address: `F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye`
  - Check: `solana balance F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye -u mainnet-beta`
- [ ] **Paid mainnet RPC endpoint** configured (Helius or QuickNode)
  - Public RPC has aggressive rate limits -- will fail during deployment
- [ ] **GitHub repository secrets** configured (see [Section 9](#9-github-secrets-reference))
  - MAINNET_SOLANA_DEPLOY_URL
  - MAINNET_DEPLOYER_KEYPAIR
  - PROGRAM_ADDRESS_KEYPAIR_SPORE / HYPHA / RHIZOME / MERIDIAN / DRP
  - MAINNET_MULTISIG
  - MAINNET_MULTISIG_VAULT
- [ ] **Squads multisig created** and tested via app.squads.so
  - 2-of-3 threshold configured
  - All 3 members have signed at least one test transaction
  - Vault 0 funded with enough SOL for transaction fees
- [ ] **All 5 mainnet keypairs generated** (completed in Plan 04-01)
  - Located at `C:/solana-keys/mycelium_*-mainnet-keypair.json`
  - Backed up securely offline
- [ ] **Anchor.toml** has `[programs.mainnet-beta]` section with correct IDs
- [ ] **CI build passes** -- the `Build & Verify` workflow succeeds on the commit being deployed
- [ ] **Cross-program IDs verified** -- DRP_AUTHORITY in Spore and SPORE_PROGRAM_ID in DRP match mainnet values

---

## 2. First-Time Deployment Procedure

Each program is deployed individually via the GitHub Actions `workflow_dispatch` trigger
on the `mainnet-deploy.yml` workflow.

### Step 1: Trigger deployment workflow

1. Go to the repository on GitHub
2. Navigate to **Actions** > **Mainnet Deploy**
3. Click **Run workflow**
4. Select:
   - **Program:** the program to deploy (follow order in Section 3)
   - **Network:** `mainnet`
   - **Priority fee:** `300000` (default; increase if network is congested)
5. Click **Run workflow**

### Step 2: CI builds verifiable .so via Docker

The reusable workflow (`solana-developers/github-workflows`) runs inside a Docker container
to produce a deterministic, verifiable build artifact. This is NOT the same as a local
`anchor build` -- Docker ensures byte-for-byte reproducibility.

Monitor the workflow run in GitHub Actions. Build typically takes 5-15 minutes.

### Step 3: CI deploys to mainnet buffer account

The workflow deploys the compiled `.so` to a buffer account on mainnet. The buffer holds
the bytecode temporarily until the upgrade is approved.

### Step 4: CI creates Squads multisig proposal

Because `use-squads: true` is set, the workflow automatically creates a Squads proposal
to write the buffer contents to the program account. No manual proposal creation needed.

### Step 5: Approve via Squads multisig (2-of-3)

1. Go to [app.squads.so](https://app.squads.so)
2. Connect wallet (must be a multisig member)
3. Find the pending proposal for the program upgrade
4. Review the proposal details (program ID, buffer address)
5. Click **Approve**
6. Second member repeats steps 1-5
7. Once 2-of-3 have approved, the proposal is ready to execute

### Step 6: Execute the program write on-chain

After 2-of-3 approval, any member can click **Execute** on the Squads UI.
This writes the buffer bytecode to the program account on-chain.

### Step 7: Verify bytecode match

The CI workflow runs `solana-verify verify-from-repo` automatically after deployment.
You can also verify manually:

```bash
solana-verify verify-from-repo \
  --remote https://github.com/<OWNER>/Mycelium-Network \
  <PROGRAM_ID> \
  -u mainnet-beta
```

### Step 8: Confirm program is live

```bash
solana program show <PROGRAM_ID> -u mainnet-beta
```

Expected output shows:
- Program Id matching the expected address
- Owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- Authority: deployer key (before transfer) or Squads vault PDA (after transfer)
- Data Length: > 0

---

## 3. Deployment Order (CRITICAL)

Programs MUST be deployed in this order due to cross-program dependencies.
Deploying out of order will not cause compilation failures (IDs are compiled in),
but verification and CPI calls depend on the programs being live.

| Order | Program | Mainnet ID | Dependencies |
|-------|---------|-----------|-------------|
| 1 | **Spore** | `GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR` | None -- deploy first |
| 2 | **Hypha** | `BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV` | Depends on Spore (CPI for IP lookups) |
| 3 | **Rhizome** | `7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW` | Depends on Spore (royalty config lookup) |
| 4 | **Meridian** | `2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le` | Depends on Spore (evidence packages) |
| 5 | **DRP** | `BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU` | Depends on Spore (CPI); DRP authority PDA must match Spore's DRP_AUTHORITY constant |

### After all 5 programs are deployed: Transfer upgrade authority

Once all programs are verified live, transfer upgrade authority from the deployer
key to the Squads multisig vault PDA:

```bash
SQUADS_VAULT="<SQUADS_VAULT_PDA_ADDRESS>"

# Transfer authority for each program
for PROG_ID in \
  GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR \
  BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV \
  7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW \
  2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le \
  BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU; do

  solana program set-upgrade-authority "$PROG_ID" \
    --new-upgrade-authority "$SQUADS_VAULT" \
    --keypair ~/solana-keys/id.json \
    -u mainnet-beta

  echo "Transferred authority for $PROG_ID"
done
```

**WARNING:** This is irreversible. After transfer, ONLY the Squads multisig can
upgrade programs. Verify the multisig works before transferring.

---

## 4. Post-Deployment Verification

Run these checks after ALL 5 programs are deployed:

### 4.1 Program existence check

```bash
for PROG_ID in \
  GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR \
  BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV \
  7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW \
  2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le \
  BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU; do

  echo "=== $PROG_ID ==="
  solana program show "$PROG_ID" -u mainnet-beta
  echo ""
done
```

### 4.2 Verifiable build check

```bash
for PROG_ID in \
  GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR \
  BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV \
  7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW \
  2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le \
  BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU; do

  echo "=== Verifying $PROG_ID ==="
  solana-verify verify-from-repo \
    --remote https://github.com/<OWNER>/Mycelium-Network \
    "$PROG_ID" \
    -u mainnet-beta
  echo ""
done
```

### 4.3 Functional smoke test

After deployment, run a minimal smoke test with real SOL:

1. **Test IP registration on mainnet** (via Spore):
   - Register a test IP asset with a small content hash
   - Verify the IPAsset PDA is created and readable
   - Cost: ~0.00474 SOL (~$0.40)

2. **Test DRP -> Spore CPI** (file a test dispute):
   - File a dispute against the test IP registration
   - Verify the dispute PDA is created
   - Verify Spore's DRP_AUTHORITY check passes

3. **Test Hypha licensing** (create a test license):
   - Create a license template referencing the test IP
   - Verify the license PDA is created

### 4.4 Authority verification

After transferring upgrade authority to Squads:

```bash
for PROG_ID in \
  GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR \
  BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV \
  7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW \
  2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le \
  BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU; do

  echo "=== Authority for $PROG_ID ==="
  solana program show "$PROG_ID" -u mainnet-beta | grep "Authority"
done
```

All programs should show the Squads vault PDA as the upgrade authority.

---

## 5. Upgrade Procedure

After initial deployment, all upgrades follow this process:

1. **Merge code changes** to the main branch
2. **Tag the release**: `git tag -a v0.X.Y -m "Description of changes"`
3. **Push the tag**: `git push origin v0.X.Y`
4. **Trigger the Mainnet Deploy workflow** (same as Section 2, Step 1)
   - Select the specific program that was changed
5. **CI builds, deploys buffer, creates Squads proposal** automatically
6. **2-of-3 multisig members approve** via app.squads.so
7. **Execute** the proposal to apply the upgrade on-chain
8. **Verify** the upgrade via `solana-verify verify-from-repo`

### Upgrade safety notes

- The buffer account holds the new bytecode until the Squads proposal is executed
- If the proposal is rejected, the buffer can be closed to reclaim SOL
- The old program bytecode remains active until the proposal executes
- There is NO downtime during the upgrade process -- users continue using the old version until the new one is written

---

## 6. Rollback Procedures

### Scenario A: Deployment failed mid-way (buffer exists, program not written)

**Symptoms:** GitHub Actions workflow failed, or Squads proposal was never approved.

**Impact:** None. The on-chain program is unchanged. Users are unaffected.

**Procedure:**

1. Check if a buffer account was created:
   ```bash
   solana program show --buffers -u mainnet-beta --buffer-authority F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye
   ```

2. Close the buffer to reclaim SOL:
   ```bash
   solana program close <BUFFER_ADDRESS> \
     --keypair ~/solana-keys/id.json \
     -u mainnet-beta
   ```

3. If a Squads proposal exists, it can be cancelled by the proposer in the Squads UI.

4. Fix the root cause, then re-trigger the workflow.

### Scenario B: Program deployed but buggy

**Symptoms:** Program is live on mainnet but has a bug discovered after deployment.

**Impact:** Users may encounter errors or incorrect behavior.

**Procedure:**

1. **Assess severity:**
   - Critical (loss of funds / data corruption): proceed immediately to step 2
   - Non-critical: schedule fix in next release

2. **Revert to previous known-good version:**
   ```bash
   # Find the last known-good commit/tag
   git log --oneline --tags

   # Check out that version
   git checkout v0.X.Y-previous

   # Create a hotfix branch
   git checkout -b hotfix/revert-<program>
   git push origin hotfix/revert-<program>
   ```

3. **Re-trigger the Mainnet Deploy workflow** from the hotfix branch:
   - Select the buggy program
   - Network: mainnet

4. **Approve and execute** the Squads proposal (2-of-3 required).

5. **Verify** the rollback: `solana-verify verify-from-repo` with the hotfix branch.

6. **Post-mortem:** Document what went wrong and add regression test before re-deploying the fix.

### Scenario C: Authority compromised (deployer key or multisig member key leaked)

**Symptoms:** Unauthorized transactions from a multisig member, or deployer key exposed.

**Impact:** Potentially critical -- attacker could propose malicious upgrades.

**Immediate response:**

1. **If deployer key is compromised (pre-authority-transfer):**
   - Immediately transfer upgrade authority to Squads vault:
     ```bash
     solana program set-upgrade-authority <PROGRAM_ID> \
       --new-upgrade-authority <SQUADS_VAULT_PDA> \
       --keypair ~/solana-keys/id.json \
       -u mainnet-beta
     ```
   - Rotate the deployer keypair
   - Update GitHub secrets with new deployer key

2. **If one multisig member key is compromised (post-authority-transfer):**
   - Remaining 2 honest members create a new Squads multisig (2-of-3 with replacement member)
   - Propose authority transfer from current multisig to new multisig
   - 2-of-3 current members approve the transfer (the compromised member alone cannot block this)
   - Execute the transfer

3. **If the multisig itself is compromised (2+ of 3 keys):**
   - Programs are effectively immutable until the multisig is recovered
   - This is by design -- there is no backdoor. No single entity can override the multisig
   - Contact Squads support for assistance
   - Begin planning program migration to new program IDs as a last resort

**Prevention:**
- Use hardware wallets (Ledger) for all multisig members
- Never store multisig member keys on internet-connected machines
- Rotate multisig membership if any member leaves the team

---

## 7. Emergency Contacts and Escalation

| Role | Contact | When to contact |
|------|---------|-----------------|
| Primary (Multisig Member 1) | Aji Pratomo | Any deployment issue, authority decisions |
| Multisig Member 2 | TBD | Approval requests, emergency votes |
| Multisig Member 3 | TBD | Approval requests, emergency votes |
| Squads Support | [app.squads.so](https://app.squads.so) | Multisig UI issues, stuck proposals |
| Solana Foundation | [solana.com/validators](https://solana.com/validators) | Network-level issues, consensus problems |
| RPC Provider (Helius/QuickNode) | Provider dashboard | RPC downtime, rate limiting during deployment |

### Escalation path

1. Deployment workflow fails -> Check GitHub Actions logs -> Fix and re-trigger
2. Squads proposal stuck -> Check app.squads.so -> Contact Squads support
3. On-chain issue post-deploy -> Execute Scenario B rollback -> Post-mortem
4. Security incident -> Execute Scenario C -> Contact all multisig members immediately

---

## 8. Cost Reference

### Deployment costs (one-time)

| Item | Cost (SOL) | Cost (USD at $85/SOL) |
|------|-----------|----------------------|
| 5 program accounts (rent-exempt) | ~5.2 SOL | ~$442 |
| Buffer accounts (reclaimable) | ~5.2 SOL | ~$442 |
| Transaction fees | ~0.01 SOL | ~$1 |
| **Total needed in deployer wallet** | **~15 SOL** | **~$1,275** |

Note: Buffer account SOL is reclaimable after deployment completes.

### Per-registration costs (ongoing, user-facing)

See [docs/registration-cost.md](./registration-cost.md) for detailed breakdown.

| Item | Cost (SOL) |
|------|-----------|
| IPAsset PDA (352 bytes) | 0.00334 |
| ContentHashRegistry PDA (73 bytes) | 0.00140 |
| Transaction fee | ~0.000005 |
| **Total per registration** | **~0.00474 SOL (~$0.40)** |

### Ongoing costs

- Programs are rent-exempt -- no ongoing rent payments
- Transaction fees only (~0.000005 SOL per transaction)
- RPC provider: ~$50/month for paid tier (Helius/QuickNode)

---

## 9. GitHub Secrets Reference

All secrets must be configured in the GitHub repository settings before deployment.

| Secret Name | Description | How to obtain |
|-------------|------------|---------------|
| `MAINNET_SOLANA_DEPLOY_URL` | Paid mainnet RPC URL | Sign up at helius.dev or quicknode.com |
| `MAINNET_DEPLOYER_KEYPAIR` | Base58-encoded deployer private key | `cat ~/solana-keys/id.json` then Base58-encode |
| `PROGRAM_ADDRESS_KEYPAIR_SPORE` | Base58-encoded Spore program keypair | `cat C:/solana-keys/mycelium_spore-mainnet-keypair.json` |
| `PROGRAM_ADDRESS_KEYPAIR_HYPHA` | Base58-encoded Hypha program keypair | `cat C:/solana-keys/mycelium_hypha-mainnet-keypair.json` |
| `PROGRAM_ADDRESS_KEYPAIR_RHIZOME` | Base58-encoded Rhizome program keypair | `cat C:/solana-keys/mycelium_rhizome-mainnet-keypair.json` |
| `PROGRAM_ADDRESS_KEYPAIR_MERIDIAN` | Base58-encoded Meridian program keypair | `cat C:/solana-keys/mycelium_meridian-mainnet-keypair.json` |
| `PROGRAM_ADDRESS_KEYPAIR_DRP` | Base58-encoded DRP program keypair | `cat C:/solana-keys/mycelium_drp-mainnet-keypair.json` |
| `MAINNET_MULTISIG` | Squads multisig account address | Created via app.squads.so |
| `MAINNET_MULTISIG_VAULT` | Squads vault PDA address | Shown in Squads UI after multisig creation |
| `DEVNET_SOLANA_DEPLOY_URL` | Devnet RPC URL | `https://api.devnet.solana.com` or paid |
| `DEVNET_DEPLOYER_KEYPAIR` | Base58-encoded devnet deployer key | Same format as mainnet |

### How to Base58-encode a keypair JSON file

The Solana keypair JSON file contains a byte array. To convert to Base58 for GitHub secrets:

```bash
# Using solana-keygen to verify the keypair, then extract
# The JSON file IS the secret -- paste the entire JSON array content
# Note: some workflows accept JSON array format directly
cat C:/solana-keys/mycelium_spore-mainnet-keypair.json
# Output: [123,45,67,...] -- this is your secret value
```

Check the solana-developers/github-workflows documentation for the exact format expected
(Base58 string vs JSON byte array). The format may vary by workflow version.
