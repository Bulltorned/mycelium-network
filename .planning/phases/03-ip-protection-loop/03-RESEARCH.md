# Phase 3: IP Protection Loop - Research

**Researched:** 2026-04-13
**Domain:** Evidence packages, perceptual hashing, audio fingerprinting, dispute resolution (Solana/Anchor), legal evidence formatting
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 has three distinct subsystems: (1) an Evidence Engine that assembles full Mycelium Evidence Packages from on-chain data, uploads to Arweave, and creates Meridian PDA records with Ed25519 protocol signatures; (2) a Similarity Oracle as a Python FastAPI sidecar performing perceptual image hashing and audio fingerprinting; and (3) a Dispute Resolution Protocol (DRP) as a new Anchor program with CPI to Spore's UpdateStatus.

The Meridian on-chain program is already complete with generate_mep, verify_mep, and update_mep instructions including Ed25519 signature verification. The evidence engine work is primarily off-chain: building the MEP JSON assembler, jurisdiction-specific formatting, and wiring the full flow (assemble -> upload to Arweave -> hash -> sign -> call generate_mep on-chain). The existing `generateEvidence` in the live adapter is a stub returning mock data -- this needs full replacement.

The Python sidecar is the highest-risk component due to the Chromaprint dependency (fpcalc binary not installed, needs Windows binary download). Image hashing via `imagehash` is straightforward (Pillow already installed). The DRP program is greenfield Anchor/Rust work requiring CPI to Spore, which means modifying Spore's UpdateStatus authority constraint to accept the DRP program PDA.

**Primary recommendation:** Build in order: (1) Evidence Engine first (leverages existing Meridian program + Irys uploader), (2) Similarity Oracle (independent Python service), (3) DRP program last (requires Spore modification for CPI authority).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVI-01 | Evidence Engine generates real MEP from any registered IP asset | Meridian program exists with generate_mep. Need off-chain assembler that collects IP data, license history, provenance chain, then uploads to Arweave and calls generate_mep |
| EVI-02 | MEP includes PoH timestamp proof, SHA-256 content hash verification, creator identity, license history, provenance chain | All data available: IPAsset PDA has slot/timestamp/content_hash/creator, licenses queryable via Hypha, provenance via parent_ip chain. Assemble into structured JSON |
| EVI-03 | MEP uploaded to Arweave with permanent URI stored in EvidencePackage PDA | Irys uploader already exists (src/services/storage/irys-uploader.ts). uploadEvidence() function ready. Meridian stores arweave_uri in PDA |
| EVI-04 | Jurisdiction-specific formatting for Indonesia (UU ITE Pasal 5) and WIPO Arbitration | Meridian program supports Indonesia and WIPOArbitration Jurisdiction enum variants. Off-chain formatting needs UU ITE Pasal 5 compliance (integrity guarantee, accessibility, juridical justification) and WIPO ECAF submission format |
| SIM-01 | Exact content hash match detection in both mock and live adapter | Partially implemented -- live adapter checkSimilarity does exact hash match against search results. Needs PostgreSQL index query instead of full search scan |
| SIM-02 | Perceptual hash matching for images (pHash/dHash) via Python FastAPI sidecar | Python 3.12 + Pillow available. Need imagehash + FastAPI sidecar. Store perceptual hashes in PostgreSQL for batch comparison |
| SIM-03 | Audio fingerprint matching via Chromaprint in Python sidecar | pyacoustid + fpcalc binary needed. fpcalc NOT installed -- must download Windows binary from acoustid.org |
| SIM-04 | Similarity results return match candidates with score, match type, matched asset pubkey | TypeScript types already defined (SimilarityResult, SimilarityCandidate). Python sidecar returns JSON, TS adapter wraps response |
| DRP-01 | DRP program exists with file_dispute instruction creating Dispute PDA | New Anchor program needed. Dispute PDA stores claimant, respondent, IP asset, stage, evidence hashes, arbiter |
| DRP-02 | Dispute resolution workflow with whitelisted arbiter authority | Program needs arbiter whitelist (PDA or hardcoded array). resolve_dispute instruction checks arbiter is whitelisted |
| DRP-03 | DRP program authorized to call Spore UpdateStatus via CPI | Spore's UpdateStatus currently requires authority == ip_asset.creator. Must add DRP program ID as alternative authorized caller. CPI from DRP to Spore using CpiContext |
</phase_requirements>

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @coral-xyz/anchor | 0.30.1 | Anchor IDL client for Meridian program calls | Already used for Spore/Hypha/Rhizome |
| @irys/upload + @irys/upload-solana | 0.0.15 / 0.1.8 | Arweave uploads for MEP JSON | Already integrated, uploadEvidence() exists |
| @solana/web3.js | 1.98.x | Ed25519 signature creation, transaction building | Already in use |
| pg | 8.20.x | PostgreSQL for similarity hash index | Already integrated |

