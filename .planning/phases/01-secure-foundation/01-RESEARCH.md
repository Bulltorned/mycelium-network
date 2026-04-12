# Phase 1: Secure Foundation - Research

**Researched:** 2026-04-12
**Domain:** Solana/Anchor on-chain program security hardening, schema migration, IDL client generation
**Confidence:** HIGH

## Summary

Phase 1 addresses the three foundational concerns that block all downstream work: (1) six security vulnerabilities across 4 Anchor programs that would make the protocol exploitable on mainnet, (2) a 32-byte schema drift between the deployed Spore program and its TypeScript consumers caused by a missing `original_creator` field, and (3) three manual Borsh deserializers that must be replaced with a single generated Anchor IDL client to eliminate an entire class of silent data corruption bugs.

The work breaks into three plans: security hardening across all 4 programs (SEC-01 through SEC-05), schema alignment with IDL client generation (SCH-01 through SCH-06), and end-to-end registration verification (REG-01 through REG-06). The dependency order matters -- security fixes and schema changes require `anchor build` and redeployment to devnet, which must happen before the IDL client can be generated. Registration verification is the integration test that proves the first two plans worked.

**Primary recommendation:** Fix the Spore program first (add `original_creator`, fix `UpdateStatus` authority constraint), then fix Hypha, Rhizome, and Meridian in parallel. Generate the IDL client from the rebuilt programs and replace all manual deserializers. Verify with an end-to-end registration + transfer + status check flow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | UpdateStatus constrained to protocol authority or DRP program | Pitfall 1: Unconstrained authorities. Fix with `constraint = authority.key() == ip_asset.creator` until DRP exists. See Architecture Patterns section. |
| SEC-02 | Meridian GenerateMEP verifies Ed25519 protocol signature | Pitfall 3: Unverified signatures. Use `ed25519_program` precompile. See Code Examples section. |
| SEC-03 | Hypha CreateLicenseTemplate validates ip_asset is real IPAsset PDA | Pitfall 2: UncheckedAccount. Replace with `Account<'info, IPAsset>` via CPI or verify `owner == spore_program::ID`. |
| SEC-04 | Rhizome DistributeRoyalties verifies platform_wallet and recipients against config | Pitfall 1: Unconstrained drain address. Store platform_wallet in RoyaltyConfig, add `has_one` constraint. |
| SEC-05 | SolanaLiveAdapter fails fast on invalid keypair at startup | Move keypair validation to constructor. See Code Examples section. |
| SCH-01 | Spore redeployed with `original_creator` field | Pitfall 4: Schema drift. Add field, update PDA seeds. See Architecture Patterns section. |
| SCH-02 | All 3 manual Borsh deserializers replaced with IDL client | Pitfall 6: Manual deserializer divergence. Use `@coral-xyz/anchor@0.30.1` program.account.ipAsset.fetch(). |
| SCH-03 | Instruction discriminator mismatch resolved via shared IDL | Two hardcoded discriminators with different values. IDL client eliminates both. |
| SCH-04 | Stale root `mycelium_spore_lib.rs` deleted | Single source of truth: `programs/mycelium-spore/src/lib.rs` only. |
| SCH-05 | Account size calculation updated for `original_creator` (352 bytes) | Add 32 bytes for Pubkey. Update `space = 8 + IPAsset::INIT_SPACE` (InitSpace handles it automatically). |
| SCH-06 | Existing devnet accounts migrated or wiped | Decision needed: realloc migration instruction vs wipe devnet and re-register. Wipe is simpler for devnet. |
| REG-01 | Register any creative work with SHA-256 hash, metadata URI, IP type, WIPO fields | Already functional in deployed program. Verify after schema change. |
| REG-02 | Registration produces immutable PoH timestamp | Already functional. `registration_slot` and `registration_timestamp` set from `Clock::get()`. |
| REG-03 | Register derivative works linked to parent IP | `register_derivative` instruction exists. Verify after schema change. |
| REG-04 | Transfer ownership without breaking PDA derivation | BROKEN in current program. `original_creator` fix resolves this. |
| REG-05 | Duplicate content hash rejected at registration | Already enforced by PDA seeds -- same creator + same hash = same PDA = Anchor init fails. |
| REG-06 | All 11 IP types supported | 11 variants in `IPType` enum confirmed. Verify via registration test. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anchor-lang (Rust) | 0.30.1 (exact) | On-chain program framework | Programs deployed to devnet with this version. Must not change. |
| @coral-xyz/anchor (TS) | 0.30.1 (exact) | IDL-based typed client | Must match on-chain Anchor version. Replaces all 3 manual deserializers. |
| @solana/web3.js | ^1.98.0 (v1) | RPC, transactions, keypairs | Anchor 0.30.x TS client requires v1. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ts-mocha + chai | latest | Anchor integration tests | Testing program constraint fixes against devnet/localnet |
| anchor-cli | 0.30.1 (for build) | Build programs, generate IDL | Must build with 0.30.1 CLI, not the locally installed 0.32.1 |

