# Phase 4: Mainnet Deployment - Research

**Researched:** 2026-04-13
**Domain:** Solana mainnet deployment, multisig governance, verifiable builds
**Confidence:** HIGH

## Summary

Phase 4 takes 5 Anchor programs (Spore, Hypha, Rhizome, Meridian, DRP) from devnet to mainnet-beta with multisig governance, verifiable builds, and operational documentation. The critical discovery is that the local environment now has Solana CLI 3.1.13, Anchor CLI 0.32.1, and cargo-build-sbf installed on Windows -- earlier phases assumed these were unavailable. Docker is NOT installed, which blocks `anchor build --verifiable` and `solana-verify build` locally; however, GitHub Actions CI/CD (solana-developers/github-workflows) provides a Docker-based build environment that handles verifiable builds, deployment, IDL upload, and Squads multisig integration in a single workflow.

The $0.004 registration cost claim is definitively wrong. Actual mainnet cost per IP registration is ~0.00474 SOL (~$0.40 at current ~$85/SOL) covering rent-exempt minimums for IPAsset PDA (352 bytes, 0.00334 SOL) + ContentHashRegistry PDA (73 bytes, 0.00140 SOL). This must be documented accurately.

**Primary recommendation:** Use GitHub Actions (solana-developers/github-workflows) for all builds, verification, and deployment. Create Squads v4 multisig via app.squads.so with 2-of-3 threshold. Transfer upgrade authority after first mainnet deployment. Write deployment runbook covering the full CI/CD-driven workflow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-06 | Squads v4 multisig (2-of-3 minimum) as upgrade authority for all programs | Squads v4 web UI + CLI documented. Vault PDA becomes upgrade authority. GitHub Actions workflow supports `use-squads: true` for automated proposal creation. |
| MNT-01 | Mainnet-beta program IDs configured in Anchor.toml and all adapters | Anchor.toml needs `[programs.mainnet-beta]` section. New keypairs generated for mainnet program IDs. All adapters and IDLs updated. |
| MNT-02 | Registration cost validated against actual mainnet rent-exempt minimums | Per-registration cost = 0.00474 SOL (~$0.40). Breakdown: IPAsset 352 bytes (0.00334 SOL) + ContentHashRegistry 73 bytes (0.00140 SOL) + tx fee (~5000 lamports). |
| MNT-03 | Verifiable build configured for all programs | `solana-verify build` via Docker in GitHub Actions. Anchor 0.32.1 uses solana-verify under the hood for `anchor verify`. Docker required (not available locally). |
| MNT-04 | Deployment runbook with rollback procedure | GitHub Actions workflow handles build+deploy+verify. Runbook covers: CI/CD trigger, Squads approval, verification, rollback via buffer revert. |
</phase_requirements>

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Anchor CLI | 0.32.1 | Program framework + IDL generation | Already installed locally. 0.32.x uses solana-verify natively |
| Solana CLI | 3.1.13 (Agave) | Deployment, rent calculation, authority transfer | Already installed locally |
| solana-verify | latest (via cargo install) | Deterministic verifiable builds | Industry standard, maintained by OtterSec. Required for `anchor verify` in 0.32+ |
| Squads v4 | SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf | Multisig upgrade authority | De facto standard for Solana program governance. Secures $10B+ |
| Docker | latest | Containerized deterministic builds | Required for solana-verify. NOT available locally -- use GitHub Actions |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| solana-developers/github-workflows | v0.2.9 | CI/CD pipeline for build+deploy+verify | All mainnet builds and deployments |
| metadaoproject/setup-anchor | latest | GitHub Action to install Anchor in CI | Dependency of the build workflow |
| squads-multisig-cli | latest (cargo install) | CLI for multisig operations | Alternative to Squads web UI for automation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Squads v4 | Native Solana multisig (SPL) | SPL multisig is lower-level, no web UI, no program upgrade workflow |
| GitHub Actions CI/CD | Local Docker build | Docker not installed locally, and CI/CD is the standard for production |
| solana-verify | anchor verify (old) | anchor verify in 0.32+ delegates to solana-verify anyway |

## Architecture Patterns

### Deployment Flow

