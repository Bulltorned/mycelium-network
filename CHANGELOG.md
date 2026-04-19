# Mycelium Protocol — CHANGELOG

## [Unreleased] — 2026-04-19

### Added — Programmable Commerce Primitives (Hypha)

- **`acquire_license` instruction** (`mycelium_hypha`) — licensee-initiated license
  acquisition with atomic USDC payment split. This is the Jakarta Protocol §6
  programmable commerce primitive. A licensee (human or AI agent) with a funded
  USDC account can self-serve acquire a license without requiring the licensor
  to be online at acquisition time.
- **`set_price` instruction** — licensor binds acquisition price + USDC mint +
  receiving token account to a license template. Uses `init_if_needed` so
  licensors can update pricing.
- **`verify_license` instruction** — read-only license validity check for AI
  agents and platform connectors. Emits `LicenseVerified` event for indexer
  consumption. No state mutation, no fees.
- **`PriceConfig` account** — PDA bound to `[SEED_PRICE_CONFIG, template]`.
  Stores licensor payment account, USDC mint, price in 6-decimal USDC lamports,
  and protocol fee bps (copied from `PROTOCOL_FEE_BPS` at set time).
- **`PROTOCOL_TREASURY` constant** — hard-coded authority pubkey that must own
  the `protocol_treasury_account` token account at acquisition time. Matches
  Meridian's `PROTOCOL_AUTHORITY`. Prevents attacker-supplied treasury drain.
- **`PROTOCOL_FEE_BPS = 50`** (0.5%) — matches Jakarta Protocol §9.4 revenue model.
  10% of this fee flows to the Global South Access Fund (off-chain accounting).
- **New events**: `PriceSet`, `LicenseAcquired` (includes price_paid, licensor_received,
  protocol_fee split), `LicenseVerified`.
- **New errors**: `PriceConfigNotActive`, `PriceConfigMismatch`, `MintMismatch`,
  `PaymentAccountOwnerMismatch`, `PaymentAccountMismatch`, `UnauthorizedTreasury`.

**Security invariants enforced on-chain:**
- `usdc_mint` must equal `price_config.usdc_mint` — blocks spoof-token attacks
- `licensor_payment_account` must equal `price_config.licensor_payment_account` —
  blocks routing attacker wallet
- `protocol_treasury_account.owner` must equal `PROTOCOL_TREASURY` constant —
  blocks attacker-supplied treasury
- `licensee_payment_account.owner` must equal licensee signer — blocks third
  party from spending someone else's USDC

### Added — Evidence Engine (`@mycelium/evidence-engine`)

New TypeScript package under `evidence-engine/`. Produces signed Mycelium
Evidence Packages (MEPs) that anchor to the blockchain via `mycelium_meridian`.

- **`canonical-json.ts`** — full JCS RFC 8785 implementation with SHA-256
  helpers. UTF-8 output, deep lexicographic key sort, control-char escaping,
  `-0` → `0` collapse, rejects `NaN`/`Infinity`, preserves non-ASCII verbatim.
- **`mep-schema.ts`** — complete TypeScript types for MEP v1.0 mirroring the
  Jakarta Protocol §4.2 JSON Schema. Single source of truth in TS land.
- **`mep-generator.ts`** — `generateUnsignedMEP(input)` composes a full MEP
  from on-chain snapshots + jurisdiction adapter, computes `package_hash`
  by canonicalize-with-empty-hash + SHA-256 + write-back, returns unsigned
  document ready for multisig signing. `attachSignature()` finalizes.
- **`jurisdiction/base.ts`** — `JurisdictionAdapter` interface. Every
  jurisdiction adapter implements this. Addition is a pure extension.
- **`jurisdiction/indonesia.ts`** — flagship adapter. Formats MEPs for
  Pengadilan Niaga under UU ITE Pasal 5 + Putusan MK 20/PUU-XIV/2016. Full
  Bahasa Indonesia reproduction steps, Surat Keterangan Ahli template,
  notarization guidance flag.
- **Full test suite** (`tests/canonical-json.test.ts`) — RFC 8785 vectors,
  key sort determinism, SHA-256 stability, non-ASCII handling.

**Public API:**
```typescript
import {
  canonicalize, hashCanonical, sha256Hex,
  generateUnsignedMEP, attachSignature,
  IndonesiaAdapter, getAdapter,
  // types
  MEPDocument, IPAssetSnapshot, LicenseHistoryEntry, Jurisdiction,
} from "@mycelium/evidence-engine";
```