### New (Phase 3 additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| imagehash (Python) | 4.2.1 | pHash/dHash for perceptual image similarity | Similarity Oracle sidecar |
| pyacoustid (Python) | 1.3.0 | Chromaprint audio fingerprinting wrapper | Audio similarity detection |
| uvicorn (Python) | 0.34.x | ASGI server for FastAPI sidecar | Run the similarity service |
| fastapi (Python) | 0.135.2 | REST API framework for sidecar | Already installed |
| Pillow (Python) | 12.2.0 | Image loading for imagehash | Already installed |
| numpy (Python) | latest | Required by imagehash for hash computation | Dependency of imagehash |
| tweetnacl (npm) | 1.0.3 | Ed25519 signing for protocol signature on MEP hash | Sign package_hash before generate_mep call |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| imagehash (Python) | sharp + phash (Node.js) | Node phash libraries are poorly maintained; imagehash is the standard |
| FastAPI sidecar | Express.js with sharp | Chromaprint has no good Node.js wrapper; Python is required for audio |
| pyacoustid | chromaprint-js (npm) | chromaprint-js is unmaintained since 2019; pyacoustid is canonical |
| tweetnacl | @solana/web3.js Ed25519 | web3.js doesn't expose standalone Ed25519 sign; tweetnacl does cleanly |

**Installation (Python sidecar):**
```bash
pip install imagehash pyacoustid uvicorn numpy
```

**Installation (npm -- likely no new deps needed):**
```bash
npm install tweetnacl
```

**System dependency (Windows):**
- Download fpcalc.exe from https://acoustid.org/chromaprint (Windows binary)
- Place in system PATH or project `bin/` directory
- Set FPCALC_PATH env var to binary location

## Architecture Patterns

### Recommended Project Structure
```
src/
  services/
    evidence/
      mep-assembler.ts        # Collects all data, builds MEP JSON
      jurisdiction-formatter.ts # UU ITE / WIPO specific formatting
      evidence-engine.ts       # Orchestrates: assemble -> upload -> sign -> on-chain
    similarity/
      similarity-client.ts     # HTTP client to Python sidecar
  solana-live-adapter.ts       # Updated generateEvidence, checkSimilarity, fileDispute
programs/
  mycelium-drp/
    src/lib.rs                 # New DRP Anchor program
  mycelium-spore/
    src/lib.rs                 # Modified: UpdateStatus accepts DRP authority
similarity-oracle/
  main.py                      # FastAPI app
  image_hasher.py              # pHash/dHash computation
  audio_fingerprinter.py       # Chromaprint wrapper
  requirements.txt             # Python dependencies
```