```
Developer -> Git Push/Tag -> GitHub Actions -> Docker Build -> Verifiable .so
                                                   |
                                                   v
                                            Deploy to Mainnet
                                                   |
                                                   v
                                            Create Squads Proposal
                                                   |
                                                   v
                                    2-of-3 Multisig Approval (Squads UI)
                                                   |
                                                   v
                                         Execute Upgrade On-Chain
                                                   |
                                                   v
                                     solana-verify Remote Verification
```

### Program ID Strategy

Current devnet program IDs (from Anchor.toml):

| Program | Devnet ID | Mainnet ID |
|---------|-----------|------------|
| mycelium_spore | AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz | NEW -- generate keypair |
| mycelium_hypha | 9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5 | NEW -- generate keypair |
| mycelium_rhizome | 9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu | NEW -- generate keypair |
| mycelium_meridian | 7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc | NEW -- generate keypair |
| mycelium_drp | Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS | NEW -- generate keypair |

**Critical:** DRP uses placeholder program ID `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` (the Anchor default/example ID). This MUST be replaced with a real generated keypair before ANY deployment.

**Cross-program references that must update:**
1. **Spore `DRP_AUTHORITY`** -- Currently `[0u8; 32]` placeholder. Must be set to the DRP program's authority PDA derived from `[b"drp_authority"]` + DRP program ID.
2. **DRP `SPORE_PROGRAM_ID`** -- Currently hardcoded to devnet Spore ID bytes. Must update to mainnet Spore program ID bytes.
3. **All IDL JSON files** -- Program addresses in IDL metadata must match mainnet IDs.
4. **All TypeScript adapters** -- Program ID constants must be environment-aware (devnet vs mainnet).

### Anchor.toml Configuration

```toml
[programs.devnet]
mycelium_spore = "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz"
mycelium_hypha = "9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5"
mycelium_rhizome = "9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu"
mycelium_meridian = "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc"
mycelium_drp = "<GENERATED_DRP_ID>"

[programs.mainnet-beta]
mycelium_spore = "<GENERATED_MAINNET_SPORE_ID>"
mycelium_hypha = "<GENERATED_MAINNET_HYPHA_ID>"
mycelium_rhizome = "<GENERATED_MAINNET_RHIZOME_ID>"
mycelium_meridian = "<GENERATED_MAINNET_MERIDIAN_ID>"
mycelium_drp = "<GENERATED_MAINNET_DRP_ID>"
```

### Squads Multisig Architecture

```
Squads Multisig (2-of-3)
├── Member 1: Aji Pratomo (Proposer + Voter + Executor = 7)
├── Member 2: Trusted Team Member (Voter = 2)
├── Member 3: Trusted Team Member (Voter = 2)
│
├── Vault 0 (default): Holds SOL for deployment costs
│
└── Upgrade Authority for:
    ├── mycelium_spore (mainnet)
    ├── mycelium_hypha (mainnet)
    ├── mycelium_rhizome (mainnet)
    ├── mycelium_meridian (mainnet)
    └── mycelium_drp (mainnet)
```

### Anti-Patterns to Avoid

- **Single-key upgrade authority on mainnet:** One compromised key = entire protocol compromised. Always multisig.
- **Deploying unverified builds:** If anyone can't reproduce your exact bytecode from source, trust is zero.
- **Using devnet program IDs on mainnet:** Cross-program references (DRP->Spore, Spore->DRP) break silently with wrong IDs.
- **Skipping buffer-based deployment:** Always deploy via buffer account so you can verify before activating.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multisig governance | Custom multisig program | Squads v4 | Battle-tested, $10B+ secured, web UI, CLI, SDK, GitHub Actions integration |
| Verifiable builds | Custom Docker build scripts | solana-verify + GitHub Actions | Industry standard, OtterSec-audited, Anchor 0.32+ native support |
| CI/CD pipeline | Custom shell scripts | solana-developers/github-workflows | Handles build, deploy, IDL upload, verify, Squads integration in one workflow |
| Rent calculation | Manual byte counting | `solana rent <bytes>` CLI | Accounts for current rent parameters, no math errors |
| Program keypair generation | Vanity addresses or manual | `solana-keygen new -o <path>` | Cryptographically secure, standard format |

