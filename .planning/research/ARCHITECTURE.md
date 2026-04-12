# Architecture Research

**Domain:** Solana protocol with off-chain services (indexer, storage, ML, PDF generation, key management)
**Researched:** 2026-04-12
**Confidence:** HIGH (on-chain patterns well-established, off-chain integration patterns verified via Helius docs and production protocols)

## System Overview

```
                            CLIENTS
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  AI Agents   │    │  Next.js UI  │    │  External    │
  │  (via MCP)   │    │  (browser)   │    │  Consumers   │
  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
         │                   │                   │
─────────┴───────────────────┴───────────────────┴──────────
                     GATEWAY LAYER
  ┌──────────────────────────────────────────────────────┐
  │              MCP Server (TypeScript)                  │
  │  SolanaAdapter interface  │  Orchestration logic      │
  │  Webhook receiver (HTTP)  │  Job queue dispatch       │
  └──────┬──────────┬─────────┬──────────┬───────────────┘
         │          │         │          │
─────────┴──────────┴─────────┴──────────┴──────────────────
                   SERVICE LAYER
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Indexer  │  │ Storage  │  │Similarity│  │ Evidence │
  │ Service  │  │ Service  │  │ Oracle   │  │ Engine   │
  │ (Helius  │  │ (Irys/   │  │ (Python  │  │ (TS,     │
  │  webhooks│  │  Arweave)│  │  FastAPI)│  │  PDFKit) │
  │  + local │  │          │  │          │  │          │
  │  Postgres│  │          │  │          │  │          │
  └──────┬───┘  └──────┬───┘  └─────┬────┘  └─────┬────┘
         │             │            │              │
─────────┴─────────────┴────────────┴──────────────┴────────
                   STATE LAYER
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   Solana     │  │   Arweave    │  │  PostgreSQL  │
  │  (PDAs,      │  │  (metadata,  │  │  (index,     │
  │   on-chain)  │  │   MEPs,      │  │   similarity │
  │              │  │   evidence)  │  │   cache,     │
  │              │  │              │  │   agent keys)│
  └──────────────┘  └──────────────┘  └──────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary Rule |
|-----------|----------------|---------------|
| **MCP Server** | Agent-facing API, tool dispatch, orchestration of multi-step flows | Stateless request handler. No business state. Delegates to services. |
| **Indexer Service** | Listen to on-chain events (Helius webhooks), maintain queryable index in Postgres | Write-path: webhook receiver. Read-path: query API. Never writes to chain. |
| **Storage Service** | Upload metadata/MEPs to Arweave via Irys, return permanent URIs | Receives bytes + tags, returns URI. Handles Irys SDK, retries, receipt validation. |
| **Similarity Oracle** | Compute perceptual hashes (pHash for images, Chromaprint for audio), compare against index | Receives content, returns similarity score + matches. Python because ML libraries. |
| **Evidence Engine** | Generate court-ready PDF packages, format per jurisdiction, anchor hash to chain | Receives IP data + jurisdiction, produces PDF bytes + Arweave URI. |
| **Key Vault** | Derive and store per-agent HD wallets, sign transactions on behalf of agents | BIP-44 derivation from master seed. Encrypted at rest. Never exposes private keys. |
| **Solana Programs** | Authoritative on-chain state (IPAsset, License, Royalty, Evidence PDAs) | Immutable once deployed. Only source of truth for ownership/timestamps. |
| **PostgreSQL** | Indexed views of on-chain data, similarity hash index, agent wallet metadata | Disposable/rebuildable from chain. Not authoritative — Solana is. |

## Component Boundaries (What Talks to What)

```
MCP Server ──────► Solana RPC (direct: register, license, royalty txs)
MCP Server ──────► Storage Service (upload metadata before registration)
MCP Server ──────► Similarity Oracle (pre-registration similarity check)
MCP Server ──────► Evidence Engine (generate MEP on demand)
MCP Server ──────► Key Vault (get/create agent keypair for signing)
MCP Server ──────► Indexer Service (search, browse, provenance queries)

Helius ──webhook──► Indexer Service (on-chain events push)
Indexer Service ──► PostgreSQL (write parsed event data)

Evidence Engine ──► Storage Service (anchor PDF to Arweave)
Evidence Engine ──► Solana RPC (create MEP PDA via Meridian)
Evidence Engine ──► Indexer Service (fetch IP history for evidence)