### Pattern 1: MEP Assembly Pipeline
**What:** Multi-step evidence assembly: fetch IP asset -> fetch licenses -> build provenance chain -> format per jurisdiction -> upload to Arweave -> compute SHA-256 -> Ed25519 sign -> call Meridian generate_mep
**When to use:** Every time generateEvidence is called
**Example:**
```typescript
// Evidence Engine flow
async function generateFullMEP(ipAssetPubkey: string, jurisdiction: Jurisdiction): Promise<EvidencePackage> {
  // 1. Fetch on-chain IP asset data
  const asset = await sporeProgram.account.ipAsset.fetch(ipAssetPubkey);
  
  // 2. Fetch license history from indexer
  const licenses = await getLicensesByIP(ipAssetPubkey);
  
  // 3. Build provenance chain (walk parent_ip links)
  const provenance = await buildProvenanceChain(ipAssetPubkey);
  
  // 4. Assemble MEP JSON with jurisdiction formatting
  const mepJson = assembleMEP(asset, licenses, provenance, jurisdiction);
  
  // 5. Upload to Arweave
  const arweaveUri = await uploadEvidence(mepJson, keypairBytes);
  
  // 6. SHA-256 hash the MEP JSON
  const packageHash = sha256(JSON.stringify(mepJson));
  
  // 7. Ed25519 sign the hash with protocol authority
  const signature = nacl.sign.detached(packageHash, protocolKeypair.secretKey);
  
  // 8. Build Ed25519 verify instruction + generate_mep instruction
  // Ed25519 instruction must be FIRST in transaction
  const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: protocolKeypair.secretKey,
    message: packageHash,
  });
  
  // 9. Call Meridian generate_mep with Ed25519 instruction preceding it
  const tx = new Transaction().add(ed25519Ix).add(generateMepIx);
}
```

### Pattern 2: Python Sidecar HTTP Communication
**What:** TypeScript MCP server calls Python FastAPI service over localhost HTTP for similarity operations
**When to use:** checkSimilarity with image/audio content
**Example:**
```typescript
// TypeScript client
const response = await fetch('http://localhost:8100/similarity/image', {
  method: 'POST',
  body: formData, // multipart with image file
});
const result = await response.json();
// { matches: [{ pubkey: "...", score: 0.92, matchType: "near_duplicate" }] }
```

```python
# Python FastAPI endpoint
@app.post("/similarity/image")
async def check_image_similarity(file: UploadFile):
    img = Image.open(file.file)
    phash = str(imagehash.phash(img))
    dhash = str(imagehash.dhash(img))
    # Query PostgreSQL for closest matches
    matches = query_similar_hashes(phash, dhash, threshold=10)
    return {"matches": matches}
```

### Pattern 3: DRP CPI to Spore
**What:** DRP program calls Spore's update_status via Cross-Program Invocation
**When to use:** When a dispute resolution triggers IP status change (Disputed, Suspended, Revoked)
**Example:**
```rust
// In DRP program
use anchor_lang::prelude::*;

// CPI to Spore's update_status
pub fn resolve_dispute(ctx: Context<ResolveDispute>, resolution: Resolution) -> Result<()> {
    // Verify arbiter is whitelisted
    require!(
        ctx.accounts.arbiter_config.is_whitelisted(&ctx.accounts.arbiter.key()),
        DrpError::UnauthorizedArbiter
    );
    
    // Determine new IP status based on resolution
    let new_status = match resolution {
        Resolution::InFavorOfClaimant => IPStatus::Suspended,
        Resolution::InFavorOfRespondent => IPStatus::Active,
        Resolution::PartiallyUpheld => IPStatus::Disputed, // remains disputed
    };
    
    // CPI to Spore update_status
    // DRP program signs as PDA authority
    let cpi_accounts = mycelium_spore::cpi::accounts::UpdateStatus {
        ip_asset: ctx.accounts.ip_asset.to_account_info(),
        authority: ctx.accounts.drp_authority.to_account_info(), // DRP PDA
    };
    let seeds = &[b"drp_authority", &[ctx.accounts.drp_authority_bump]];
    let signer_seeds = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.spore_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    mycelium_spore::cpi::update_status(cpi_ctx, new_status)?;
    
    Ok(())
}
```

