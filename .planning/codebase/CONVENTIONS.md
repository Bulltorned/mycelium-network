# Coding Conventions

**Analysis Date:** 2026-04-07

## Naming Patterns

**Files:**
- TypeScript source files: camelCase (`solana-adapter.ts`, `solana-live-adapter.ts`)
- Test files: kebab-case matching program name (`mycelium-spore.ts`, `mycelium-hypha.ts`)
- React hooks: `use-` prefix, kebab-case (`use-register-ip.ts`, `use-my-assets.ts`)
- React components: kebab-case (`wallet-provider.tsx`, `query-provider.tsx`)
- Rust programs: snake_case lib files (`lib.rs` only; program crates named `mycelium-{name}`)

**TypeScript Interfaces and Types:**
- Interfaces use PascalCase: `IPAsset`, `LicenseTemplate`, `RegisterIPParams`
- Type unions use PascalCase: `IPType`, `LicenseType`, `Jurisdiction`
- Display-layer interfaces are prefixed with `Display`: `DisplayIPAsset`, `DisplayLicenseTemplate`
- Parameter interfaces are suffixed with `Params` or `Result`: `RegisterIPParams`, `RegisterIPResult`
- Query types suffixed with `Query`: `SearchQuery`

**Functions:**
- camelCase throughout TypeScript: `registerIP`, `findIPAssetPDA`, `loadKeypair`, `hexToBytes`, `bytesToHex`
- React hooks: `useRegisterIP`, `useMyAssets`
- Rust functions: snake_case: `register_ip`, `find_ip_asset_pda`, `ip_type_to_anchor`
- Private helpers in TypeScript classes: camelCase with no prefix (no underscore convention)

**Variables:**
- camelCase in TypeScript
- snake_case in Rust
- Constants: SCREAMING_SNAKE_CASE in both TypeScript (`AGENT_ID`, `SEED_IP_ASSET`, `MAX_URI_LENGTH`) and Rust (`SEED_IP_ASSET`, `MAX_URI_LENGTH`)

**Rust Enum Variants:**
- PascalCase variants: `LiteraryWork`, `VisualArt`, `CharacterIP`, `AIGenerated`
- TypeScript mirrors use camelCase keys: `literaryWork`, `visualArt`, `characterIp`, `aiGenerated`
- Anchor passes enum variants as `{ variantName: {} }` objects: `{ visualArt: {} }`

## Code Style

**Formatting:**
- TypeScript: no explicit prettier config detected — inferred from consistent 2-space indentation
- Rust: standard `rustfmt` (inferred from consistent formatting in all `lib.rs` files)
- String quotes: double quotes throughout TypeScript

**Linting:**
- TypeScript: `strict: true` in `tsconfig.json` — enforces no implicit any, strict null checks
- Rust: standard clippy (inferred — no explicit config found)

**TypeScript Compiler Options (from `tsconfig.json`):**
- Target: `ES2022`
- Module: `NodeNext` with `NodeNext` resolution
- `strict: true` — all strict checks enabled
- `declaration: true` — generates `.d.ts` files
- `resolveJsonModule: true`

## Import Organization

**TypeScript MCP server (`src/index.ts`):**
1. External SDK imports (`@modelcontextprotocol/sdk`, `zod`)
2. Internal adapters (`./solana-adapter.js`, `./solana-live-adapter.js`)
3. Internal types (`./types.js`)

**Note:** `.js` extension required in all relative imports (NodeNext module resolution).

**TypeScript React app (`app/src/`):**
1. Framework imports (`react`, `next`)
2. Solana imports (`@solana/web3.js`, `@solana/wallet-adapter-react`)
3. Internal lib imports using `@/lib/...` alias
4. Internal type imports using `@/lib/types`

**Rust:**
```rust
use anchor_lang::prelude::*;  // Always first
use anchor_lang::system_program;  // Only when needed
```
No external crate imports beyond Anchor in the four programs.

**Path Aliases (React app):**
- `@/` maps to `app/src/` — used consistently in all hooks and pages

## Zod Schema Patterns (MCP server)

Zod is used exclusively for MCP tool input validation. Enums are defined as reusable `z.enum([...])` constants at the top of `src/index.ts`:

```typescript
const ipTypeEnum = z.enum([
  "literary_work", "visual_art", "music", ...
]);
const licenseTypeEnum = z.enum([...]);
const jurisdictionEnum = z.enum([...]);
```

These are referenced by tool schemas. Do not inline enum values into individual tool schemas — define at the top.

## Error Handling

