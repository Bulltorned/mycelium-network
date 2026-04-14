"""
Mycelium Similarity Oracle -- Image Hashing Module

Computes perceptual hashes (pHash, dHash) using the imagehash library.
Used for near-duplicate and derivative image detection across all
registered IP assets.
"""

import io
import imagehash
from PIL import Image


def compute_phash(image_bytes: bytes) -> str:
    """Compute perceptual hash (pHash) of an image.

    Returns a 16-character hex string representing the 64-bit hash.
    pHash is robust against scaling, minor color changes, and compression.
    """
    img = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.phash(img))


def compute_dhash(image_bytes: bytes) -> str:
    """Compute difference hash (dHash) of an image.

    Returns a 16-character hex string representing the 64-bit hash.
    dHash is especially good at detecting crops and aspect ratio changes.
    """
    img = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.dhash(img))


def hamming_distance(hash1_hex: str, hash2_hex: str) -> int:
    """Compute Hamming distance between two hex-encoded hashes.

    The imagehash library overloads subtraction as Hamming distance.
    Returns an integer from 0 (identical) to 64 (completely different).
    """
    h1 = imagehash.hex_to_hash(hash1_hex)
    h2 = imagehash.hex_to_hash(hash2_hex)
    return h1 - h2


def similarity_score(hash1_hex: str, hash2_hex: str) -> float:
    """Compute similarity score between two hex-encoded hashes.

    Returns a float from 0.0 (completely different) to 1.0 (identical).
    """
    dist = hamming_distance(hash1_hex, hash2_hex)
    score = 1.0 - (dist / 64.0)
    return max(0.0, min(1.0, score))
