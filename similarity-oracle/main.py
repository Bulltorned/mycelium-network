"""
Mycelium Similarity Oracle -- FastAPI Sidecar

Python service for perceptual image hashing (pHash/dHash) and audio
fingerprinting (Chromaprint). Queries PostgreSQL ip_assets table for
match candidates. Called by the TypeScript similarity-client over HTTP.

Default port: 8100
"""

import logging
import os
from contextlib import asynccontextmanager

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, File, Query, UploadFile
from pydantic import BaseModel

from image_hasher import compute_phash, hamming_distance, similarity_score
from audio_fingerprinter import (
    check_fpcalc_available,
    compute_fingerprint,
    compare_fingerprints,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://localhost:5432/mycelium",
)


# ── Database helpers ──────────────────────────────────────────────────


def get_db_connection():
    """Create a new database connection. Returns None if connection fails."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error("Database connection failed: %s", e)
        return None


def check_db_connected() -> bool:
    """Test if the database is reachable."""
    conn = get_db_connection()
    if conn:
        conn.close()
        return True
    return False


# ── Response models ───────────────────────────────────────────────────


class ImageMatch(BaseModel):
    pubkey: str
    score: float
    matchType: str  # "exact" | "near_duplicate"
    distance: int


class ImageSimilarityResponse(BaseModel):
    query_phash: str
    matches: list[ImageMatch]


class AudioMatch(BaseModel):
    pubkey: str
    score: float
    matchType: str
    details: str = ""


class AudioSimilarityResponse(BaseModel):
    query_fingerprint: str | None = None
    error: str | None = None
    matches: list[AudioMatch]


class ExactMatchRequest(BaseModel):
    content_hash: str


class ExactMatch(BaseModel):
    pubkey: str
    score: float
    matchType: str


class ExactMatchResponse(BaseModel):
    matches: list[ExactMatch]


class HealthResponse(BaseModel):
    status: str
    fpcalc_available: bool
    fpcalc_path: str | None
    database_connected: bool


# ── App lifecycle ─────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Log startup diagnostics."""
    fpcalc_ok, fpcalc_path = check_fpcalc_available()
    db_ok = check_db_connected()

    logger.info("=== Mycelium Similarity Oracle starting ===")
    logger.info("  Port: 8100")
    logger.info("  Database: %s", "connected" if db_ok else "UNREACHABLE")
    logger.info("  fpcalc: %s (%s)", "available" if fpcalc_ok else "NOT FOUND", fpcalc_path or "n/a")
    logger.info("  DATABASE_URL: %s", DATABASE_URL[:30] + "..." if len(DATABASE_URL) > 30 else DATABASE_URL)
    logger.info("============================================")

    yield


app = FastAPI(
    title="Mycelium Similarity Oracle",
    description="Perceptual hashing and audio fingerprinting service for Mycelium Protocol",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Endpoints ─────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check with dependency status."""
    fpcalc_ok, fpcalc_path = check_fpcalc_available()
    db_ok = check_db_connected()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        fpcalc_available=fpcalc_ok,
        fpcalc_path=fpcalc_path,
        database_connected=db_ok,
    )


@app.post("/similarity/image", response_model=ImageSimilarityResponse)
async def check_image_similarity(
    file: UploadFile = File(...),
    threshold: int = Query(10, ge=0, le=64, description="Max Hamming distance for match"),
):
    """Compare uploaded image against all indexed IP assets using pHash.

    Returns matches sorted by similarity score (descending).
    threshold: maximum Hamming distance to consider a match (0=exact, 10=default).
    """
    image_bytes = await file.read()
    query_phash = compute_phash(image_bytes)

    matches: list[ImageMatch] = []

    conn = get_db_connection()
    if not conn:
        return ImageSimilarityResponse(query_phash=query_phash, matches=[])

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT pubkey, perceptual_hash_hex "
                "FROM ip_assets "
                "WHERE perceptual_hash_hex IS NOT NULL AND status = 0"
            )
            rows = cur.fetchall()

        for row in rows:
            stored_hash = row["perceptual_hash_hex"]
            try:
                dist = hamming_distance(query_phash, stored_hash)
            except Exception:
                continue

            if dist <= threshold:
                score = similarity_score(query_phash, stored_hash)
                match_type = "exact" if dist == 0 else "near_duplicate"
                matches.append(
                    ImageMatch(
                        pubkey=row["pubkey"],
                        score=score,
                        matchType=match_type,
                        distance=dist,
                    )
                )

        # Sort by score descending
        matches.sort(key=lambda m: m.score, reverse=True)

    except Exception as e:
        logger.error("Image similarity query failed: %s", e)
    finally:
        conn.close()

    return ImageSimilarityResponse(query_phash=query_phash, matches=matches)


@app.post("/similarity/audio", response_model=AudioSimilarityResponse)
async def check_audio_similarity(file: UploadFile = File(...)):
    """Compare uploaded audio against all indexed IP assets using Chromaprint.

    Gracefully degrades if fpcalc is not installed -- returns empty matches
    with an error message (HTTP 200, not 500).
    """
    fpcalc_ok, _ = check_fpcalc_available()
    if not fpcalc_ok:
        return AudioSimilarityResponse(
            error="fpcalc not installed",
            matches=[],
        )

    audio_bytes = await file.read()
    filename = file.filename or "audio.mp3"

    try:
        duration, query_fingerprint = compute_fingerprint(audio_bytes, filename)
    except RuntimeError as e:
        return AudioSimilarityResponse(
            error=str(e),
            matches=[],
        )

    matches: list[AudioMatch] = []

    conn = get_db_connection()
    if not conn:
        return AudioSimilarityResponse(
            query_fingerprint=query_fingerprint, matches=[]
        )

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT pubkey, audio_fingerprint "
                "FROM ip_assets "
                "WHERE audio_fingerprint IS NOT NULL"
            )
            rows = cur.fetchall()

        for row in rows:
            stored_fp = row["audio_fingerprint"]
            score = compare_fingerprints(query_fingerprint, stored_fp)

            if score > 0.3:  # Minimum threshold for audio match
                match_type = "exact" if score > 0.95 else "near_duplicate"
                matches.append(
                    AudioMatch(
                        pubkey=row["pubkey"],
                        score=score,
                        matchType=match_type,
                        details=f"Audio fingerprint similarity: {score:.3f}, duration: {duration:.1f}s",
                    )
                )

        matches.sort(key=lambda m: m.score, reverse=True)

    except Exception as e:
        logger.error("Audio similarity query failed: %s", e)
    finally:
        conn.close()

    return AudioSimilarityResponse(
        query_fingerprint=query_fingerprint, matches=matches
    )


@app.post("/similarity/exact", response_model=ExactMatchResponse)
async def check_exact_match(request: ExactMatchRequest):
    """Check for exact content hash match in PostgreSQL.

    Uses the indexed content_hash column for O(1) lookup --
    no full table scan required.
    """
    matches: list[ExactMatch] = []

    conn = get_db_connection()
    if not conn:
        return ExactMatchResponse(matches=[])

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT pubkey FROM ip_assets WHERE content_hash = %s",
                (request.content_hash,),
            )
            rows = cur.fetchall()

        for row in rows:
            matches.append(
                ExactMatch(
                    pubkey=row["pubkey"],
                    score=1.0,
                    matchType="exact",
                )
            )

    except Exception as e:
        logger.error("Exact match query failed: %s", e)
    finally:
        conn.close()

    return ExactMatchResponse(matches=matches)


# ── Entry point ───────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8100)