Similarity Oracle ──► PostgreSQL (read/write perceptual hash index)

Key Vault ──► PostgreSQL (encrypted key storage)

Next.js Frontend ──► Solana RPC (direct, via wallet-adapter)
Next.js Frontend ──► Indexer Service (search/browse API)
```

**Iron rule:** No service talks to another service's database directly. All inter-service communication is via HTTP APIs or message queues.

## Data Flow

### Flow 1: IP Registration (Full Pipeline)

```
Agent calls register_ip via MCP
    │
    ├─1─► Key Vault: get/derive agent keypair
    │         └─► Returns: Keypair (or pubkey + signing proxy)
    │
    ├─2─► Similarity Oracle: check content similarity
    │         ├─► Computes pHash/Chromaprint from content
    │         ├─► Queries PostgreSQL hash index
    │         └─► Returns: similarity_score, matches[]
    │
    ├─3─► Storage Service: upload metadata to Arweave
    │         ├─► Irys SDK bundles + uploads
    │         └─► Returns: arweave_uri (permanent)
    │
    ├─4─► Solana RPC: send register_ip transaction
    │         ├─► Derives PDA from (creator, content_hash)
    │         ├─► Signs with agent keypair
    │         └─► Returns: tx_signature, pda_pubkey
    │
    └─5─► (async) Helius webhook fires → Indexer Service
              ├─► Parses RegisterIP event
              ├─► Writes to PostgreSQL index
              └─► Updates similarity hash index
```

**Critical ordering:** Steps 1-3 are prerequisites for step 4. Step 5 is async (happens after tx confirms). The MCP server orchestrates steps 1-4 synchronously, then returns to the agent. The indexer picks up step 5 independently.

### Flow 2: Evidence Package Generation (MEP)

```
Agent/User requests evidence package
    │
    ├─1─► Indexer Service: fetch full IP history
    │         ├─► Registration timestamp, ownership chain
    │         ├─► License history, royalty records
    │         └─► Returns: structured IP timeline
    │
    ├─2─► Evidence Engine: generate PDF
    │         ├─► Formats per jurisdiction (ID, KE, CO, WIPO)
    │         ├─► Includes: PoH timestamp, content hash, chain-of-title
    │         ├─► Computes SHA-256 of final PDF
    │         └─► Returns: pdf_bytes, pdf_hash
    │
    ├─3─► Storage Service: upload PDF to Arweave
    │         └─► Returns: arweave_uri
    │
    ├─4─► Key Vault: get protocol authority keypair
    │
    └─5─► Solana RPC: create EvidencePackage PDA (Meridian)
              ├─► Stores: pdf_hash, arweave_uri, jurisdiction
              └─► Returns: tx_signature, evidence_pda
```

### Flow 3: Similarity Check (Standalone)

```
Content submitted for similarity check
    │
    ├─1─► Similarity Oracle: /analyze endpoint
    │         ├─► Image: compute pHash (DCT-based, 64-bit)
    │         ├─► Audio: compute Chromaprint fingerprint
    │         ├─► Text: compute SimHash or MinHash
    │         └─► Returns: perceptual_hash
    │
    └─2─► Similarity Oracle: /compare endpoint
              ├─► Query PostgreSQL: hamming_distance < threshold
              ├─► Threshold: images ≤5 bits, audio ≤10 bits
              └─► Returns: [{ip_id, distance, similarity_pct}]
```

### Flow 4: Helius Webhook Processing

```
Solana transaction confirms
    │
    ├─► Helius detects account change on watched programs
    │
    ├─► Helius sends webhook POST to /webhooks/helius
    │       Body: Enhanced transaction with parsed instructions
    │
    └─► Indexer Service processes:
            ├─► Validates webhook signature (Helius auth token)
            ├─► Parses instruction discriminator → event type
            ├─► Extracts: accounts, data, slot, timestamp
            ├─► Upserts to PostgreSQL:
            │     ├─► ip_assets table (registrations, transfers)
            │     ├─► licenses table (templates, acquisitions)
            │     ├─► royalties table (configs, deposits, distributions)
            │     └─► evidence table (MEP packages)
            └─► Emits internal event (for real-time subscriptions)