### Build Environment Warning

**CRITICAL: Anchor CLI version mismatch detected.**
- Installed locally: `anchor-cli 0.32.1`
- Required by programs: `anchor-lang 0.30.1`
- Solana CLI: NOT installed
- WSL: NOT available

Building with Anchor CLI 0.32.1 against `anchor-lang 0.30.1` Cargo dependency should work (CLI is backward-compatible for `anchor build`), but the generated IDL format may differ. The IDL JSON structure changed in 0.31+ (added `metadata`, changed discriminator format).

**Resolution options (pick one):**
1. **Use installed 0.32.1 CLI** -- `anchor build` will compile with the Cargo.toml-pinned 0.30.1 crate. The generated IDL should be in 0.30.1 format because the IDL is derived from the Rust code's Anchor version, not the CLI version. Test this first.
2. **Install Anchor CLI 0.30.1 via `cargo install anchor-cli@0.30.1`** -- guarantees exact match but takes ~10 minutes to compile.
3. **Install Solana CLI** -- required for `anchor test` and `solana program deploy`. Install via `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` or download Windows binary from Solana releases.

**Solana CLI is required** regardless -- `anchor build` needs `solana-keygen` and `solana program deploy` needs Solana CLI. This is a blocking dependency.

## Architecture Patterns

### Pattern 1: Adding `original_creator` to IPAsset (SCH-01)

**What:** Add an immutable `original_creator: Pubkey` field to `IPAsset`, set at registration, never changed. Use it in PDA seeds instead of `creator`.

**Why critical:** Currently, PDA seeds use `ip_asset.creator`. After `transfer_ownership` changes `creator` to the new owner, every subsequent instruction that validates PDA seeds (UpdateMetadata, TransferOwnership, UpdateStatus) will FAIL because the seeds no longer match the PDA address. This makes ownership transfer a one-shot operation that permanently breaks all future interactions with the asset.

**The fix:**
```rust
#[account]
#[derive(InitSpace)]
pub struct IPAsset {
    pub original_creator: Pubkey,  // NEW -- immutable, used in PDA seeds
    pub creator: Pubkey,           // Current owner, mutable on transfer
    pub content_hash: [u8; 32],
    // ... rest unchanged
}

// All PDA seeds change from:
//   seeds = [SEED_IP_ASSET, ip_asset.creator.as_ref(), &ip_asset.content_hash]
// To:
//   seeds = [SEED_IP_ASSET, ip_asset.original_creator.as_ref(), &ip_asset.content_hash]

// RegisterIP sets both:
ip_asset.original_creator = ctx.accounts.creator.key();
ip_asset.creator = ctx.accounts.creator.key();

// TransferOwnership only changes creator:
ip_asset.creator = new_owner_key;
// original_creator stays unchanged -- PDA derivation never breaks
```

