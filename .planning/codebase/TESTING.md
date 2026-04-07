# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:**
- Mocha (via `ts-mocha`) for Anchor integration tests
- Config: `Anchor.toml` — `test = "npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"`
- Timeout: 1,000,000ms (1000 seconds) — required for Solana RPC calls and transaction confirmation

**Assertion Library:**
- Chai (`expect` style) — imported as `import { expect } from "chai"`

**Run Commands:**
```bash
anchor test              # Run all tests against localnet
anchor test --skip-local-validator  # Run against existing validator
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts  # Run directly
```

**TypeScript Config for Tests:**
- Uses root `tsconfig.json` — `NodeNext` module resolution
- Tests import from `../target/types/{program_name}` for generated Anchor IDL types

## Test File Organization

**Location:**
- Primary test suite: `tests/` directory at project root (one file per Anchor program)
- Standalone test file: `mycelium_spore_tests.ts` at project root (earlier version of spore tests — may have diverged from `tests/mycelium-spore.ts`)

**Naming:**
- `tests/mycelium-spore.ts` — tests for `programs/mycelium-spore`
- `tests/mycelium-hypha.ts` — tests for `programs/mycelium-hypha`
- `tests/mycelium-meridian.ts` — tests for `programs/mycelium-meridian`
- No test file yet for `programs/mycelium-rhizome`

**Structure:**
```
tests/
├── mycelium-spore.ts     # IP registration, derivative, transfer, evidence
├── mycelium-hypha.ts     # License template, issue license
└── mycelium-meridian.ts  # MEP generation, MEP verification
mycelium_spore_tests.ts   # Standalone spore tests (root-level, may be outdated)
```

## Test Structure

**Suite Organization:**

Each test file follows this pattern:

```typescript
describe("program-name", () => {
  // Provider and program setup at top level
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ProgramName as Program<ProgramType>;
  const actor = provider.wallet;

  // Helper functions (contentHash, perceptualHash, findPDA variants)

  // Setup data shared across suites
  let sharedPDA: anchor.web3.PublicKey;

  // Nested describe per instruction
  describe("instruction_name", () => {
    before(async () => {
      // Pre-condition setup (e.g., register parent IP)
    });

    it("does the happy path", async () => { ... });
    it("rejects invalid input X", async () => { ... });
    it("rejects unauthorized action", async () => { ... });
  });
});
```

**Multi-program test suites** (e.g., `tests/mycelium-hypha.ts`, `tests/mycelium-meridian.ts`) set up two program handles and use `before()` to register prerequisite IP assets via the spore program before testing the target program.

## Mocking

**Framework:** No mock framework. Two strategies are used:

**1. MockSolanaAdapter (MCP server testing):**
`src/solana-adapter.ts` contains a full in-memory `MockSolanaAdapter` class. It mirrors the `SolanaAdapter` interface with `Map<string, T>` stores. Used when `SOLANA_LIVE` env var is unset. This is the mock implementation:

```typescript
export class MockSolanaAdapter implements SolanaAdapter {
  private assets: Map<string, IPAsset> = new Map();
  private licenses: Map<string, LicenseTemplate> = new Map();
  private counter = 0;

  private genPubkey(): string {
    this.counter++;
    return `myc${this.counter.toString(16).padStart(8, "0")}${"0".repeat(36)}`;
  }

  async registerIP(params: RegisterIPParams): Promise<RegisterIPResult> {
    // Returns realistic-shaped data without RPC calls
  }
}
```

**2. Keypair generation for unauthorized actor tests:**
```typescript
const fakeCreator = anchor.web3.Keypair.generate();
const sig = await provider.connection.requestAirdrop(
  fakeCreator.publicKey,
  anchor.web3.LAMPORTS_PER_SOL
);
await provider.connection.confirmTransaction(sig);
// Then attempt forbidden action with fakeCreator as signer
```

**What to Mock:**
- The `SolanaAdapter` interface when testing MCP tools without a live Solana RPC
- Keypairs for "wrong signer" / unauthorized tests

**What NOT to Mock:**
- Anchor programs — always test against localnet validator
- Transaction confirmation — always await `confirmTransaction`
- Program account fetches — always fetch actual on-chain state after transactions

## Fixtures and Factories

**Test Data Helpers (defined per test file, not shared):**

```typescript
function contentHash(data: string): number[] {
  return Array.from(createHash("sha256").update(data).digest());
}

function perceptualHash(data: string): number[] {
  return Array.from(createHash("sha256").update("phash:" + data).digest());
}

function findIPAssetPDA(creatorKey: anchor.web3.PublicKey, hash: number[]) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("ip_asset"), creatorKey.toBuffer(), Buffer.from(hash)],
    program.programId
  );
}
```