### Anti-Patterns to Avoid
- **Storing raw content on-chain:** Only hashes and Arweave URIs go on-chain. MEP JSON goes to Arweave.
- **Synchronous similarity check in MCP request:** Image/audio hashing can be slow. Python sidecar handles async processing.
- **Single-transaction MEP generation:** The Ed25519 verify instruction + generate_mep instruction must be in the SAME transaction, but the Arweave upload happens BEFORE the transaction.
- **Hardcoded DRP program ID in Spore:** Use a configurable account or feature flag so the DRP program ID can be updated without redeploying Spore.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perceptual image hashing | Custom DCT-based hash | `imagehash` library (pHash, dHash) | 8+ years of edge case handling, rotation/scale invariant |
| Audio fingerprinting | Custom spectral analysis | Chromaprint via `pyacoustid` | Industry standard (Shazam-like), handles noise, compression artifacts |
| Ed25519 signing | Manual curve25519 math | `tweetnacl` or `@solana/web3.js` Ed25519Program | Cryptographic implementation must be audited, not hand-rolled |
| Arweave uploads | Direct Arweave node interaction | `@irys/upload` (already integrated) | Handles bundling, payment, receipt verification |
| Hamming distance for hash comparison | Manual bitwise comparison | PostgreSQL bit_count + XOR on BIT(64) columns | Database-native, indexed, handles millions of comparisons |

**Key insight:** The similarity detection stack is a solved problem -- imagehash and Chromaprint are canonical. The evidence engine is the novel part (jurisdiction formatting, MEP structure, Ed25519 signing flow).

## Common Pitfalls

### Pitfall 1: Ed25519 Instruction Ordering in Transaction
**What goes wrong:** The Ed25519 signature verification instruction MUST be the first instruction (index 0) in the transaction. Meridian's generate_mep loads instruction at index 0 from the instructions sysvar.
**Why it happens:** Developers put generate_mep first, Ed25519 verify second.
**How to avoid:** Always build transaction as: `new Transaction().add(ed25519Ix).add(generateMepIx)`. The Meridian program hardcodes `load_instruction_at_checked(0, ...)`.
**Warning signs:** `MissingEd25519Verification` error from Meridian.

### Pitfall 2: Package Hash Mismatch Between Arweave Content and On-Chain Record
**What goes wrong:** The SHA-256 hash stored on-chain doesn't match the content on Arweave, making evidence unverifiable.
**Why it happens:** JSON serialization is non-deterministic (key ordering). Computing hash before upload but uploading slightly different serialization.
**How to avoid:** Serialize JSON once, compute hash on that exact byte string, upload that exact byte string. Use `JSON.stringify()` with sorted keys or a canonical serialization.
**Warning signs:** `verify_mep` returns `is_valid: false`.

### Pitfall 3: Chromaprint Binary Not Found on Windows
**What goes wrong:** pyacoustid fails at runtime because fpcalc.exe is not in PATH.
**Why it happens:** Chromaprint is a C library with a separate binary; pip install only gets the Python wrapper.
**How to avoid:** Download fpcalc.exe from acoustid.org, add to PATH or set FPCALC_PATH. Add startup health check in Python sidecar.
**Warning signs:** `FileNotFoundError: fpcalc` or `chromaprint.FingerprintGenerationError`.

### Pitfall 4: Spore UpdateStatus Authority Constraint for CPI
**What goes wrong:** DRP program cannot call Spore's update_status because the authority constraint only allows `ip_asset.creator`.
**Why it happens:** Current Spore code: `constraint = authority.key() == ip_asset.creator`. DRP PDA is not the creator.
**How to avoid:** Modify Spore's UpdateStatus to accept EITHER `ip_asset.creator` OR a known DRP program PDA. Use `#[account(constraint = authority.key() == ip_asset.creator || authority.key() == DRP_AUTHORITY)]`.
**Warning signs:** `Unauthorized` error from Spore when DRP tries CPI.

### Pitfall 5: Perceptual Hash Storage Format Mismatch
**What goes wrong:** Python computes imagehash as hex string, TypeScript stores perceptual_hash as 32-byte array on-chain, PostgreSQL needs BIT column for Hamming distance.
**Why it happens:** Three different representation formats across three systems.
**How to avoid:** Standardize: store as hex string in PostgreSQL (VARCHAR), convert to bytes only for on-chain storage, convert back for comparison. The Python sidecar compares against the PostgreSQL hex strings.
**Warning signs:** All similarity scores return 0.0 or 1.0 (binary, no gradation).