**Impact on PDA derivation everywhere:**
- `RegisterIP`: seeds use `creator.key()` (which becomes `original_creator` value) -- no change needed in init
- `RegisterDerivative`: same as RegisterIP
- `UpdateMetadata`: change seeds to use `original_creator`
- `TransferOwnership`: change seeds to use `original_creator`, change constraint from `ip_asset.creator` to `ip_asset.creator` for auth check (still checks current owner)
- `UpdateStatus`: change seeds to use `original_creator`
- TypeScript `findIPAssetPDA`: parameter name stays `originalCreator` (already named correctly in live adapter)

### Pattern 2: Authority Constraints on Privileged Instructions (SEC-01, SEC-04)

**What:** Bind every `Signer` to the expected authority stored in the relevant PDA.

**UpdateStatus fix (SEC-01):**
```rust
#[derive(Accounts)]
pub struct UpdateStatus<'info> {
    #[account(
        mut,
        seeds = [SEED_IP_ASSET, ip_asset.original_creator.as_ref(), &ip_asset.content_hash],
        bump = ip_asset.bump,
    )]
    pub ip_asset: Account<'info, IPAsset>,
    // Until DRP program exists, only the current owner can update status
    #[account(
        constraint = authority.key() == ip_asset.creator @ MyceliumError::Unauthorized
    )]
    pub authority: Signer<'info>,
}
```

**Rhizome DistributeRoyalties fix (SEC-04):**
```rust
// Step 1: Add platform_wallet to RoyaltyConfig (set at configure_royalty time)
pub struct RoyaltyConfig {
    // ... existing fields ...
    pub platform_wallet: Pubkey,  // NEW -- set once, verified at distribution
}

// Step 2: Constrain distribution accounts
#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    #[account(
        mut,
        seeds = [SEED_ROYALTY_CONFIG, royalty_config.ip_asset.as_ref()],
        bump = royalty_config.bump,
    )]
    pub royalty_config: Account<'info, RoyaltyConfig>,
    #[account(
        mut,
        seeds = [SEED_ROYALTY_VAULT, royalty_config.key().as_ref()],
        bump,
    )]
    pub royalty_vault: SystemAccount<'info>,
    // Constrained to the wallet stored in config
    #[account(
        mut,
        constraint = platform_wallet.key() == royalty_config.platform_wallet @ RhizomeError::Unauthorized
    )]
    pub platform_wallet: SystemAccount<'info>,
    // Caller must be the config creator (IP owner)
    #[account(
        constraint = caller.key() == royalty_config.creator @ RhizomeError::Unauthorized
    )]
    pub caller: Signer<'info>,
}
```

### Pattern 3: Cross-Program Account Verification (SEC-03)

**What:** Replace `UncheckedAccount` with verified account ownership for cross-program references.

**Hypha CreateLicenseTemplate fix (SEC-03):**

Two approaches, from simplest to most robust:

**Option A: Owner check (simplest, recommended for Phase 1):**
```rust
/// CHECK: Validated by owner constraint — must be owned by Spore program
#[account(owner = mycelium_spore::ID)]
pub ip_asset: AccountInfo<'info>,
```

**Option B: Full typed account via CPI (most robust, requires Spore crate import):**
```rust
// In Cargo.toml:
// mycelium-spore = { path = "../mycelium-spore", features = ["cpi"] }

// In instruction context:
pub ip_asset: Account<'info, mycelium_spore::IPAsset>,
```

Option B is preferred because it also gives access to `ip_asset.status` for an Active check. The `cpi` feature flag is already declared in Spore's `Cargo.toml`.

### Pattern 4: Ed25519 Signature Verification (SEC-02)

**What:** Verify the protocol authority's Ed25519 signature on the MEP package hash before storing it on-chain.

**Approach:** Solana's Ed25519 precompile (`Ed25519SigVerify111111111111111111111111111`) must be invoked as a preceding instruction in the same transaction. The Meridian program then checks the instruction sysvar to confirm the verification happened.

