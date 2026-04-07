# Codebase Concerns

**Analysis Date:** 2026-04-07

---

## Tech Debt

**Live adapter is ~60% stub — ships as broken for most features:**
- Issue: `SolanaLiveAdapter` throws `Error("Hypha program integration not yet implemented")` for `createLicense` and `acquireLicense`. `fileDispute` also throws. `verifyLicense` silently returns `licensed: false` with empty available list. The MCP tools `create_license`, `acquire_license`, `file_dispute`, and `check_license` all invoke these methods — any agent calling them against the live adapter will get hard errors or silent false negatives.
- Files: `src/solana-live-adapter.ts` lines 507–529, 600–609
- Impact: All licensing and dispute tools are dead on devnet/mainnet. Only `register_ip`, `search_ip`, `verify_provenance`, `check_similarity`, and `get_wallet` function live.
- Fix approach: Implement Hypha CPI calls using the same raw-instruction pattern already proven in `registerIP`. Program IDs and seeds are already defined in `PROGRAM_IDS` and `SEEDS`.

**Dual schema drift — `mycelium_spore_lib.rs` (root) vs `programs/mycelium-spore/src/lib.rs` (deployed):**
- Issue: The root file `mycelium_spore_lib.rs` is an older version of the Spore program with a different `IPAsset` struct — it has `original_creator` field and uses a shorter `register_ip` signature (no `nice_class`, `berne_category`, `country_of_origin`, `first_use_date` params). The deployed program at `programs/mycelium-spore/src/lib.rs` dropped `original_creator` from the on-chain struct (uses only `creator`) but the TypeScript deserializer in `solana-live-adapter.ts` still reads `original_creator` as the first 32 bytes before `creator`. This means deserialization will be offset by 32 bytes and silently return wrong data.
- Files: `mycelium_spore_lib.rs` (root, stale), `src/solana-live-adapter.ts` lines 152–155, `programs/mycelium-spore/src/lib.rs` lines 272–295
- Impact: `getIPAsset` and `searchIP` on the live adapter will parse all fields incorrectly — content hash reads as creator, creator reads as content hash, etc. Evidence packages built from this data would be cryptographically wrong.
- Fix approach: Delete or clearly archive `mycelium_spore_lib.rs`. Update `deserializeIPAsset` to match the deployed struct (no `original_creator` field at offset 8 — first field is `creator`).

**Manual Borsh deserializer instead of generated Anchor IDL client:**
- Issue: Three separate manual binary deserializers exist for the same `IPAsset` struct: `src/solana-live-adapter.ts:deserializeIPAsset`, `app/src/hooks/use-my-assets.ts:parseIPAsset`, and `app/src/app/asset/[pubkey]/page.tsx:parseAssetFromBuffer`. All three hardcode byte offsets. Any on-chain struct change silently breaks all three without compile-time errors. The `solana-live-adapter.ts` comments acknowledge this: "In production, use the generated Anchor IDL types."
- Files: `src/solana-live-adapter.ts` lines 142–234, `app/src/hooks/use-my-assets.ts` lines 16–142, `app/src/app/asset/[pubkey]/page.tsx` lines 21–101
- Impact: High maintenance burden. A field reorder in the Rust struct silently produces wrong data everywhere with no compile error. Three places to update for any schema change.
- Fix approach: Generate Anchor IDL JSON (`anchor build`), use `@coral-xyz/anchor` client in all three locations. Eliminates manual byte parsing entirely.

**Instruction discriminator hardcoded in two places with inconsistent values:**
- Issue: The Anchor instruction discriminator for `register_ip` is hardcoded as `[0x47, 0x97, 0x6c, 0x5c, 0x87, 0x16, 0xad, 0x3f]` in `src/solana-live-adapter.ts` line 302, and as `[175, 73, 203, 183, 164, 131, 30, 113]` in `app/src/hooks/use-register-ip.ts` line 18. These are different byte values (hex vs decimal encoding of different hashes). One of them is wrong, or they hash different strings.
- Files: `src/solana-live-adapter.ts` line 302, `app/src/hooks/use-register-ip.ts` lines 17–19
- Impact: One of the two registration paths submits a malformed instruction that will be rejected by the Solana runtime. Transactions will fail with a silent program error.
- Fix approach: Compute discriminators from the canonical source (`sha256("global:register_ip")[0..8]`) and use a single shared constant. Use Anchor IDL client to eliminate manual discriminators entirely.

