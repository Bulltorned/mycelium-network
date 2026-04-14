"""
Mycelium Similarity Oracle -- Audio Fingerprinting Module

Uses Chromaprint (via pyacoustid) for audio fingerprint computation.
Gracefully degrades if fpcalc binary is not available on the system.
"""

import logging
import os
import shutil
import tempfile

logger = logging.getLogger(__name__)


def check_fpcalc_available() -> tuple[bool, str | None]:
    """Check if the fpcalc binary (Chromaprint CLI) is available.

    Looks for fpcalc in PATH and the FPCALC_PATH environment variable.
    Returns (available, path_or_none).
    """
    # Check env var first
    env_path = os.environ.get("FPCALC_PATH")
    if env_path and os.path.isfile(env_path):
        return True, env_path

    # Check PATH
    which_path = shutil.which("fpcalc")
    if which_path:
        return True, which_path

    return False, None


def compute_fingerprint(
    audio_bytes: bytes, filename: str = "audio.mp3"
) -> tuple[float, str]:
    """Compute Chromaprint fingerprint from audio bytes.

    Writes bytes to a temp file (fpcalc requires file input), computes
    fingerprint, then cleans up. Returns (duration_seconds, fingerprint_string).

    Raises RuntimeError if fpcalc is not available.
    """
    import acoustid

    available, fpcalc_path = check_fpcalc_available()
    if not available:
        raise RuntimeError(
            "fpcalc binary not found. Install Chromaprint or set FPCALC_PATH."
        )

    # Set fpcalc path for acoustid if found via env
    if fpcalc_path:
        acoustid.FPCALC = fpcalc_path

    # Determine suffix from filename
    suffix = os.path.splitext(filename)[1] or ".mp3"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix, prefix="mycelium_audio_"
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        duration, fingerprint = acoustid.fingerprint_file(tmp_path)
        return float(duration), str(fingerprint)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def compare_fingerprints(fp1: str, fp2: str) -> float:
    """Compare two Chromaprint fingerprints.

    Best-effort comparison. Full server-side comparison requires an
    AcoustID API key. Local comparison uses chromaprint.decode_fingerprint
    if available. Returns 0.0 if comparison is not possible.

    Returns a float from 0.0 (no match) to 1.0 (identical).
    """
    try:
        import chromaprint

        # Decode both fingerprints to raw integer arrays
        decoded1, _algo1 = chromaprint.decode_fingerprint(fp1)
        decoded2, _algo2 = chromaprint.decode_fingerprint(fp2)

        if not decoded1 or not decoded2:
            return 0.0

        # Compare using bit-level similarity across overlapping segments
        min_len = min(len(decoded1), len(decoded2))
        if min_len == 0:
            return 0.0

        total_bits = 0
        matching_bits = 0
        for i in range(min_len):
            xor = decoded1[i] ^ decoded2[i]
            differing = bin(xor & 0xFFFFFFFF).count("1")
            total_bits += 32
            matching_bits += 32 - differing

        return matching_bits / total_bits if total_bits > 0 else 0.0

    except ImportError:
        logger.warning(
            "chromaprint Python bindings not available. "
            "Audio fingerprint comparison returning 0.0. "
            "Install chromaprint for local comparison or use AcoustID API."
        )
        return 0.0
    except Exception as e:
        logger.warning("Fingerprint comparison failed: %s", e)
        return 0.0