```rust
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;

// In the GenerateMEP instruction context, add:
/// CHECK: Instructions sysvar for Ed25519 verification
#[account(address = ix_sysvar::ID)]
pub instructions_sysvar: AccountInfo<'info>,

// In the generate_mep function body, add:
// Verify Ed25519 signature was checked in a preceding instruction
let ix = ix_sysvar::load_instruction_at_checked(
    0, // Ed25519 verify must be the first instruction
    &ctx.accounts.instructions_sysvar,
)?;
require!(
    ix.program_id == ed25519_program::ID,
    MeridianError::MissingEd25519Verification
);
// Parse the Ed25519 instruction data to verify it matches our package_hash
// and protocol authority pubkey
```

**Client-side transaction construction:**
```typescript
import { Ed25519Program } from "@solana/web3.js";

const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
  privateKey: protocolAuthorityKeypair.secretKey,
  message: packageHash,
});

const generateMepIx = await program.methods
  .generateMep(packageHash, arweaveUri, protocolSignature, ...)
  .accounts({ ... })
  .instruction();

const tx = new Transaction().add(ed25519Ix, generateMepIx);
```

**Complexity note:** This is the most complex fix in Phase 1. The Ed25519 precompile interaction is non-trivial. If implementation proves too complex, an intermediate step is to store the protocol authority pubkey in a `ProtocolConfig` PDA and require the authority to be a signer on the generate_mep instruction (simpler but less cryptographically rigorous).

### Anti-Patterns to Avoid

- **Do NOT use realloc for devnet migration (SCH-06):** For devnet, wipe accounts and re-register. Realloc migration adds complexity for test data that has no production value.
- **Do NOT change PDA seed structure for existing accounts:** The `original_creator` field must be the SAME value as the current `creator` for all existing accounts. Since we're wiping devnet, this is moot -- but document it for mainnet migration planning.
- **Do NOT upgrade Anchor to 0.31+ for the Migration type:** Stay on 0.30.1. Use manual realloc if needed. The Migration type is a 0.31 feature.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Account deserialization | Manual Borsh byte-offset parsers | `@coral-xyz/anchor` IDL client `program.account.ipAsset.fetch()` | 3 manual deserializers already have bugs (Option padding, enum padding, 32-byte offset from missing field). IDL client eliminates the entire bug class. |
| Instruction discriminators | Hardcoded `[0x47, 0x97, ...]` byte arrays | `program.methods.registerIp(...)` | Two files have different discriminator values. IDL client computes them from the canonical source. |
| PDA derivation | Duplicated `findProgramAddressSync` calls | Shared `packages/common/src/pda.ts` (or at minimum, one shared function) | Currently duplicated in `src/solana-live-adapter.ts` and `app/src/lib/pda.ts` with risk of divergence after `original_creator` change. |
| Ed25519 verification | Custom signature check | `Ed25519Program.createInstructionWithPrivateKey` + precompile | Cryptographic verification must use the battle-tested Solana precompile, not custom code. |

## Common Pitfalls

### Pitfall 1: Anchor CLI 0.32.1 vs anchor-lang 0.30.1 IDL Format

**What goes wrong:** The locally installed Anchor CLI (0.32.1) may generate IDL JSON in 0.31+ format (with `metadata` section, variable-length discriminators). The `@coral-xyz/anchor@0.30.1` TS client expects 0.30.x IDL format.

**Why it happens:** Anchor CLI 0.32.1 knows about both formats but the output format depends on the Rust crate version. In theory, it should detect `anchor-lang = "0.30.1"` in Cargo.toml and produce the correct format.

**How to avoid:** After `anchor build`, inspect the generated IDL JSON in `target/idl/mycelium_spore.json`. Check if it has `"metadata"` at the top level (0.31+ format) or not (0.30.x format). If the format is wrong, install `anchor-cli@0.30.1` and rebuild.

**Warning signs:** TypeScript compilation errors when importing IDL, or runtime "Invalid discriminator" errors when calling program methods.

### Pitfall 2: PDA Seeds After original_creator Addition

**What goes wrong:** After adding `original_creator` and changing PDA seeds, the `RegisterIP` instruction's init seeds MUST use `creator.key()` (the signer), not `ip_asset.original_creator` (which doesn't exist yet during init). But all subsequent instructions use `ip_asset.original_creator`.