## Common Pitfalls

### Pitfall 1: Cross-Program ID Circular Dependency
**What goes wrong:** Spore needs DRP's authority PDA (derived from DRP program ID). DRP needs Spore's program ID (hardcoded bytes). Both need to be compiled with the other's ID.
**Why it happens:** Cross-program references create a compile-order dependency.
**How to avoid:** Generate ALL mainnet keypairs FIRST. Then update ALL program source files with the correct IDs. Then build. The IDs are known before compilation because they come from keypairs, not from deployment.
**Warning signs:** `declare_id!` mismatches between Anchor.toml and lib.rs, or DRP_AUTHORITY still showing `[0u8; 32]`.

### Pitfall 2: Deploying anchor build Output Instead of solana-verify build
**What goes wrong:** `anchor build` on your local machine produces non-deterministic bytecode. You deploy it. Later, `anchor verify` or `solana-verify verify-from-repo` fails because no one can reproduce the exact same binary.
**Why it happens:** Local builds use the host system's toolchain, which differs from the Docker container used for verification.
**How to avoid:** ONLY deploy the .so file produced by `solana-verify build` (Docker-based). The GitHub Actions workflow handles this automatically.
**Warning signs:** Verification fails after deployment, hash mismatch errors.

### Pitfall 3: Insufficient SOL for Multi-Program Deployment
**What goes wrong:** Deployment transaction fails partway through because deployer wallet runs out of SOL.
**Why it happens:** 5 programs at ~100-300KB each requires 3-15 SOL for rent + buffer + tx fees. Deployer wallet may not have enough.
**How to avoid:** Calculate total cost BEFORE deployment. Fund deployer wallet with 2x estimated cost as buffer.
**Warning signs:** "Insufficient funds" errors during `solana program deploy`.

### Pitfall 4: Losing Upgrade Authority Before Transfer
**What goes wrong:** Setting upgrade authority to the Squads multisig PDA before the Squads multisig is properly configured.
**Why it happens:** Rushing the authority transfer without verifying the multisig works.
**How to avoid:** (1) Create Squads multisig, (2) Verify all members can sign, (3) Do a test transaction in the multisig, (4) THEN transfer upgrade authority.
**Warning signs:** Cannot upgrade programs after authority transfer, "unauthorized" errors in Squads.

### Pitfall 5: Forgetting to Update TypeScript Adapters
**What goes wrong:** Programs deployed to mainnet but TypeScript code still references devnet program IDs.
**Why it happens:** Program IDs hardcoded in multiple places (lib.rs, IDL JSON, adapter constructors, env vars).
**How to avoid:** Use environment variables for program IDs in adapters. Maintain a single source of truth (Anchor.toml) and derive everything from it.
**Warning signs:** "Account not found" errors when connecting to mainnet, transactions sent to wrong programs.

## Code Examples

### Generate Mainnet Program Keypairs

```bash
# Generate keypairs for all 5 programs
for prog in mycelium_spore mycelium_hypha mycelium_rhizome mycelium_meridian mycelium_drp; do
  solana-keygen new --no-bip39-passphrase -o "C:/solana-keys/${prog}-mainnet-keypair.json"
  echo "$prog mainnet ID: $(solana address -k C:/solana-keys/${prog}-mainnet-keypair.json)"
done
```

### Transfer Upgrade Authority to Squads

```bash
# After deploying all programs and verifying the Squads multisig works:
SQUADS_VAULT="<SQUADS_VAULT_PDA_ADDRESS>"

for prog_id in <SPORE_ID> <HYPHA_ID> <RHIZOME_ID> <MERIDIAN_ID> <DRP_ID>; do
  solana program set-upgrade-authority $prog_id \
    --new-upgrade-authority $SQUADS_VAULT \
    --keypair C:/solana-keys/id.json \
    -u mainnet-beta
done
```

### GitHub Actions Workflow (mainnet deployment)

