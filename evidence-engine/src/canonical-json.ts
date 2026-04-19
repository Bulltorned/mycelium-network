/**
 * JSON Canonicalization Scheme (JCS) — RFC 8785
 *
 * Produces a deterministic byte representation of any JSON value so that
 * SHA-256(canonicalize(doc)) is stable across platforms. Required by the
 * Jakarta Protocol §4.3 for MEP package_hash computation.
 *
 * Rules enforced (per RFC 8785):
 *  - UTF-8 encoding, no BOM
 *  - Object keys sorted lexicographically at every level (codepoint order)
 *  - No whitespace outside strings
 *  - Numbers serialized per ECMAScript Number.prototype.toString (no trailing zeros,
 *    no plus sign, no leading zeros, scientific notation only outside [1e-6, 1e21))
 *  - Strings escaped minimally: \" \\ \b \f \n \r \t and \u00xx for control chars
 *  - Arrays preserve insertion order
 *  - null, true, false literal
 *
 * NOT handled: BigInt, Date (must be pre-serialized to ISO 8601 strings by caller),
 * undefined (treated as omitted).
 *
 * The MEP-specific hashing rule lives in mep-generator: set `package_hash` to "",
 * canonicalize, SHA-256, write the hash back, canonicalize again, upload, sign.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Canonicalize a JSON-compatible value per RFC 8785.
 * Throws on non-finite numbers, BigInt, functions, undefined, symbols.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return canonicalizeNumber(value);
  if (typeof value === "string") return canonicalizeString(value);
  if (Array.isArray(value)) return canonicalizeArray(value);
  if (typeof value === "object") return canonicalizeObject(value);
  throw new TypeError(
    `canonicalize: unsupported type ${typeof value}. ` +
      `Pre-serialize Date/BigInt to string.`,
  );
}

/** Byte-encoded form for hashing (UTF-8). */
export function canonicalizeBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

// ── Number ─────────────────────────────────────────────────────────────

function canonicalizeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new RangeError(
      `canonicalize: non-finite number ${n} cannot be represented in JSON`,
    );
  }
  if (n === 0) return "0"; // RFC 8785 §3.2.2.3 — collapse -0 to 0
  // ECMAScript Number.prototype.toString output is RFC 8785 compliant
  // for finite numbers. V8, SpiderMonkey, JavaScriptCore all agree.
  return String(n);
}

// ── String ─────────────────────────────────────────────────────────────

function canonicalizeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    // Control chars 0x00..0x1F — always escape
    if (code < 0x20) {
      switch (code) {
        case 0x08: out += "\\b"; break;
        case 0x09: out += "\\t"; break;
        case 0x0a: out += "\\n"; break;
        case 0x0c: out += "\\f"; break;
        case 0x0d: out += "\\r"; break;
        default:
          out += "\\u" + code.toString(16).padStart(4, "0");
      }
      continue;
    }
    // Must-escape characters
    if (code === 0x22) { out += '\\"'; continue; }
    if (code === 0x5c) { out += "\\\\"; continue; }
    // All other chars pass through verbatim — including non-ASCII
    out += s[i];
  }
  out += '"';
  return out;
}

// ── Array ──────────────────────────────────────────────────────────────

function canonicalizeArray(arr: JsonValue[]): string {
  const parts: string[] = [];
  for (const item of arr) {
    parts.push(canonicalize(item));
  }
  return "[" + parts.join(",") + "]";
}

// ── Object ─────────────────────────────────────────────────────────────

function canonicalizeObject(obj: { [key: string]: JsonValue }): string {
  // Omit keys whose value is undefined (matches JSON.stringify behavior)
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  keys.sort(rfc8259CodepointSort);
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(canonicalizeString(k) + ":" + canonicalize(obj[k]));
  }
  return "{" + parts.join(",") + "}";
}

/**
 * Lexicographic sort on UTF-16 code units — matches RFC 8785's requirement
 * that keys be sorted by their JSON-string-escaped codepoint sequence.
 *
 * V8 / SpiderMonkey / JSC all use UTF-16 code units in string comparison,
 * and that matches the RFC for all keys representable as JSON strings.
 */
function rfc8259CodepointSort(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ── SHA-256 helper ─────────────────────────────────────────────────────

/**
 * SHA-256 the canonicalized bytes. Uses the Web Crypto API (Node 20+, browsers).
 * Returns a lowercase hex string. Add the `sha256:` prefix at the call site
 * if required by the consuming schema.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convenience: canonicalize + hash in one call. Returns lowercase hex. */
export async function hashCanonical(value: JsonValue): Promise<string> {
  return sha256Hex(canonicalizeBytes(value));
}