### Pitfall 6: UU ITE Pasal 5 Compliance Requirements
**What goes wrong:** Evidence package is technically valid but doesn't meet Indonesian court admissibility standards.
**Why it happens:** UU ITE Pasal 5 requires that electronic evidence: (1) uses a compliant Electronic System, (2) can be displayed and accessed, (3) integrity is guaranteed, (4) is juridically justifiable.
**How to avoid:** MEP must include: integrity proof (SHA-256 hash chain), accessibility proof (permanent Arweave URI), system compliance statement (protocol description), verification instructions in Bahasa Indonesia.
**Warning signs:** Evidence rejected by Indonesian Commercial Court.

## Code Examples

### Ed25519 Signing + Meridian generate_mep Transaction
```typescript
// Source: Meridian lib.rs Ed25519 instruction data layout (lines 86-98)
import { Ed25519Program } from "@solana/web3.js";
import nacl from "tweetnacl";

// 1. Compute package hash
const mepJsonString = JSON.stringify(mepData, Object.keys(mepData).sort());
const packageHash = crypto.createHash('sha256').update(mepJsonString).digest();

// 2. Sign with protocol authority
const protocolSignature = nacl.sign.detached(packageHash, protocolKeypair.secretKey);

// 3. Build Ed25519 verify instruction (MUST be index 0)
const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
  privateKey: protocolKeypair.secretKey,
  message: packageHash,
});

// 4. Build generate_mep instruction
const [evidencePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("evidence"), ipAssetPubkey.toBuffer(), requester.toBuffer()],
  PROGRAM_IDS.meridian
);

const generateMepIx = await meridianProgram.methods
  .generateMep(
    Array.from(packageHash),           // [u8; 32]
    arweaveUri,                         // String
    Array.from(protocolSignature),      // [u8; 64]
    licenseCount,                       // u32
    new BN(totalRoyalties),            // u64
    { indonesia: {} }                   // Jurisdiction enum
  )
  .accounts({
    evidencePackage: evidencePda,
    ipAsset: ipAssetPubkey,
    requester: requester,
    instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    systemProgram: SystemProgram.programId,
  })
  .instruction();

// 5. Submit transaction (Ed25519 FIRST)
const tx = new Transaction().add(ed25519Ix).add(generateMepIx);
```

### Python Similarity Oracle FastAPI Service
```python
# similarity-oracle/main.py
from fastapi import FastAPI, UploadFile, File
from PIL import Image
import imagehash
import io
import psycopg2

app = FastAPI(title="Mycelium Similarity Oracle")

@app.post("/similarity/image")
async def check_image(file: UploadFile = File(...), threshold: int = 10):
    """Compare uploaded image against all indexed perceptual hashes."""
    img = Image.open(io.BytesIO(await file.read()))
    query_phash = str(imagehash.phash(img))
    query_dhash = str(imagehash.dhash(img))
    
    # Query PostgreSQL for all stored hashes
    conn = psycopg2.connect(dsn=DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT pubkey, perceptual_hash_hex 
        FROM ip_assets 
        WHERE status = 0
    """)
    
    matches = []
    for pubkey, stored_hash_hex in cur.fetchall():
        stored_hash = imagehash.hex_to_hash(stored_hash_hex)
        query_hash_obj = imagehash.hex_to_hash(query_phash)
        distance = query_hash_obj - stored_hash  # Hamming distance
        if distance <= threshold:
            score = 1.0 - (distance / 64.0)  # Normalize to 0-1
            matches.append({
                "pubkey": pubkey,
                "score": round(score, 4),
                "matchType": "exact" if distance == 0 else "near_duplicate",
                "distance": distance,
            })
    
    matches.sort(key=lambda m: m["score"], reverse=True)
    return {"matches": matches}

@app.post("/similarity/audio")
async def check_audio(file: UploadFile = File(...)):
    """Compare uploaded audio against all indexed Chromaprint fingerprints."""
    import acoustid
    # Save temp file (fpcalc requires file path)
    temp_path = f"/tmp/{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    duration, fingerprint = acoustid.fingerprint_file(temp_path)
    # Compare against stored fingerprints in PostgreSQL
    # ...
    return {"matches": [...]}

@app.get("/health")
async def health():
    """Startup health check -- verify fpcalc is available."""
    import shutil
    fpcalc = shutil.which("fpcalc")
    return {
        "status": "ok",
        "fpcalc_available": fpcalc is not None,
        "fpcalc_path": fpcalc,
    }
```