```

## Recommended Project Structure

```
mycelium/
├── programs/                    # On-chain (existing, Anchor/Rust)
│   ├── mycelium-spore/
│   ├── mycelium-hypha/
│   ├── mycelium-rhizome/
│   └── mycelium-meridian/
│
├── packages/                    # Shared TypeScript packages
│   ├── types/                   # Shared types, IDL client (generated)
│   │   ├── src/idl/             # Generated from Anchor IDL
│   │   └── src/types.ts         # IPAsset, License, etc.
│   └── common/                  # PDA derivation, constants, utils
│       ├── src/pda.ts
│       └── src/constants.ts
│
├── services/                    # Off-chain services
│   ├── mcp-server/              # MCP server (existing src/, refactored)
│   │   ├── src/index.ts
│   │   ├── src/solana-adapter.ts
│   │   ├── src/solana-live-adapter.ts
│   │   └── src/orchestrator.ts  # Multi-step flow coordination
│   │
│   ├── indexer/                 # Helius webhook receiver + query API
│   │   ├── src/webhook.ts       # POST /webhooks/helius
│   │   ├── src/parser.ts        # Transaction → domain events
│   │   ├── src/query.ts         # Search/browse/provenance APIs
│   │   └── src/db.ts            # PostgreSQL connection + queries
│   │
│   ├── storage/                 # Arweave/Irys upload service
│   │   ├── src/upload.ts        # Irys SDK wrapper
│   │   ├── src/verify.ts        # Receipt verification
│   │   └── src/gateway.ts       # Arweave gateway URL builder
│   │
│   ├── evidence/                # PDF generation + anchoring
│   │   ├── src/generator.ts     # PDF layout (PDFKit or Puppeteer)
│   │   ├── src/templates/       # Jurisdiction-specific templates
│   │   │   ├── indonesia.ts
│   │   │   ├── wipo.ts
│   │   │   └── generic.ts
│   │   └── src/anchor.ts        # Hash + Arweave + Meridian PDA
│   │
│   └── key-vault/               # Agent key management
│       ├── src/derive.ts        # BIP-44 HD derivation
│       ├── src/store.ts         # Encrypted key storage (Postgres)
│       └── src/signer.ts        # Transaction signing proxy
│
├── oracle/                      # Python similarity service (separate runtime)
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── phash.py             # Image perceptual hashing
│   │   ├── chromaprint.py       # Audio fingerprinting
│   │   ├── simhash.py           # Text similarity
│   │   ├── index.py             # Hash index queries
│   │   └── models.py            # Pydantic schemas
│   ├── requirements.txt
│   └── Dockerfile
│
├── app/                         # Next.js frontend (existing)
│   └── src/
│
├── infra/                       # Deployment configs
│   ├── docker-compose.yml       # Local dev: Postgres + oracle + services
│   └── helius-webhook.json      # Webhook registration config
│
└── tests/                       # Anchor tests (existing)
```

### Structure Rationale

- **packages/types and packages/common** extract the shared IDL client, PDA derivation, and constants that are currently duplicated between MCP server, frontend, and tests. Single source of truth eliminates the discriminator mismatch bug class.
- **services/** groups all TypeScript off-chain services. They share a runtime (Node.js) and can be deployed as separate processes or a single monolith initially.
- **oracle/** is separate because Python. Different runtime, different dependency tree, different container. Communicates with the rest via HTTP only.
- **infra/** keeps deployment concerns out of application code.

## Architectural Patterns

### Pattern 1: Webhook-Driven Indexing (not polling)

**What:** Helius pushes parsed transaction data to your HTTP endpoint whenever your watched programs are involved. You parse and store, never poll.

**When to use:** Always, for any Solana protocol that needs queryable views of on-chain data.

**Trade-offs:**
- Pro: Near-real-time (sub-second after confirmation), no RPC polling cost, Helius handles parsing
- Pro: Enhanced transactions include decoded instruction data — you don't need to parse raw Borsh
- Con: Webhook delivery is at-least-once — your handler must be idempotent
- Con: Helius is a single vendor dependency — if it goes down, your index stops updating
- Mitigation: Store `last_processed_slot` and backfill from Helius historical API on recovery

**Example:**
```typescript
// POST /webhooks/helius
app.post('/webhooks/helius', async (req, res) => {
  const events = req.body; // Array of enhanced transactions
  for (const tx of events) {
    // Idempotent: upsert by tx signature
    if (await db.hasTransaction(tx.signature)) continue;

    for (const ix of tx.instructions) {
      if (ix.programId === SPORE_PROGRAM_ID) {
        await processSporeInstruction(ix, tx.slot, tx.timestamp);
      }
    }
    await db.markProcessed(tx.signature, tx.slot);
  }
  res.status(200).send('ok'); // Must respond quickly
});
```

### Pattern 2: Upload-Before-Register (Off-chain First)

**What:** Upload metadata to Arweave BEFORE submitting the on-chain registration transaction. The on-chain PDA stores the Arweave URI, not the metadata itself.

**When to use:** Every IP registration. Content never goes on-chain.

**Trade-offs:**
- Pro: On-chain storage cost stays fixed (~0.002 SOL per PDA regardless of metadata size)
- Pro: Arweave URI is permanent — no link rot
- Con: Two-phase operation — upload can succeed but registration can fail (orphaned Arweave data)
- Mitigation: Orphaned Arweave uploads are harmless (permanent but unreferenced). Retry registration.

**Example:**
```typescript
async function registerIPWithMetadata(params: RegisterParams) {
  // Phase 1: Upload metadata to Arweave
  const metadata = buildMetadata(params);
  const arweaveUri = await storageService.upload(
    JSON.stringify(metadata),
    [{ name: 'Content-Type', value: 'application/json' },
     { name: 'App-Name', value: 'Mycelium' },
     { name: 'IP-Type', value: params.ipType }]
  );

  // Phase 2: Register on-chain with URI reference
  return await solanaAdapter.registerIP({
    ...params,
    metadataUri: arweaveUri,
  });
}
```

### Pattern 3: Sidecar Oracle (Python Service via HTTP)

**What:** The similarity oracle runs as a separate Python process (FastAPI), exposed via HTTP, called synchronously by the MCP server during registration flows.

**When to use:** When you need libraries that only exist in Python (imagehash, chromaprint, numpy) but your main stack is TypeScript.

**Trade-offs:**
- Pro: Best-in-class ML libraries (imagehash for pHash, chromaprint via fpcalc, scipy for distance)
- Pro: Independent scaling — can run on GPU instance later for CLIP embeddings
- Con: Network hop adds ~50-200ms latency per call
- Con: Another process to deploy and monitor
- Mitigation: Similarity check is pre-registration (not blocking real-time UX). 200ms is fine.

**Example:**
```python
# oracle/app/main.py
from fastapi import FastAPI, UploadFile
from imagehash import phash
from PIL import Image
import io