**How to avoid:** In `RegisterIP` context: `seeds = [SEED_IP_ASSET, creator.key().as_ref(), &content_hash]`. In all other contexts: `seeds = [SEED_IP_ASSET, ip_asset.original_creator.as_ref(), &ip_asset.content_hash]`. The value is the same -- just accessed differently.

### Pitfall 3: Solana CLI Missing

**What goes wrong:** `anchor build` may work (it uses cargo under the hood), but `anchor test` and `anchor deploy` require Solana CLI for keypair management and program deployment.

**How to avoid:** Install Solana CLI before starting execution. Without it, programs cannot be deployed to devnet after modification.

### Pitfall 4: TransferOwnership constraint after original_creator change

**What goes wrong:** After changing seeds to use `original_creator`, the `TransferOwnership` constraint still needs to verify that `current_owner` is the current `creator` (not the `original_creator`). Don't confuse PDA derivation (uses `original_creator`) with authorization (uses `creator`).

**How to avoid:** Keep two separate concerns clear:
- PDA seeds: always `original_creator` (immutable, for address derivation)
- Auth check: always `creator` (mutable, for "who is the current owner")

### Pitfall 5: Hypha CPI Import Circular Dependency

**What goes wrong:** If Hypha imports Spore via `[dependencies] mycelium-spore = { path = "../mycelium-spore", features = ["cpi"] }`, and Spore later needs to import Hypha, you get a circular Cargo dependency.

**How to avoid:** Only Hypha imports Spore (one direction). Spore should never need to call Hypha. If bidirectional CPI is ever needed, extract shared types into a separate crate.

## Code Examples

### Keypair Fail-Fast Validation (SEC-05)

```typescript
// In SolanaLiveAdapter constructor
constructor(rpcUrl: string, keypairPath?: string) {
  // Validate keypair IMMEDIATELY -- fail before accepting connections
  const resolvedPath = keypairPath ?? resolve(homedir(), "solana-keys", "id.json");
  
  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Keypair file not found at ${resolvedPath}. ` +
      `Set SOLANA_KEYPAIR_PATH or create the file.`
    );
  }
  
  try {
    const raw = readFileSync(resolvedPath, "utf-8");
    const secretKey = Uint8Array.from(JSON.parse(raw));
    this.payer = Keypair.fromSecretKey(secretKey);
  } catch (err) {
    throw new Error(
      `Invalid keypair at ${resolvedPath}: ${(err as Error).message}`
    );
  }
  
  // Only after successful validation, continue setup
  this.connection = new Connection(rpcUrl, "confirmed");
  console.error(`Payer: ${this.payer.publicKey.toBase58()}`);
}
```

### IDL Client Setup (SCH-02)

```typescript
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import sporeIdl from "../target/idl/mycelium_spore.json";
import { MyceliumSpore } from "../target/types/mycelium_spore";