These helpers are duplicated across `tests/mycelium-spore.ts`, `tests/mycelium-hypha.ts`, and `tests/mycelium-meridian.ts`. There is no shared fixtures file.

**PDA Helpers per program:**
- Spore tests: `findIPAssetPDA`
- Hypha tests: `findIPAssetPDA` + `findLicenseTemplatePDA` + `findLicensePDA`
- Meridian tests: `findIPAssetPDA` + `findEvidencePDA`

**`before()` hooks as setup:**
```typescript
before(async () => {
  const cHash = contentHash("parent content string");
  const pHash = perceptualHash("parent content string");
  [parentPDA] = findIPAssetPDA(creator.publicKey, cHash);

  await sporeProgram.methods
    .registerIp(cHash, pHash, { characterIp: {} }, "ar://parent", ...)
    .accounts({ ... })
    .rpc();
});
```

**Unique content strings:**
Each test uses a distinct string as input to `contentHash()` to guarantee unique PDAs. Convention is descriptive strings: `"Original artwork — Mycelium test registration"`, `"Hai Dudu character IP — licensing test"`.

## Coverage

**Requirements:** None enforced — no coverage configuration found.

**View Coverage:**
```bash
# No coverage tooling configured. Add c8 or istanbul for coverage.
```

## Test Types

**Integration Tests (only type present):**
- All tests in `tests/` are integration tests running against a local Solana validator
- Tests call real Anchor program instructions via RPC
- Tests fetch real on-chain account state after each instruction
- No unit tests exist for individual functions in isolation

**E2E Tests:**
- Not present. The "evidence chain verification" tests in `tests/mycelium-spore.ts` function as semi-E2E — they verify the complete registration → on-chain state → transaction verification flow.

**MCP Tool Tests:**
- Not present. The `MockSolanaAdapter` exists to enable them but no test file covers MCP tool behavior.

## Common Patterns

**Happy Path Pattern:**
```typescript
it("registers a new IP asset with valid inputs", async () => {
  const content = "Descriptive test content string";
  const cHash = contentHash(content);
  const pHash = perceptualHash(content);
  const [pda] = findIPAssetPDA(creator.publicKey, cHash);

  await program.methods
    .instructionName(cHash, pHash, { enumVariant: {} }, "ar://uri")
    .accounts({ account: pda, signer: creator.publicKey, systemProgram: ... })
    .rpc();

  const account = await program.account.accountType.fetch(pda);
  expect(account.field).to.equal(expectedValue);
  expect(account.status).to.deep.equal({ active: {} });  // Anchor enum comparison
});
```

**Error Testing Pattern:**
```typescript
it("rejects invalid condition", async () => {
  const [pda] = findIPAssetPDA(creator.publicKey, invalidData);

  try {
    await program.methods
      .instruction(invalidData, ...)
      .accounts({ ... })
      .rpc();
    expect.fail("Should have thrown — reason");
  } catch (err) {
    expect(err.toString()).to.include("ErrorCodeName");
  }
});
```

Note: Error detection uses `err.toString()` with `to.include("ErrorCodeName")` — matches the Anchor error code string in the exception message. This is the standard pattern across all test files.

**Async Testing:**
All test functions are `async` — no done callbacks. Mocha handles Promise-based tests natively.

```typescript
it("description", async () => {
  await program.methods.instruction(...).rpc();
  const account = await program.account.type.fetch(pda);
  expect(account.field).to.equal(value);
});
```

**Anchor Enum Assertions:**
On-chain enums are returned as `{ variantName: {} }` objects. Use `to.deep.equal`:
```typescript
expect(account.status).to.deep.equal({ active: {} });
expect(account.licenseType).to.deep.equal({ commercial: {} });
```

**State Mutation Verification:**
After state-changing instructions, always re-fetch the account to verify:
```typescript
await program.methods.issueLicense(...).rpc();
const license = await hyphaProgram.account.license.fetch(licensePDA);
const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
// Verify both the new account AND the counter on the parent account
expect(template.activeLicenses).to.equal(1);
expect(template.totalIssued).to.equal(1);
```

**Evidence/Diagnostic Logging:**
The evidence verification tests and MEP tests use `console.log` to print a structured "evidence package" block. This is intentional — the output serves as a human-readable proof artifact during test runs:
```typescript
console.log("\n    === EVIDENCE PACKAGE ===");
console.log(`    IP Asset PDA: ${pda.toBase58()}`);
// ... additional fields
console.log("    === END EVIDENCE ===\n");
```

---

*Testing analysis: 2026-04-07*