**`getProvenance` queries all program accounts (unbounded scan):**
- Issue: `getProvenance` in `src/solana-live-adapter.ts` calls `searchIP({ page: 0, pageSize: 1000 })` which calls `getProgramAccounts` with no size filter. As the registry grows, this returns the entire registry to client memory just to find children of one asset. The comment acknowledges this: "This is expensive on mainnet — production should use Helius indexer + Postgres."
- Files: `src/solana-live-adapter.ts` lines 478–503
- Impact: Mainnet with >10,000 assets makes this call hit RPC rate limits or timeout. RPC providers charge per request weight.
- Fix approach: Use Helius DAS API `getAssetsByCreator` or add a Postgres index. For the interim, add a `pageSize` cap and warn callers.

---

## Known Bugs

**`option<Pubkey>` deserialization always advances 32 bytes — wrong for `None`:**
- Symptoms: When `parent_ip` is `None` (0 tag byte), the live adapter still advances offset by 32 bytes (`offset += 32; // Always advance 32 regardless of Some/None`). If a future account is packed tightly, the skip will misalign all subsequent fields.
- Files: `src/solana-live-adapter.ts` lines 195–199
- Trigger: Any asset without a parent IP (the common case). Only produces correct results if Anchor always serializes `None` as 1 + 32 zero bytes, which it does — so this is latent, not immediately broken.
- Workaround: Currently safe because Anchor's `Option<Pubkey>` is always 33 bytes on-chain. Becomes a bug if the pattern is applied to other `Option` types of different sizes.

**`status` enum reads 1 byte but code skips 2 bytes (padding):**
- Symptoms: `deserializeIPAsset` reads `statusIdx = data[offset]; offset += 1; offset += 1 // padding` — but Anchor's enum discriminant is 1 byte with no automatic padding. If the on-chain layout does not insert padding, this skips one byte of actual data.
- Files: `src/solana-live-adapter.ts` lines 203–205
- Trigger: Reading any IPAsset account with a `license_count` > 0 would produce wrong counts.
- Workaround: The `ip_type` field has the same pattern (2-byte advance for a 1-byte enum). Either Anchor does insert padding here or both counts are consistently wrong.

**`register_ip` in live adapter ignores `params.parentIp`:**
- Symptoms: The `registerIP` method builds the instruction data without including `parent_ip`. The on-chain `register_ip` instruction does not have a `parent_ip` parameter (derivatives use `register_derivative`). But the `RegisterIPParams` interface exposes `parentIp` and the fallback asset sets it — creating a mismatch between what was submitted on-chain (always `None`) and what is returned in the result.
- Files: `src/solana-live-adapter.ts` lines 288–363, `src/solana-adapter.ts` lines 66–77
- Trigger: Any call to `registerIP` with `parentIp` set goes to the wrong instruction. Should call `register_derivative` instead.
- Workaround: None — silently registers as an original work, not a derivative.

**`fileDispute` in MockAdapter sets `respondent: ""`:**
- Symptoms: `MockSolanaAdapter.fileDispute` creates a `Dispute` with `respondent: ""` — an empty string is not a valid Solana pubkey.
- Files: `src/solana-adapter.ts` line 388
- Trigger: Any test or agent that calls `file_dispute` then reads back the `respondent` field.

---

## Security Considerations

**`UpdateStatus` has no authority constraint — anyone can change IP status:**
- Risk: The `UpdateStatus` instruction context in the Spore program only requires that the `ip_asset` seeds are valid. The `authority` field is a `Signer` but there is no constraint binding it to `ip_asset.creator` or a designated DRP program. Any wallet can call `update_status` and change an asset to `Disputed`, `Suspended`, or `Revoked`.
- Files: `programs/mycelium-spore/src/lib.rs` lines 389–398
- Current mitigation: None. The comment says "used by DRP program via CPI" but the CPI caller is not verified.
- Recommendations: Add `constraint = authority.key() == ip_asset.creator || authority.key() == DRP_PROGRAM_AUTHORITY @ MyceliumError::Unauthorized`. Until DRP is deployed, restrict to creator only.