app = FastAPI()

@app.post("/analyze/image")
async def analyze_image(file: UploadFile):
    img = Image.open(io.BytesIO(await file.read()))
    hash_value = str(phash(img, hash_size=8))  # 64-bit DCT hash
    return {"perceptual_hash": hash_value, "algorithm": "phash", "hash_size": 64}

@app.post("/compare")
async def compare(hash: str, threshold: int = 5):
    matches = await db.query_similar(hash, max_distance=threshold)
    return {"matches": matches, "threshold": threshold}
```

### Pattern 4: HD Wallet Derivation for Multi-Agent Key Management

**What:** Derive per-agent Solana keypairs from a single master seed using BIP-44 paths: `m/44'/501'/{agent_index}'/0'`. Each agent gets a deterministic, unique keypair. Master seed encrypted at rest.

**When to use:** When multiple AI agents need independent on-chain identities but you control the infrastructure.

**Trade-offs:**
- Pro: Deterministic — same seed + index = same keypair. Recoverable from backup.
- Pro: No key distribution problem — derive on demand, never transmit private keys
- Con: Master seed is a single point of compromise — if leaked, all agent keys are exposed
- Mitigation: Encrypt master seed with AES-256-GCM, store encryption key in env var or KMS. Never log or serialize private keys.

**Example:**
```typescript
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';

function deriveAgentKeypair(masterSeed: Buffer, agentIndex: number): Keypair {
  const path = `m/44'/501'/${agentIndex}'/0'`;
  const derived = derivePath(path, masterSeed.toString('hex'));
  return Keypair.fromSeed(derived.key);
}