// Setup provider
const connection = new Connection(rpcUrl, "confirmed");
const wallet = new Wallet(payerKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

// Create typed program client
const sporeProgram = new Program<MyceliumSpore>(
  sporeIdl as MyceliumSpore,
  provider
);

// Fetch account -- replaces ALL manual deserializers
const ipAsset = await sporeProgram.account.ipAsset.fetch(pdaAddress);
// ipAsset is fully typed: ipAsset.creator, ipAsset.contentHash, etc.

// Call instruction -- replaces manual discriminator encoding
await sporeProgram.methods
  .registerIp(contentHash, perceptualHash, ipType, metadataUri, ...)
  .accounts({ ipAsset: pda, creator: wallet.publicKey, systemProgram: SystemProgram.programId })
  .rpc();
```

### Duplicate Content Hash Rejection Verification (REG-05)

```typescript
// The PDA derivation seeds = [SEED_IP_ASSET, creator, content_hash]
// If same creator registers same content_hash, Anchor init fails with
// "Account already initialized" because the PDA already exists.
// 
// If DIFFERENT creator registers same content_hash, PDA is different
// (different seeds) -- this is ALLOWED. Two creators can register
// the same content hash independently.
//
// To reject ALL duplicates regardless of creator, add a separate
// content_hash_registry PDA seeded only by content_hash:
//   seeds = [b"content_hash", &content_hash]
// 
// DECISION NEEDED: Does REG-05 mean per-creator or global uniqueness?
// Current behavior: per-creator (same creator, same hash rejected).
// If global: need a new PDA type seeded by content_hash only.
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Anchor CLI | Building programs, generating IDL | Yes | 0.32.1 (MISMATCH: programs need 0.30.1) | Install 0.30.1 via cargo, or test if 0.32.1 produces compatible output |
| Solana CLI | Deploying programs, running tests | No | -- | MUST INSTALL. No fallback. |
| Rust/Cargo | Compiling Anchor programs | Yes | 1.94.0 | -- |
| Node.js | Running MCP server, TS tests | Yes | v24.12.0 | -- |
| npm | Package management | Yes | 11.6.2 | -- |
| WSL | Alternative build environment | No | -- | Not needed if Anchor CLI works on Windows |

**Missing dependencies with no fallback:**
- Solana CLI -- required for `anchor test`, `solana program deploy`, `solana-keygen`. Install via: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` or download Windows binaries.

**Missing dependencies with fallback:**
- Anchor CLI 0.30.1 -- installed version is 0.32.1. Test if 0.32.1 produces 0.30.x-compatible IDL first. If not, install 0.30.1 via `cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli`.

## Open Questions

1. **REG-05 Uniqueness Scope**
   - What we know: PDA seeds include creator + content_hash, so same-creator duplicates are rejected by Anchor init.
   - What's unclear: Does REG-05 mean ANY duplicate (global uniqueness) or per-creator uniqueness? If global, a separate `ContentHashRegistry` PDA is needed.
   - Recommendation: Interpret as global uniqueness (the requirement says "duplicate content hash rejected at registration time" without scoping to a creator). Add a `content_hash_registry` PDA seeded by `[b"content_hash_index", &content_hash]` that is init'd alongside the IPAsset.

2. **SCH-06 Devnet Migration Strategy**
   - What we know: Adding `original_creator` changes the account layout. Existing devnet accounts don't have this field.
   - What's unclear: Are there existing devnet registrations with real test data that should be preserved?
   - Recommendation: Wipe devnet accounts (close and re-register). Devnet data has no production value. Document this decision. If any accounts need preservation, use a migration instruction with realloc.

3. **Anchor CLI Compatibility**
   - What we know: CLI 0.32.1 installed, programs use crate 0.30.1. CLI is generally backward-compatible for builds.
   - What's unclear: Whether the generated IDL JSON format will be 0.30.x or 0.31+ format.
   - Recommendation: Run `anchor build` first thing in Plan 01-02. Inspect output IDL. If format is wrong, install CLI 0.30.1.

4. **SEC-02 Complexity vs Timeline**
   - What we know: Full Ed25519 precompile verification is the correct approach but complex.
   - What's unclear: Whether this should block Phase 1 completion or be simplified.
   - Recommendation: Implement the full Ed25519 precompile approach. It's 50-80 lines of code in the program + 10 lines on the client side. The alternative (just requiring protocol authority as signer) is simpler but doesn't provide the cryptographic verification the evidence packages claim.

## Sources

### Primary (HIGH confidence)
- Codebase analysis (CONCERNS.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md) -- direct code inspection, 2026-04-07
- Anchor 0.30.1 source: `anchor-lang = "0.30.1"` in all 4 program Cargo.toml files
- Solana Ed25519 precompile: standard Solana program verification pattern
- Prior research (SUMMARY.md, PITFALLS.md, STACK.md, ARCHITECTURE.md) -- thorough ecosystem research, 2026-04-12

### Secondary (MEDIUM confidence)
- Anchor CLI backward compatibility -- based on Anchor release notes and standard practice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- brownfield, versions verified from Cargo.toml and package.json
- Architecture: HIGH -- fixes are standard Anchor constraint patterns, well-documented
- Pitfalls: HIGH -- every pitfall verified against actual source code in the repo

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain, no moving targets)