**`GenerateMEP` accepts arbitrary `protocol_signature` bytes — no on-chain verification:**
- Risk: The Meridian `generate_mep` instruction accepts a `[u8; 64]` `protocol_signature` parameter and stores it without verifying the signature against the protocol authority's public key. The test file uses `new Array(64).fill(1)` (all-ones fake signature) and it passes. Any caller can anchor a fraudulent MEP with a fabricated signature.
- Files: `programs/mycelium-meridian/src/lib.rs` lines 35–93, `tests/mycelium-meridian.ts` line 63
- Current mitigation: None. The MEP is presented to courts as cryptographically verified but the on-chain check does not exist.
- Recommendations: Use Anchor's `anchor_lang::solana_program::ed25519_program` or store the authority pubkey in a `ProtocolConfig` PDA and verify `ed25519_verify(package_hash, protocol_signature, authority_pubkey)` on-chain before writing.

**Hypha `ip_asset` is `UncheckedAccount` — any address passes as a valid IP asset:**
- Risk: `CreateLicenseTemplate` accepts `ip_asset: UncheckedAccount<'info>`. A licensor can create a license template pointing at a random address (not a real IPAsset PDA), making the license appear to cover an IP asset it does not.
- Files: `programs/mycelium-hypha/src/lib.rs` lines 305–312
- Current mitigation: Comment says "In production, use CPI to verify." Not implemented.
- Recommendations: Change `UncheckedAccount` to `Account<'info, IPAsset>` and import Spore's account type via CPI, or at minimum verify the account owner is the Spore program ID.

**`SolanaLiveAdapter` stores all agent wallets in process memory:**
- Risk: `agentWallets: Map<string, AgentWallet>` is an in-memory store. On server restart, all agent wallet associations are lost. The payer keypair is loaded from a path on disk at startup — a single keypair serves as the wallet for every agent.
- Files: `src/solana-live-adapter.ts` lines 265, 614–630
- Current mitigation: Comment says "production: use a database" and "derive a custodial wallet per agent from a master seed."
- Recommendations: Do not ship to production without per-agent key derivation (BIP-44 path per agentId) or a wallet-as-a-service provider (Turnkey, Crossmint). Current design means all agents share the same on-chain identity.

**`Rhizome distribute_royalties` sends to `distribution_pool` — unconstrained address:**
- Risk: The `DistributeRoyalties` instruction accepts `distribution_pool: SystemAccount<'info>` and `platform_wallet: SystemAccount<'info>` as unconstrained accounts. The caller provides these addresses. A malicious caller can drain the vault to any wallet by supplying their own address as `distribution_pool` or `platform_wallet`.
- Files: `programs/mycelium-rhizome/src/lib.rs` lines 279–301
- Current mitigation: None. The PoC note says "In production, the remaining_accounts would be the actual recipient wallets."
- Recommendations: Store `platform_wallet` in the `RoyaltyConfig` PDA at creation time and verify `constraint = platform_wallet.key() == royalty_config.platform_wallet`. Require individual recipient accounts to match the `recipients[]` array.

**Keypair path defaults to `~/solana-keys/id.json` — no env validation at startup:**
- Risk: If `SOLANA_KEYPAIR_PATH` is not set and the file does not exist, `loadKeypair` throws a file-not-found error at runtime (when the first tool is called), not at startup. The server starts successfully and logs a payer pubkey even with a missing key file if the env var resolves to an existing file — but any misconfiguration that resolves to a missing file surfaces as an unhandled crash mid-request.
- Files: `src/solana-live-adapter.ts` lines 113–118, 276–284
- Recommendations: Validate keypair file existence in the constructor and throw a clear error before the server accepts connections.

---

## Performance Bottlenecks

**`searchIP` loads the entire program account set into memory for every query:**
- Problem: `getProgramAccounts` with no `dataSize` filter downloads all accounts for the Spore program. On a populated registry, this could be tens of thousands of accounts, all serialized and transferred over RPC.
- Files: `src/solana-live-adapter.ts` lines 418–471
- Cause: No Helius DAS API integration, no Postgres index. Client-side filtering applied after full scan.
- Improvement path: Integrate Helius `searchAssets` endpoint. Add a `dataSize` filter to `getProgramAccounts` to at least exclude non-IPAsset accounts. Add server-side pagination via RPC `dataSlice` for large accounts.