**TypeScript MCP tools:**
```typescript
async (args) => {
  try {
    const result = await adapter.someMethod(args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Operation failed: ${(err as Error).message}` }],
      isError: true,
    };
  }
}
```

**TypeScript hooks (`app/src/hooks/`):**
```typescript
try {
  // async operations
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Fallback message";
  setError(message);
  throw err;  // re-throw after setting local state
} finally {
  setIsLoading(false);
}
```

**Rust (Anchor programs):**
- All errors in `#[error_code]` enum at the bottom of each program file
- Each error has `#[msg("Human readable description")]` attribute
- Validation uses `require!()` macro: `require!(condition, ProgramError::ErrorVariant)`
- Arithmetic safety: always use `.checked_add(1).ok_or(ProgramError::Overflow)?`
- `saturating_sub` used for non-critical decrements: `template.active_licenses = template.active_licenses.saturating_sub(1)`
- Status transitions enforced via exhaustive `match` — invalid transitions return `Err`

**Error enum naming:**
- Each program has its own error enum named after the program: `MyceliumError`, `HyphaError`, `MeridianError`, `RhizomeError`
- Error variants are PascalCase descriptive names: `MetadataUriTooLong`, `InvalidContentHash`, `ParentIPNotActive`

## Async Patterns

**TypeScript:**
- All adapter methods return `Promise<T>` — always `async/await`, never raw `.then()` chains
- React hooks use `useCallback` wrapping async functions to prevent re-renders
- Solana RPC calls use `await connection.confirmTransaction(sig, "confirmed")`
- React Query (`@tanstack/react-query`) used for data fetching in the app layer with `queryKey` arrays and `refetchInterval: 30_000`

## Anchor Instruction Pattern (Rust)

Every instruction follows this structure:
1. Input validation via `require!()` macros (fail fast)
2. Get clock if timestamps needed: `let clock = Clock::get()?;`
3. Capture keys before mutable borrows: `let ip_asset_key = ctx.accounts.ip_asset.key();`
4. Get mutable account reference: `let account = &mut ctx.accounts.account_name;`
5. Set all fields
6. Cache values needed for emit: `let val = account.field;`
7. Emit event: `emit!(EventName { ... })`
8. Return `Ok(())`

```rust
pub fn instruction_name(ctx: Context<InstructionContext>, param: Type) -> Result<()> {
    require!(validation, ProgramError::Variant);

    let clock = Clock::get()?;
    let key = ctx.accounts.account.key();
    let account = &mut ctx.accounts.account;

    account.field = value;

    let cached = account.field;
    emit!(Event { key, cached });

    Ok(())
}
```

## Account Validation Patterns (Rust)

- PDA seeds and bump stored in account struct itself: `pub bump: u8`
- Constraints use `@` syntax for custom errors: `constraint = ip_asset.creator == signer.key() @ MyceliumError::Unauthorized`
- `/// CHECK:` comment required on `UncheckedAccount` fields explaining why it's safe
- `#[account(init, payer = signer, space = 8 + StructName::INIT_SPACE, seeds = [...], bump)]` pattern for PDA init
- `#[derive(InitSpace)]` on all account structs with `#[max_len(N)]` on String fields

## On-Chain/Off-Chain Type Boundary

Rust enum variants use PascalCase (`VisualArt`), TypeScript representation uses camelCase (`visualArt`), Anchor serialization sends `{ visualArt: {} }` objects. The conversion is handled by two utilities in `app/src/lib/types.ts`:

```typescript
// Anchor enum → TypeScript key
export function extractEnumKey<T extends string>(enumObj: Record<string, unknown>): T {
  return Object.keys(enumObj)[0] as T;
}

// TypeScript key → Anchor enum
export function toAnchorEnum(key: string): Record<string, Record<string, never>> {
  return { [key]: {} };
}
```

Manual Borsh deserializers exist in `app/src/hooks/use-my-assets.ts` and `src/solana-live-adapter.ts` for reading raw account data. Follow the existing offset-based pattern precisely — any deviation corrupts account reads.

## Module Design

**Exports:**
- `src/types.ts` — all shared protocol types, exported individually (no barrel default)
- `src/solana-adapter.ts` — exports `SolanaAdapter` interface + `MockSolanaAdapter` class + all Params/Result types
- `src/solana-live-adapter.ts` — exports only `SolanaLiveAdapter` class
- `app/src/lib/pda.ts` — named exports for each PDA derivation function
- `app/src/lib/constants.ts` — named exports for `PROGRAM_IDS`, `SEEDS`, URL templates, constraint constants

**Barrel Files:** None used. Always import from specific files.

## Comments

**Doc comments:**
- TypeScript files open with a JSDoc block describing purpose, architecture decision, and any notable design trade-offs
- Rust functions have `///` doc comments explaining business purpose, not just what the code does
- Inline `// ── Section Name ──` ASCII section headers used in long TypeScript files to separate logical blocks

**Inline comments:**
- All numeric magic values are explained: `// USDC has 6 decimals: 1_000_000 = $1.00`
- Byte offset operations include field name, type, and byte count: `// creator: Pubkey (32 bytes)`
- `/// CHECK:` on UncheckedAccount — required by Anchor, explains why bypass is safe

---

*Convention analysis: 2026-04-07*