```yaml
# .github/workflows/mainnet-deploy.yml
name: Mainnet Deploy

on:
  workflow_dispatch:
    inputs:
      program:
        description: "Program to deploy"
        required: true
        type: choice
        options:
          - mycelium_spore
          - mycelium_hypha
          - mycelium_rhizome
          - mycelium_meridian
          - mycelium_drp
      priority_fee:
        description: "Priority fee (microlamports)"
        required: true
        default: "300000"

jobs:
  build-deploy:
    uses: solana-developers/github-workflows/.github/workflows/reusable-build.yaml@v0.2.9
    with:
      program: ${{ github.event.inputs.program }}
      program-id: "<PROGRAM_ID_FOR_SELECTED_PROGRAM>"
      network: "mainnet"
      deploy: true
      upload_idl: true
      verify: true
      use-squads: true
      priority-fee: ${{ github.event.inputs.priority_fee }}
    secrets:
      MAINNET_SOLANA_DEPLOY_URL: ${{ secrets.MAINNET_SOLANA_DEPLOY_URL }}
      MAINNET_DEPLOYER_KEYPAIR: ${{ secrets.MAINNET_DEPLOYER_KEYPAIR }}
      PROGRAM_ADDRESS_KEYPAIR: ${{ secrets.PROGRAM_ADDRESS_KEYPAIR }}
      MAINNET_MULTISIG: ${{ secrets.MAINNET_MULTISIG }}
      MAINNET_MULTISIG_VAULT: ${{ secrets.MAINNET_MULTISIG_VAULT }}
```

### Compute DRP Authority PDA (TypeScript)

```typescript
// After DRP program is deployed with its mainnet ID:
import { PublicKey } from '@solana/web3.js';

const DRP_PROGRAM_ID = new PublicKey('<MAINNET_DRP_PROGRAM_ID>');
const [drpAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from('drp_authority')],
  DRP_PROGRAM_ID
);
console.log('DRP Authority PDA:', drpAuthority.toBase58());
// This value goes into Spore's DRP_AUTHORITY constant as [u8; 32]
```

### Cost Estimation

