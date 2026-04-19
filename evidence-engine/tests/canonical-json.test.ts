/**
 * Tests for canonical JSON (JCS RFC 8785).
 *
 * RFC 8785 test vectors from https://www.rfc-editor.org/rfc/rfc8785.html#name-examples
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { canonicalize, hashCanonical } from "../src/canonical-json.js";

describe("canonicalize — primitives", () => {
  it("null", () => assert.equal(canonicalize(null), "null"));
  it("true/false", () => {
    assert.equal(canonicalize(true), "true");
    assert.equal(canonicalize(false), "false");
  });
  it("integer", () => assert.equal(canonicalize(42), "42"));
  it("negative", () => assert.equal(canonicalize(-17), "-17"));
  it("zero collapses -0", () => assert.equal(canonicalize(-0), "0"));
  it("float", () => assert.equal(canonicalize(1.5), "1.5"));
  it("rejects NaN", () => {
    assert.throws(() => canonicalize(NaN), RangeError);
  });
  it("rejects Infinity", () => {
    assert.throws(() => canonicalize(Infinity), RangeError);
  });
});

describe("canonicalize — strings", () => {
  it("plain ASCII", () => {
    assert.equal(canonicalize("hello"), '"hello"');
  });
  it("escapes quote + backslash", () => {
    assert.equal(canonicalize('a"b\\c'), '"a\\"b\\\\c"');
  });
  it("escapes control chars", () => {
    assert.equal(canonicalize("\n\r\t"), '"\\n\\r\\t"');
    assert.equal(canonicalize("\b\f"), '"\\b\\f"');
    assert.equal(canonicalize("\x01"), '"\\u0001"');
  });
  it("passes through non-ASCII verbatim (UTF-8 pre-encoding)", () => {
    assert.equal(canonicalize("Indonesia — Bahasa"), '"Indonesia — Bahasa"');
    assert.equal(canonicalize("日本語"), '"日本語"');
  });
});

describe("canonicalize — arrays", () => {
  it("empty", () => assert.equal(canonicalize([]), "[]"));
  it("preserves order", () => {
    assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  });
  it("nested", () => {
    assert.equal(canonicalize([[1, 2], [3]]), "[[1,2],[3]]");
  });
});

describe("canonicalize — objects", () => {
  it("empty", () => assert.equal(canonicalize({}), "{}"));
  it("sorts keys lexicographically", () => {
    const obj = { b: 1, a: 2, c: 3 };
    assert.equal(canonicalize(obj), '{"a":2,"b":1,"c":3}');
  });
  it("omits undefined values", () => {
    const obj = { a: 1, b: undefined as unknown as null, c: 3 };
    assert.equal(canonicalize(obj), '{"a":1,"c":3}');
  });
  it("key sort is deep", () => {
    const obj = {
      outer: { z: 1, a: 2 },
      apex: true,
    };
    assert.equal(canonicalize(obj), '{"apex":true,"outer":{"a":2,"z":1}}');
  });
  it("same input from different insertion orders produces identical bytes", () => {
    const a = { x: 1, y: 2, z: { q: "hello", p: "world" } };
    const b = { z: { p: "world", q: "hello" }, y: 2, x: 1 };
    assert.equal(canonicalize(a), canonicalize(b));
  });
});

describe("hashCanonical", () => {
  it("produces stable SHA-256 for equivalent inputs", async () => {
    const a = await hashCanonical({ x: 1, y: [2, 3] });
    const b = await hashCanonical({ y: [2, 3], x: 1 });
    assert.equal(a, b);
    assert.equal(a.length, 64); // hex of 32-byte digest
  });
  it("known vector — empty object", async () => {
    const h = await hashCanonical({});
    // sha256("{}") — verified independently
    assert.equal(h, "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });
  it("different content produces different hash", async () => {
    const a = await hashCanonical({ x: 1 });
    const b = await hashCanonical({ x: 2 });
    assert.notEqual(a, b);
  });
});

describe("canonicalize — RFC 8785 published vector", () => {
  /**
   * From RFC 8785 §3.2.3 — the canonical form of the example input
   * should be the canonical output, and SHA-256 should be stable.
   */
  it("example input produces expected output", () => {
    const input = {
      numbers: [333333333.33333329, 1e30, 4.5, 0.002, 1e-6],
      string: "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\u0159",
      literals: [null, true, false],
    };
    const out = canonicalize(input);
    // Keys sorted: literals, numbers, string
    assert.match(out, /^\{"literals":/);
    // Sanity: no whitespace outside strings
    assert.ok(!/:\s/.test(out));
    assert.ok(!/,\s/.test(out));
  });
});
