/**
 * Mycelium Protocol -- Similarity Oracle Client
 *
 * TypeScript HTTP client for the Python FastAPI similarity sidecar.
 * Wraps /similarity/image, /similarity/audio, /similarity/exact, and /health
 * endpoints. Maps Python response shapes to SimilarityCandidate[].
 *
 * The sidecar runs on localhost:8100 by default (configurable via
 * SIMILARITY_ORACLE_URL env var).
 */

import type { SimilarityCandidate, MatchType } from "../../types.js";

// ── Configuration ────────────────────────────────────────────────────

export const SIMILARITY_ORACLE_URL =
  process.env.SIMILARITY_ORACLE_URL || "http://localhost:8100";

// ── Response types (mirror Python Pydantic models) ───────────────────

interface OracleHealthResponse {
  status: string;
  fpcalc_available: boolean;
  fpcalc_path: string | null;
  database_connected: boolean;
}

interface ImageMatchResponse {
  query_phash: string;
  matches: Array<{
    pubkey: string;
    score: number;
    matchType: string;
    distance: number;
  }>;
}

interface AudioMatchResponse {
  query_fingerprint: string | null;
  error: string | null;
  matches: Array<{
    pubkey: string;
    score: number;
    matchType: string;
    details: string;
  }>;
}

interface ExactMatchResponse {
  matches: Array<{
    pubkey: string;
    score: number;
    matchType: string;
  }>;
}

// ── Health check ─────────────────────────────────────────────────────

/**
 * Check if the Python similarity oracle sidecar is running and healthy.
 * Returns degraded status if unreachable (does not throw).
 */
export async function checkOracleHealth(): Promise<OracleHealthResponse> {
  try {
    const res = await fetch(`${SIMILARITY_ORACLE_URL}/health`);
    if (!res.ok) {
      return {
        status: "error",
        fpcalc_available: false,
        fpcalc_path: null,
        database_connected: false,
      };
    }
    return (await res.json()) as OracleHealthResponse;
  } catch {
    return {
      status: "unreachable",
      fpcalc_available: false,
      fpcalc_path: null,
      database_connected: false,
    };
  }
}

// ── Image similarity ─────────────────────────────────────────────────

/**
 * Upload an image buffer and find perceptual hash matches (pHash)
 * against all indexed IP assets in PostgreSQL.
 *
 * @param imageBuffer - Raw image bytes (PNG, JPEG, etc.)
 * @param threshold - Max Hamming distance for match (default 10, range 0-64)
 * @returns Array of SimilarityCandidate sorted by score descending
 */
export async function checkImageSimilarity(
  imageBuffer: Buffer,
  threshold: number = 10
): Promise<SimilarityCandidate[]> {
  try {
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    const formData = new FormData();
    formData.append("file", blob, "image.png");

    const res = await fetch(
      `${SIMILARITY_ORACLE_URL}/similarity/image?threshold=${threshold}`,
      { method: "POST", body: formData }
    );

    if (!res.ok) {
      console.error(
        `Similarity oracle image check failed: ${res.status} ${res.statusText}`
      );
      return [];
    }

    const data = (await res.json()) as ImageMatchResponse;

    return data.matches.map((m) => ({
      ipAsset: m.pubkey,
      score: m.score,
      matchType: m.matchType as MatchType,
      layer: "perceptual" as const,
      details: `pHash Hamming distance: ${m.distance}`,
    }));
  } catch (err) {
    console.error("Similarity oracle image check error:", err);
    return [];
  }
}

// ── Audio similarity ─────────────────────────────────────────────────

/**
 * Upload an audio buffer and find Chromaprint fingerprint matches
 * against all indexed IP assets.
 *
 * Gracefully returns empty array if fpcalc is not installed on the
 * sidecar host.
 *
 * @param audioBuffer - Raw audio bytes (MP3, WAV, etc.)
 * @param filename - Original filename (used for format detection)
 * @returns Array of SimilarityCandidate sorted by score descending
 */
export async function checkAudioSimilarity(
  audioBuffer: Buffer,
  filename: string
): Promise<SimilarityCandidate[]> {
  try {
    const blob = new Blob([new Uint8Array(audioBuffer)]);
    const formData = new FormData();
    formData.append("file", blob, filename);

    const res = await fetch(`${SIMILARITY_ORACLE_URL}/similarity/audio`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      console.error(
        `Similarity oracle audio check failed: ${res.status} ${res.statusText}`
      );
      return [];
    }

    const data = (await res.json()) as AudioMatchResponse;

    if (data.error) {
      console.warn(`Similarity oracle audio warning: ${data.error}`);
      return [];
    }

    return data.matches.map((m) => ({
      ipAsset: m.pubkey,
      score: m.score,
      matchType: m.matchType as MatchType,
      layer: "perceptual" as const,
      details: m.details || "Audio fingerprint match",
    }));
  } catch (err) {
    console.error("Similarity oracle audio check error:", err);
    return [];
  }
}

// ── Exact content hash match ─────────────────────────────────────────

/**
 * Check for exact content hash match via PostgreSQL indexed lookup.
 * O(1) via the content_hash unique index -- no full table scan.
 *
 * @param contentHash - Hex-encoded SHA-256 hash
 * @returns Array with 0 or 1 SimilarityCandidate (exact match)
 */
export async function checkExactMatch(
  contentHash: string
): Promise<SimilarityCandidate[]> {
  try {
    const res = await fetch(`${SIMILARITY_ORACLE_URL}/similarity/exact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_hash: contentHash }),
    });

    if (!res.ok) {
      console.error(
        `Similarity oracle exact check failed: ${res.status} ${res.statusText}`
      );
      return [];
    }

    const data = (await res.json()) as ExactMatchResponse;

    return data.matches.map((m) => ({
      ipAsset: m.pubkey,
      score: 1.0,
      matchType: "exact" as MatchType,
      layer: "perceptual" as const,
      details: "Exact content hash match via PostgreSQL index",
    }));
  } catch (err) {
    console.error("Similarity oracle exact check error:", err);
    return [];
  }
}