**`useMyAssets` hook calls `getProgramAccounts` on every component mount + 30-second polling:**
- Problem: The React hook in `app/src/hooks/use-my-assets.ts` calls `getProgramAccounts` filtered only by creator pubkey. With 30-second `refetchInterval`, a user with many assets generates continuous RPC load. Public devnet RPC has rate limits that will start dropping requests.
- Files: `app/src/hooks/use-my-assets.ts` lines 148–171
- Improvement path: Move to Helius indexer API. Cache results in `@tanstack/react-query` with longer stale time. Show optimistic results after registration instead of waiting for re-poll.

---

## Fragile Areas

**Three parallel binary deserializers — any struct change breaks all three silently:**
- Files: `src/solana-live-adapter.ts:deserializeIPAsset`, `app/src/hooks/use-my-assets.ts:parseIPAsset`, `app/src/app/asset/[pubkey]/page.tsx:parseAssetFromBuffer`
- Why fragile: All three parse the same on-chain binary format. Field order, field sizes, and `Option` discriminants must match. No shared parsing library. No compile-time check against the Rust struct definition. The three implementations already have subtle inconsistencies (e.g., `ip_type` enum padding logic differs).
- Safe modification: Change all three simultaneously whenever any on-chain field changes. Use Anchor IDL generation to replace all three.
- Test coverage: None for the deserializers. Tests run against Anchor's generated client (which handles deserialization automatically), so failures in the manual deserializers would never be caught by the existing test suite.

**`perceptual_hash` is SHA-256 with a salt prefix — not a real perceptual hash:**
- Files: `app/src/lib/hash.ts` lines 33–38
- Why fragile: The UI bills `perceptualHash` as an image/audio fingerprint that "enables similarity matching" but it is SHA-256(`"mycelium_perceptual_v1:" + rawFileBytes`). This is cryptographically strong but not perceptually robust — a 1-pixel change produces a completely different hash. The similarity oracle's detection of "near-duplicate" and "derivative" matches is therefore completely ineffective through the UI registration path. Only exact-byte copies will match.
- Safe modification: The on-chain data is already stored; the field name is just misleading. Replace with actual pHash/dHash for images and Chromaprint for audio before any production launch.

**`mycelium_spore_tests.ts` at root is a duplicate/stale version:**
- Files: `mycelium_spore_tests.ts` (root), `tests/mycelium-spore.ts`
- Why fragile: The root file appears to be an earlier draft. Having two test files for the same program with slightly different content risks confusion about which is authoritative. The root file is not referenced by `Anchor.toml` or any test script.
- Safe modification: Delete `mycelium_spore_tests.ts` at root. `tests/mycelium-spore.ts` is the canonical test.

---

## Scaling Limits

**On-chain `IPAsset` struct has no `original_creator` field — breaks ownership transfer provenance:**
- Current capacity: The deployed Spore program stores only `creator` (current owner). After `transfer_ownership`, there is no way to determine who originally registered the IP from on-chain data alone.
- Limit: Any evidence package or provenance chain that claims "originally created by X" must rely on off-chain Arweave metadata or event logs — neither is queryable on-chain.
- Scaling path: Add `original_creator: Pubkey` back to the on-chain struct (as in `mycelium_spore_lib.rs`). This requires a program upgrade and account migration for existing registrations.

**Royalty distribution supports only SOL — USDC described in docs but not implemented:**
- Current capacity: `Rhizome` only handles SOL (lamports). `getWalletBalance` in the live adapter returns SOL lamports as a proxy for USDC. All USDC balance is mock (`$100 USDC for testing` hardcoded in MockAdapter).
- Limit: Licensing prices are expressed in USDC lamports (`priceUsdcLamports`) but no SPL token transfers exist. Running `acquire_license` against the live adapter throws immediately.
- Scaling path: Implement SPL token transfers using `anchor_spl::token` in Hypha and Rhizome programs. Requires USDC mint address configuration.

---

## Dependencies at Risk

**`@solana/web3.js` v1 (1.98.0) — major version migration pending:**
- Risk: Solana ecosystem is actively migrating to `@solana/web3.js` v2 (breaking API changes: no `Connection`, `Transaction`, `Keypair` classes). The live adapter and MCP server use v1 APIs extensively.
- Impact: v1 will receive security patches but no new RPC features. Helius, Umi, and newer tooling target v2.
- Migration plan: Refactor `SolanaLiveAdapter` to use `@solana/rpc`, `@solana/signers`, and `@solana/transactions` from v2.

