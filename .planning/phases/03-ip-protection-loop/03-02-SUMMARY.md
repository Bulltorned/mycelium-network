---
phase: 03-ip-protection-loop
plan: 02
subsystem: similarity-oracle
tags: [similarity, phash, chromaprint, fastapi, postgresql]
dependency_graph:
  requires: []
  provides: [similarity-oracle-sidecar, similarity-client, perceptual-hash-schema]
  affects: [solana-live-adapter, solana-mock-adapter, ip-assets-schema]
tech_stack:
  added: [fastapi, imagehash, pyacoustid, psycopg2-binary, pillow]
  patterns: [python-sidecar, http-client-bridge, perceptual-hashing, graceful-degradation]
key_files:
  created:
    - similarity-oracle/main.py
    - similarity-oracle/image_hasher.py
    - similarity-oracle/audio_fingerprinter.py
    - similarity-oracle/requirements.txt
    - src/services/similarity/similarity-client.ts
  modified:
    - src/services/db/schema.sql
    - src/solana-live-adapter.ts
    - .gitignore
decisions:
  - Python FastAPI sidecar on port 8100 (separate process, not embedded in Node)
  - pHash chosen as primary image hash (robust against scaling, compression)
  - Audio fingerprinting is best-effort with graceful degradation when fpcalc unavailable
  - Exact match via PostgreSQL indexed lookup (O(1)), not full table scan
  - Mock adapter already had correct SIM-01 behavior, no changes needed
metrics:
  completed: 2026-04-13
  tasks: 2/2
  files_created: 5
  files_modified: 3
---

# Phase 03 Plan 02: Similarity Oracle Summary

Python FastAPI sidecar with pHash/dHash image hashing and Chromaprint audio fingerprinting, backed by PostgreSQL perceptual hash columns, with TypeScript HTTP client replacing the full-scan stub in the live adapter.

## Completed Tasks

| # | Task | Files |
|---|------|-------|
| 1 | Python Similarity Oracle sidecar + DB schema update | similarity-oracle/main.py, image_hasher.py, audio_fingerprinter.py, requirements.txt, src/services/db/schema.sql |
| 2 | TypeScript similarity client + live adapter + mock adapter wiring | src/services/similarity/similarity-client.ts, src/solana-live-adapter.ts |

## What Was Built

### Python Sidecar (similarity-oracle/)

Four-file FastAPI service running on port 8100:

- **main.py**: FastAPI app with 4 endpoints:
  - `GET /health` -- dependency status (database, fpcalc)
  - `POST /similarity/image` -- pHash matching with configurable Hamming distance threshold
  - `POST /similarity/audio` -- Chromaprint fingerprinting (graceful degradation if fpcalc missing)
  - `POST /similarity/exact` -- O(1) content hash lookup via PostgreSQL index

- **image_hasher.py**: pHash and dHash computation via imagehash library. Exports `compute_phash`, `compute_dhash`, `hamming_distance`, `similarity_score`.

- **audio_fingerprinter.py**: Chromaprint fingerprinting via pyacoustid. Checks for fpcalc binary availability. Exports `compute_fingerprint`, `compare_fingerprints`, `check_fpcalc_available`.

- **requirements.txt**: fastapi, uvicorn, imagehash, pyacoustid, Pillow, numpy, psycopg2-binary, python-multipart.

### PostgreSQL Schema Update

Added to ip_assets table:
- `perceptual_hash_hex VARCHAR(64)` -- stores hex-encoded pHash for image assets
- `audio_fingerprint TEXT` -- stores Chromaprint fingerprint for audio assets
- Partial index `idx_ip_assets_perceptual_hash` on `perceptual_hash_hex WHERE NOT NULL`

### TypeScript Client (src/services/similarity/similarity-client.ts)

HTTP client wrapping all sidecar endpoints:
- `checkOracleHealth()` -- health check with graceful fallback
- `checkImageSimilarity(imageBuffer, threshold)` -- image pHash matching
- `checkAudioSimilarity(audioBuffer, filename)` -- audio fingerprinting
- `checkExactMatch(contentHash)` -- PostgreSQL exact hash lookup

All functions return `SimilarityCandidate[]` matching the protocol type system.

### Live Adapter Changes

- `checkSimilarity()` -- replaced full `searchIP(pageSize: 1000)` scan with PostgreSQL indexed exact match via `checkExactMatch()`
- `checkBinarySimilarity()` -- new method for image/audio file-based perceptual matching via sidecar

### Mock Adapter

Already had correct SIM-01 behavior (iterates mock assets, compares contentHash, returns score 1.0 with matchType "exact"). No changes needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Buffer-to-Blob TypeScript type incompatibility**
- **Found during:** Task 2
- **Issue:** `new Blob([buffer])` fails TypeScript strict checking because `Buffer` is not assignable to `BlobPart` due to SharedArrayBuffer type mismatch.
- **Fix:** Wrapped with `new Uint8Array(buffer)` before passing to Blob constructor.
- **Files modified:** src/services/similarity/similarity-client.ts

**2. [Rule 2 - Missing functionality] Added __pycache__ to .gitignore**
- **Found during:** Task 1 (pip install created __pycache__ in similarity-oracle/)
- **Fix:** Added `__pycache__/` and `*.pyc` to .gitignore
- **Files modified:** .gitignore

## Decisions Made

1. **Python sidecar architecture** -- Separate process on port 8100 rather than embedding Python in Node. Allows independent scaling, restart, and Python-native library usage.

2. **pHash as primary image hash** -- 64-bit perceptual hash, robust against scaling/compression/minor edits. dHash also available for crop detection but pHash used as default.

3. **Graceful audio degradation** -- When fpcalc binary is not available (common on Windows dev environments), audio endpoints return empty results with error message at HTTP 200 (not 500). Production deployments should install Chromaprint.

4. **Exact match first, perceptual second** -- checkSimilarity always tries O(1) PostgreSQL exact match before falling back to perceptual hashing. This is the fast path for duplicate detection.

5. **Mock adapter unchanged** -- SIM-01 was already satisfied by the existing mock implementation. No unnecessary changes.

## Known Stubs

None. All endpoints are fully functional. The audio comparison (`compare_fingerprints`) degrades gracefully when chromaprint Python bindings are not available, but this is documented intentional behavior, not a stub.

## Self-Check: PASSED

All 6 created files verified present. Schema columns confirmed. TypeScript compiles clean. Python imports verified. Old full-scan removed from checkSimilarity.