### Changed

- `mycelium_hypha/Cargo.toml` — added `anchor-spl = "0.30.1"` and enabled
  `init-if-needed` feature on `anchor-lang` (required by `set_price`).

### Deferred to v1.1

- **Rhizome USDC deposit path.** Hypha `acquire_license` already performs the
  USDC payment split atomically at license acquisition. Rhizome's SOL path
  remains for ongoing royalty streams (pay-per-use, subscription). USDC support
  on Rhizome pairs with per-recipient withdraw — both are v1.1.
- **MCP server wiring for `acquire_license`**. Requires Hypha devnet redeploy +
  regenerated IDL. Shipped as a separate PR once audited.
- **2 missing license types**: `CommunityCanopy` (DAO-governed), `DerivativeBloom`
  (auto-royalty on derivatives). v1.0 ships with 4 archetypes; additional types
  are declared as extensions permitted by Jakarta Protocol §6.
- **Sublicense creation instruction.** Field `sublicense_count` exists; the
  `create_sublicense` instruction that increments it ships in v1.1.
- **Kenya and Colombia jurisdiction adapters.** Indonesia is flagship for
  Jakarta Protocol v1.0; Kenya and Colombia adapters land post-pilot.

### Security notes

- All new token flows use `anchor_spl::token::transfer` with explicit authority
  binding — no delegate-auth shortcuts.
- `init_if_needed` is used for `PriceConfig` only. Re-initialization attacks are
  blocked because an existing account retains its `bump` and `is_active` state;
  the licensor-signer constraint prevents third-party overwrite.
- Protocol treasury is bound at program level (constant), not at PriceConfig
  level — attacker cannot configure a template with a rogue treasury.

### Files created

- `evidence-engine/src/canonical-json.ts`
- `evidence-engine/src/mep-schema.ts`
- `evidence-engine/src/mep-generator.ts`
- `evidence-engine/src/jurisdiction/base.ts`
- `evidence-engine/src/jurisdiction/indonesia.ts`
- `evidence-engine/src/jurisdiction/index.ts`
- `evidence-engine/src/index.ts`
- `evidence-engine/tests/canonical-json.test.ts`
- `evidence-engine/package.json`
- `evidence-engine/tsconfig.json`
- `CHANGELOG.md` (this file)

### Files modified

- `programs/mycelium-hypha/Cargo.toml` — anchor-spl dep, init-if-needed feature
- `programs/mycelium-hypha/src/lib.rs` — +~300 LOC: PriceConfig, set_price,
  acquire_license, verify_license, contexts, events, errors, PROTOCOL_TREASURY,
  SEED_PRICE_CONFIG

### Test plan (pending Anchor test run)

1. `anchor build` — verify Hypha compiles with new instructions
2. `anchor test tests/mycelium-hypha.ts` — existing tests must still pass
3. Write new test cases:
   - `set_price` happy path
   - `acquire_license` happy path with split verification
   - `acquire_license` with zero price (free CC-like template)
   - `acquire_license` attack: attacker-supplied treasury → must fail with `UnauthorizedTreasury`
   - `acquire_license` attack: mismatched mint → must fail with `MintMismatch`
   - `acquire_license` double-acquire same template+licensee → must fail (PDA exists)
   - `verify_license` returns correct is_valid for expired license
4. `cd evidence-engine && npm install && npm test` — canonical JSON suite green
5. Devnet deploy + redeploy Hypha, regenerate IDL, run integration test against devnet

### Jakarta Protocol v1.0 spec compliance

After this changeset, on-chain instructions cover:
- ✓ §5 Registration Profile (Spore — unchanged)
- ✓ §6 Licensing Profile incl. mandatory `ai_training_allowed` + programmable acquire
- ✓ §7 Recognition Procedure (Meridian — unchanged; Evidence Engine now supplies canonical MEP generation)
- ✓ §4 MEP Schema (Evidence Engine implements JCS hashing per §4.3)

Story Protocol comparison (Appendix 01) dimension status updates:
- D9 "Mandatory AI training flag" — remains ✓ (was already in v0)
- D3 "Public-infrastructure financial model" — strengthened: protocol fee fixed at
  50 bps, paid in USDC, treasury bound to constant, 10% to Access Fund (off-chain)
- D5 "Off-chain enforcement" — strengthened: Evidence Engine ships full MEP
  generator with Indonesia jurisdiction adapter; off-chain half of the enforcement
  loop is now real code not spec-only