**No `@coral-xyz/anchor` in MCP server `package.json` — manual instruction building instead:**
- Risk: The MCP server builds Anchor instructions manually (hardcoded discriminators, manual Borsh encoding) because the Anchor client is not a dependency. This is the root cause of several bugs and inconsistencies listed above.
- Impact: Every new instruction requires manual implementation. Discriminator values can silently diverge from what the program expects.
- Migration plan: Add `@coral-xyz/anchor` as a dependency, generate IDL JSON via `anchor build`, use `program.methods.*()` for all instruction calls.

---

## Missing Critical Features

**DRP (Dispute Resolution Program) does not exist:**
- Problem: The protocol references a "DRP program" in `PROGRAM_IDS` (`rhizome` entry in some contexts), comments, and the `fileDispute` method signatures. No `programs/mycelium-drp/` directory exists. The fourth program address in `PROGRAM_IDS` is `rhizome` (royalty distribution), not a DRP.
- Blocks: `file_dispute` MCP tool (throws in live adapter), `UpdateStatus` CPI (no authorized caller program), dispute resolution workflow entirely.

**Similarity oracle is exact-hash-match only — semantic/perceptual layer does not exist:**
- Problem: `checkSimilarity` in both adapters only checks if `contentHash === existing.contentHash`. The MCP tool description promises "Layer 2 (deep semantic embeddings via CLIP, CLAP, multilingual-e5)" but this service is not implemented anywhere in the codebase. The `checkSimilarity` comment says "requires Python service."
- Blocks: All near-duplicate detection, style-transfer detection, derivative detection. The similarity oracle is the core differentiator of the protocol — without it, the protocol only catches exact copies.

**Evidence package generation returns placeholder file paths:**
- Problem: `generateEvidence` in `SolanaLiveAdapter` returns an `EvidencePackage` with component paths like `evidence_summary_ID.pdf` and a `downloadUrl` of `https://evidence.mycelium.network/packages/{hash}`. No PDF is generated, no Arweave upload occurs, no domain `evidence.mycelium.network` exists. The TODO comment lists what is needed: "Solana PoH timestamp verification, SHA-256 content hash proof, W3C PROV provenance chain, Jurisdiction-specific legal formatting."
- Files: `src/solana-live-adapter.ts` lines 566–598
- Blocks: All use cases involving WIPO/court evidence — the primary commercial value proposition for INFIA.

**No mainnet configuration path:**
- Problem: All program IDs, `Anchor.toml`, and default env vars point to devnet. There is no `[programs.mainnet-beta]` section in `Anchor.toml`. The env var `NEXT_PUBLIC_SOLANA_CLUSTER` can be set to `mainnet-beta` in the UI but the MCP server has no equivalent path.
- Blocks: Any production deployment.

---

## Test Coverage Gaps

**No tests for `SolanaLiveAdapter` or `MockSolanaAdapter`:**
- What's not tested: All TypeScript adapter code — `deserializeIPAsset`, `findIPAssetPDA`, `searchIP` filters, `getProvenance`, all mock implementations.
- Files: `src/solana-live-adapter.ts`, `src/solana-adapter.ts`
- Risk: The bugs in manual deserialization and the `original_creator` field mismatch described above would never be caught by the existing test suite, which only tests Anchor programs via the generated Anchor client.
- Priority: High — the adapter is the critical path between MCP tools and on-chain programs.

**No tests for MCP tool schema validation or tool response shapes:**
- What's not tested: `src/index.ts` — all 11 MCP tools, resource handlers, error paths.
- Files: `src/index.ts`
- Risk: Tool schema changes silently break agent integrations. Error responses may not conform to MCP spec.
- Priority: Medium.

**`mycelium-rhizome` has no test file:**
- What's not tested: `configure_royalty`, `deposit_royalty`, `distribute_royalties` — the entire royalty distribution program.
- Files: `programs/mycelium-rhizome/src/lib.rs`, no corresponding `tests/mycelium-rhizome.ts`
- Risk: The `distribute_royalties` function has the most complex logic (platform fee calculation, vault balance management) and the most serious security concern (unconstrained `distribution_pool` address). None of this is tested.
- Priority: High.

---

*Concerns audit: 2026-04-07*