// Agent registration
function getOrCreateAgentWallet(agentId: string): Keypair {
  const index = await db.getAgentIndex(agentId); // auto-increment
  const seed = bip39.mnemonicToSeedSync(process.env.MASTER_MNEMONIC!);
  return deriveAgentKeypair(seed, index);
}
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1K IPs (devnet/early mainnet) | Single Node.js process runs MCP + indexer + storage + evidence. SQLite or single Postgres. Oracle as sidecar container. |
| 1K-100K IPs | Separate indexer process (webhook volume increases). Postgres with proper indexes on content_hash, creator, perceptual_hash. Add BullMQ for async evidence generation. |
| 100K+ IPs | Dedicated Postgres replica for reads. Oracle scales horizontally (stateless). Consider Helius gRPC/LaserStream instead of webhooks for lower latency. Add Redis for caching hot queries. |

### Scaling Priorities

1. **First bottleneck: Indexer write throughput.** Helius webhooks batch transactions. If your handler is slow, Helius retries and you get duplicates. Fix: idempotent upserts, batch inserts, respond 200 before processing (use a queue).
2. **Second bottleneck: Similarity search.** Hamming distance queries over millions of hashes are O(n) without specialized indexing. Fix: Use PostgreSQL `bit_count(hash XOR query_hash)` with partial indexes, or switch to pgvector for embedding-based search post-mainnet.
3. **Third bottleneck: Arweave upload latency.** Irys bundles are fast (~1-5s) but can spike. Fix: Upload asynchronously, return a pending state, update index when Arweave receipt confirms.

## Anti-Patterns

### Anti-Pattern 1: Polling RPC for State Changes

**What people do:** `setInterval(() => connection.getAccountInfo(pda), 5000)` to detect changes.
**Why it's wrong:** Wastes RPC credits, misses events between polls, doesn't scale beyond a few accounts.
**Do this instead:** Helius webhooks or gRPC streams. Push, not pull.

### Anti-Pattern 2: Storing Content On-Chain

**What people do:** Put metadata JSON or file bytes into PDA account data.
**Why it's wrong:** Solana rent costs ~0.00089 SOL per byte per epoch. A 1KB metadata blob costs ~0.89 SOL/epoch. A 10KB image costs ~8.9 SOL/epoch.
**Do this instead:** Store SHA-256 hash + Arweave URI on-chain (fixed ~80 bytes). Put content on Arweave (permanent, ~$0.001 for 1KB).

### Anti-Pattern 3: Shared Keypair for All Agents

**What people do:** One server-side keypair signs everything, with `agentId` as a metadata field.
**Why it's wrong:** No on-chain attribution. Can't prove which agent registered what. Revoking one agent's access requires rotating the shared key (breaks all agents).
**Do this instead:** HD wallet derivation (Pattern 4 above). Each agent gets its own keypair. Revocation = delete that agent's index mapping.

### Anti-Pattern 4: Synchronous Evidence Generation

**What people do:** Block the MCP tool response while generating a 10-page PDF, uploading to Arweave, and creating the Meridian PDA.
**Why it's wrong:** Evidence generation takes 5-30 seconds. MCP tool timeout is typically 30s. Agents get timeouts on complex packages.
**Do this instead:** Return a job_id immediately. Agent polls or subscribes for completion. Evidence engine processes async via queue.

### Anti-Pattern 5: Python Oracle Accessing Solana Directly

**What people do:** Give the Python service its own Solana RPC connection and keypair.
**Why it's wrong:** Splits chain interaction across two runtimes. Two places to manage keys, handle errors, track nonces. Debugging is painful.
**Do this instead:** Oracle is pure computation: content in, hash out, similarity score out. All chain interaction goes through the TypeScript MCP server/indexer layer.

## Integration Points

### External Services

| Service | Integration Pattern | Key Details |
|---------|---------------------|-------------|
| **Helius** | Webhooks (POST to your endpoint) + Enhanced RPC | Auth via API key in header. Webhook types: ENHANCED (parsed) preferred over RAW. Watch specific program IDs. Free tier: 10K credits/day. |
| **Irys/Arweave** | `@irys/sdk` npm package, fund + upload | Pay with SOL. ~8ms upload, permanent storage. Tag uploads with `App-Name: Mycelium` for discoverability. Receipt contains Arweave TX ID. |
| **Solana RPC** | `@solana/web3.js` via SolanaAdapter | Use Helius RPC endpoint (same API key). Devnet vs mainnet via env var. Confirm with `confirmed` commitment (not `finalized` — too slow for UX). |
| **PostgreSQL** | Direct connection from indexer + key-vault + oracle | Single database, separate schemas per service. Migrations via Prisma or raw SQL. |