### DRP Program Skeleton (Anchor/Rust)
```rust
// programs/mycelium-drp/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("DRPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); // placeholder

pub const DRP_AUTHORITY_SEED: &[u8] = b"drp_authority";

#[program]
pub mod mycelium_drp {
    use super::*;

    pub fn file_dispute(
        ctx: Context<FileDispute>,
        evidence_hashes: Vec<[u8; 32]>,
        similarity_score: u16,      // basis points 0-10000
        match_type: MatchType,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let dispute = &mut ctx.accounts.dispute;
        dispute.claimant = ctx.accounts.claimant.key();
        dispute.respondent = ctx.accounts.ip_asset.creator;  // IP owner
        dispute.ip_asset = ctx.accounts.ip_asset.key();
        dispute.stage = DisputeStage::DirectResolution;
        dispute.evidence_hashes = evidence_hashes;
        dispute.similarity_score = similarity_score;
        dispute.match_type = match_type;
        dispute.arbiter = None;
        dispute.resolution = None;
        dispute.filed_slot = clock.slot;
        dispute.deadline_slot = clock.slot + DISPUTE_DEADLINE_SLOTS;
        dispute.bump = ctx.bumps.dispute;
        Ok(())
    }

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: Resolution,
    ) -> Result<()> {
        // Verify arbiter is whitelisted
        // Update dispute PDA
        // CPI to Spore update_status if resolution changes IP status
        Ok(())
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getProgramAccounts for similarity scan | PostgreSQL index with perceptual hash columns | Phase 2 (indexer) | Scalable similarity queries |
| Mock evidence URLs | Arweave permanent URIs via Irys | Phase 2 (02-03) | Real permanent storage |
| Manual Borsh for Meridian | Anchor IDL client | Phase 1 (01-02) | Type-safe MEP generation |

**Deprecated/outdated:**
- The current `generateEvidence` in solana-live-adapter.ts returns fake data (mock hash, mock URL). Must be fully replaced.
- The current `checkSimilarity` does a full search scan then filters. Must use PostgreSQL index + Python sidecar for perceptual matching.
- `fileDispute` throws "not implemented" -- must be replaced with DRP program integration.

## Open Questions

1. **Spore Redeployment for DRP Authority**
   - What we know: Spore's UpdateStatus currently only allows ip_asset.creator as authority. DRP CPI requires expanding this.
   - What's unclear: Whether to use a hardcoded DRP program ID constant (like PROTOCOL_AUTHORITY in Meridian) or a dynamic account-based check.
   - Recommendation: Use a hardcoded constant `DRP_PROGRAM: Pubkey` in Spore -- simpler, auditable, and DRP program ID is known at deployment. This requires Spore redeployment.

2. **Perceptual Hash Storage Column in PostgreSQL**
   - What we know: The ip_assets table doesn't currently store perceptual_hash. The on-chain IPAsset has perceptual_hash as [u8; 32].
   - What's unclear: Whether the Helius webhook event parser extracts perceptual_hash.
   - Recommendation: Add `perceptual_hash_hex VARCHAR(64)` column to ip_assets table. Update event parser to extract it.

3. **Chromaprint Fingerprint Storage**
   - What we know: Chromaprint produces variable-length fingerprints (integer array).
   - What's unclear: Best PostgreSQL column type for fingerprint storage and comparison.
   - Recommendation: Store as `INTEGER[]` (Chromaprint raw) or `TEXT` (base64 encoded). For comparison, use the Python sidecar (not SQL) since Chromaprint comparison requires its own algorithm.

4. **MEP JSON Schema Stability**
   - What we know: The MEP is the legally significant artifact. Its structure determines court admissibility.
   - What's unclear: Whether the MEP schema needs formal versioning from day one.
   - Recommendation: Include a `mep_version: "1.0"` field in the MEP JSON. This is low-cost and prevents breaking changes later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 | Similarity Oracle | Yes | 3.12.10 | -- |
| FastAPI | Similarity sidecar | Yes | 0.135.2 | -- |
| Pillow | imagehash | Yes | 12.2.0 | -- |
| imagehash | Image pHash/dHash (SIM-02) | No | -- | pip install imagehash |
| pyacoustid | Audio Chromaprint (SIM-03) | No | -- | pip install pyacoustid |
| fpcalc (Chromaprint) | Audio fingerprinting binary | No | -- | Download from acoustid.org/chromaprint |
| uvicorn | ASGI server for FastAPI | No | -- | pip install uvicorn |
| Node.js | MCP server / Evidence Engine | Yes | 24.12.0 | -- |
| PostgreSQL | Hash index | Yes (via env) | -- | Required, no fallback |
| tweetnacl (npm) | Ed25519 signing | No | -- | npm install tweetnacl |
| Anchor CLI | DRP program build | No (Windows) | -- | Build on WSL or remote; cannot build natively on Windows |

**Missing dependencies with no fallback:**
- Anchor CLI for building DRP program -- requires WSL, Linux VM, or CI pipeline. Cannot compile Anchor/Rust programs natively on Windows 11.

**Missing dependencies with fallback:**
- imagehash, pyacoustid, uvicorn, fpcalc -- all installable via pip + binary download
- tweetnacl -- installable via npm

## Sources

### Primary (HIGH confidence)
- Meridian program source: `programs/mycelium-meridian/src/lib.rs` -- full Ed25519 verification logic, MEP PDA structure
- Spore program source: `programs/mycelium-spore/src/lib.rs` -- UpdateStatus authority constraint, IPAsset structure
- Phase 2 summaries: 02-01, 02-02, 02-03 -- infrastructure already built (Irys uploader, PostgreSQL, Helius indexer)
- Existing types.ts: EvidencePackage, Dispute, SimilarityResult type definitions

### Secondary (MEDIUM confidence)
- [UU ITE Pasal 5 electronic evidence](https://www.hukumonline.com/klinik/a/syarat-dan-kekuatan-hukum-alat-bukti-elektronik-cl5461/) -- Indonesian electronic evidence admissibility requirements
- [WIPO Arbitration Rules](https://www.wipo.int/amc/en/arbitration/rules/index.html) -- WIPO electronic submission format
- [Anchor CPI documentation](https://www.anchor-lang.com/docs/basics/cpi) -- CpiContext patterns for program-to-program calls
- [Chromaprint AcoustID](https://acoustid.org/chromaprint) -- Windows binary download for fpcalc
- [ImageHash PyPI](https://pypi.org/project/ImageHash/) -- pHash/dHash Python library

### Tertiary (LOW confidence)
- MEP JSON schema -- no formal standard exists; our design is novel. Must be reviewed by legal counsel for jurisdiction compliance.
- Chromaprint comparison algorithm specifics -- correlation-based, not well-documented for custom implementations.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are established, most already in project
- Architecture (Evidence Engine): HIGH -- Meridian program is complete, Irys uploader exists, flow is well-defined
- Architecture (Similarity Oracle): MEDIUM -- Python sidecar pattern is straightforward but Chromaprint Windows binary is untested
- Architecture (DRP Program): MEDIUM -- CPI pattern is standard Anchor, but Spore modification requires redeployment
- Pitfalls: HIGH -- based on direct code analysis of existing programs
- Legal compliance (UU ITE/WIPO): LOW -- requires legal counsel review, not just technical implementation

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain, 30 days)