```bash
# Per-program deployment cost (estimate based on typical Anchor program sizes)
# Small program (~50KB): solana rent 50000 = 0.349 SOL
# Medium program (~150KB): solana rent 150000 = 1.045 SOL
# Large program (~300KB): solana rent 300000 = 2.089 SOL

# 5 programs estimated total (assuming medium average):
# 5 * 1.045 = ~5.23 SOL for program accounts
# + buffer accounts (equal size, reclaimable) = ~5.23 SOL
# + transaction fees (~0.01 SOL)
# Total needed: ~10.5 SOL (~$890 at $85/SOL)
# Recommended: Fund deployer with 15 SOL (~$1,275)

# Per IP registration cost (user-facing):
# IPAsset PDA (352 bytes): solana rent 352 = 0.00334 SOL
# ContentHashRegistry PDA (73 bytes): solana rent 73 = 0.00140 SOL
# Transaction fee: ~0.000005 SOL
# Total per registration: ~0.00474 SOL (~$0.40 at $85/SOL)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| anchor verify (Docker-based, custom) | solana-verify (standardized) | Anchor 0.32.0 (2025) | Industry-standard verification, OtterSec-audited |
| Manual program deploy + manual Squads | GitHub Actions CI/CD + auto-Squads proposal | 2025 | Automated build-deploy-verify-propose pipeline |
| 2x program size rent for deployment | 1x program size rent | SIMD-0436 (2025) | Halved deployment costs |
| SPL multisig | Squads v4 | 2024 | Web UI, program upgrade workflows, time locks |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Solana CLI | Deployment, rent calc, authority transfer | Yes | 3.1.13 (Agave) | -- |
| Anchor CLI | Build, IDL generation | Yes | 0.32.1 | -- |
| cargo-build-sbf | Program compilation | Yes | (bundled with Solana CLI) | -- |
| Docker | Verifiable builds (solana-verify) | **NO** | -- | GitHub Actions CI/CD (has Docker) |
| solana-verify | Deterministic builds + verification | **NO** | -- | `cargo install solana-verify` or GitHub Actions |
| WSL | Linux build environment | Partially (binary exists, no distro installed) | -- | GitHub Actions |
| GitHub Actions | CI/CD for builds | Yes (via gh CLI + GitHub repo) | -- | -- |
| Squads v4 web UI | Multisig creation + management | Yes (app.squads.so) | -- | squads-multisig-cli |
| Deployer keypair | Signing transactions | Yes | F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye | -- |
| Mainnet SOL | Deployment funding | Unknown | -- | Must fund deployer wallet |
| Mainnet RPC | Transaction submission | Unknown | -- | Use paid RPC (Helius, QuickNode) |

**Missing dependencies with no fallback:**
- Mainnet SOL funding -- deployer wallet must be funded with ~15 SOL before deployment
- Paid mainnet RPC endpoint -- public mainnet RPC has aggressive rate limits, not suitable for deployment

**Missing dependencies with fallback:**
- Docker -- not installed locally, but GitHub Actions provides Docker environment for verifiable builds
- solana-verify -- not installed, can `cargo install solana-verify` or rely on GitHub Actions
- WSL -- binary exists but no distribution; not needed if using GitHub Actions for builds

## Open Questions

1. **Who are the 3 multisig members?**
   - What we know: Aji Pratomo is one. 2-of-3 minimum threshold.
   - What's unclear: Identity of members 2 and 3. Could be team members, advisors, or hardware wallets.
   - Recommendation: Aji decides. At minimum, use separate hardware wallets for each member.

2. **Should mainnet use the SAME program IDs as devnet?**
   - What we know: You CAN reuse keypairs, but standard practice is fresh keypairs for mainnet.
   - What's unclear: Whether there's value in ID continuity across networks.
   - Recommendation: Generate fresh mainnet keypairs. Devnet IDs are "burned" by testing.

3. **Paid RPC endpoint for mainnet?**
   - What we know: Public mainnet RPC is rate-limited. Deployment and ongoing operations need reliable RPC.
   - What's unclear: Budget allocation for RPC service.
   - Recommendation: Helius or QuickNode. Free tiers may suffice initially. ~$50/month for paid tier.

4. **Has anchor build ever been run successfully on this codebase?**
   - What we know: IDLs were hand-crafted. Programs were never compiled via `anchor build`. Anchor CLI IS now available (0.32.1).
   - What's unclear: Whether the programs compile successfully. There may be Rust compilation errors.
   - Recommendation: First task in Phase 4 should be running `anchor build` locally (or in CI) to validate compilation. Fix any errors before mainnet deployment.

5. **DRP placeholder ID (Fg6PaF...) -- is it deployed anywhere?**
   - What we know: This is the Anchor example/default program ID. It's not a real DRP deployment.
   - What's unclear: Whether any devnet state references this ID.
   - Recommendation: Generate proper keypair for DRP on both devnet and mainnet. The Fg6PaF ID must never be used.

## Sources

### Primary (HIGH confidence)
- Squads v4 documentation (docs.squads.so) -- multisig creation, program management, CLI commands, authority transfer
- Solana official docs (solana.com/docs/programs/verified-builds) -- verifiable builds process, solana-verify CLI
- Anchor documentation (anchor-lang.com/docs/references/verifiable-builds) -- Docker-based builds, Anchor 0.32+ solana-verify integration
- Solana CLI local (`solana rent` command) -- rent-exempt calculations verified against live parameters
- Local environment probing -- Solana CLI 3.1.13, Anchor CLI 0.32.1, cargo-build-sbf confirmed available

### Secondary (MEDIUM confidence)
- solana-developers/github-workflows (GitHub) -- CI/CD workflow for automated build+deploy+verify+Squads
- Squads-Protocol/squads-v4-program-upgrade (GitHub) -- GitHub Action for Squads-integrated deployments
- SOL price data (multiple sources) -- ~$85 USD in April 2026

### Tertiary (LOW confidence)
- Typical Anchor program sizes (100-300KB) -- estimated from general knowledge, not measured from this specific codebase. Actual sizes will be known after first successful `anchor build`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Squads v4 and solana-verify are the industry standard, well-documented
- Architecture: HIGH -- deployment flow is well-established in Solana ecosystem
- Cost estimation: HIGH for per-registration cost (calculated from Solana CLI), MEDIUM for deployment cost (program sizes unknown until built)
- Pitfalls: HIGH -- cross-program ID dependency and verification are well-known issues

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain -- Squads v4 and Solana deployment process are mature)