### Internal Boundaries

| Boundary | Communication | Protocol |
|----------|---------------|----------|
| MCP Server <-> Indexer | HTTP REST | GET /search, GET /ip/:id, GET /provenance/:id |
| MCP Server <-> Storage | HTTP REST or direct import | POST /upload (multipart), returns { uri, receipt } |
| MCP Server <-> Oracle | HTTP REST | POST /analyze/{type}, POST /compare |
| MCP Server <-> Key Vault | Direct import (same process initially) | getKeypair(agentId), signTransaction(agentId, tx) |
| MCP Server <-> Evidence | HTTP REST + async job | POST /generate (returns job_id), GET /status/:job_id |
| Helius -> Indexer | Webhook POST | One-way push. Indexer must respond 200 within 5s. |
| Evidence -> Storage | HTTP REST | Evidence engine uploads PDF via storage service |
| Evidence -> Indexer | HTTP REST | Evidence engine reads IP history via indexer API |

## Build Order (Dependencies)

The build order is dictated by data flow dependencies. Each layer depends on the one before it.

```
Phase 1 (Foundation):  Anchor IDL client + shared types package
                       └─► Eliminates discriminator bugs, unblocks everything
                       
Phase 2 (Index):       Helius webhook receiver + PostgreSQL schema + query API
                       └─► Unblocks: search, browse, provenance (currently mock-only)
                       └─► Depends on: shared types (Phase 1)
                       
Phase 3 (Storage):     Irys upload service + metadata pipeline
                       └─► Unblocks: real metadata URIs in registrations
                       └─► Depends on: nothing (can parallelize with Phase 2)
                       
Phase 4 (Keys):        HD wallet derivation + encrypted key store
                       └─► Unblocks: multi-agent support, replaces in-memory Map
                       └─► Depends on: PostgreSQL (Phase 2 sets up DB)
                       
Phase 5 (Oracle):      Python similarity service + hash index
                       └─► Unblocks: pre-registration similarity checks
                       └─► Depends on: PostgreSQL (Phase 2), Indexer populates hash data
                       
Phase 6 (Evidence):    PDF generator + jurisdiction templates + Meridian integration
                       └─► Unblocks: court-ready evidence packages
                       └─► Depends on: Storage (Phase 3), Indexer (Phase 2), Keys (Phase 4)
```

**Parallelization opportunities:** Phases 2 and 3 can run in parallel. Phase 4 can start as soon as PostgreSQL is up (mid-Phase 2). Phase 5 can start once the indexer populates the hash column. Phase 6 depends on almost everything else.

**Recommendation:** Do NOT try to build all services simultaneously. Each phase should produce a working, testable increment. The indexer (Phase 2) delivers the most immediate value because it replaces the current mock-only search with real on-chain data.

## Sources

- [Helius Webhooks Documentation](https://www.helius.dev/docs/webhooks) - Webhook setup, enhanced transaction format, auth
- [Helius Geyser Plugins Blog](https://www.helius.dev/blog/solana-geyser-plugins-streaming-data-at-the-speed-of-light) - gRPC streaming architecture
- [Helius Historical Data API](https://www.helius.dev/historical-data) - Backfill and indexing
- [Irys SDK (npm)](https://www.npmjs.com/package/@irys/sdk) - Upload API, receipt format
- [Irys GitHub](https://github.com/Irys-xyz/js-sdk) - TypeScript SDK source
- [Irys Gasless Uploader](https://github.com/Irys-xyz/gasless-uploader) - Server-side signing pattern for Solana
- [pHash.org](https://www.phash.org/) - Perceptual hashing algorithms and distance metrics
- [Python imagehash](https://github.com/JohannesBuchner/imagehash) - pHash implementation for Python
- [Solana BIP-44 Derivation](https://nick.af/articles/derive-solana-addresses) - Ed25519 HD key derivation paths
- [Solana Cookbook: Restore from Mnemonic](https://solana.com/developers/cookbook/wallets/restore-from-mnemonic) - Official derivation examples
- [Helius Smart Wallets Blog](https://www.helius.dev/blog/solana-smart-wallets) - Agent wallet architecture patterns

---
*Architecture research for: Mycelium Protocol off-chain service integration*
*Researched: 2026-04-12*
