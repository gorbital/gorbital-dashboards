import { describe, expect, it } from "vitest";
import { fingerprint, fingerprintID, literalOfShape, normalizeShape } from "./fingerprint";

describe("the fingerprint mirror", () => {
  it("replaces quoted values, UUIDs, IDs, hex and numbers as the store does", () => {
    expect(normalizeShape('user "ada@example.com" not found')).toBe('user "…" not found');
    expect(normalizeShape("order 3f2504e0-4f89-11d3-9a0c-0305e82c3301 failed")).toBe("order <uuid> failed");
    expect(normalizeShape("request req_435e5fa9764e87f9 timed out after 30 s")).toBe("request <id> timed out after <n> s");
    // No word boundary inside "30s", so a number glued to a unit stays, as in Go.
    expect(normalizeShape("timed out after 30s")).toBe("timed out after 30s");
    expect(normalizeShape("trace 4ffc0561f5013d329ace6d0e2bf157ee dropped")).toBe("trace <hex> dropped");
    expect(normalizeShape("took 12.5 ms, 3 retries")).toBe("took <n> ms, <n> retries");
    expect(normalizeShape("  padded  ")).toBe("padded");
    expect(normalizeShape("x".repeat(300))).toHaveLength(200);
  });

  it("takes the top from the stack, else the error's first line normalised", () => {
    expect(fingerprint({ message: "handler panicked", attrs: [{ key: "stack", value: "runtime error: index 12 out of range\ngoroutine 1 [running]:" }] })).toEqual({ shape: "handler panicked", top: "runtime error: index 12 out of range" });
    expect(fingerprint({ message: "job failed", attrs: [{ key: "error", value: "dial tcp 127.0.0.1:1025: connect: connection refused\nsecond line" }] })).toEqual({ shape: "job failed", top: "dial tcp <n>.<n>:<n>: connect: connection refused" });
    expect(fingerprint({ message: "", raw: "orb: built in 1.8 s" })).toEqual({ shape: "orb: built in <n> s", top: "" });
    expect(fingerprint({ message: "x", attrs: [{ key: "err", value: "boom 7" }] }).top).toBe("boom <n>");
  });

  it("hashes the key as Go's FNV-1a in base 36", () => {
    // fnv.New64a of "a\x00b" is 0x2ea5c8c1c4ff8bce... checked against the Go implementation's arithmetic.
    expect(fingerprintID("a", "b")).toBe(fnv64aBase36("a\0b"));
    expect(fingerprintID("handler panicked", "")).toMatch(/^[0-9a-z]+$/);
    expect(fingerprintID("é", "")).toBe(fnv64aBase36("é\0"));
  });

  it("finds a literal to search for in a shape", () => {
    expect(literalOfShape("request <id> timed out after <n>s")).toBe("timed out after");
    expect(literalOfShape("handler panicked")).toBe("handler panicked");
  });
});

function fnv64aBase36(s: string): string {
  let h = 14695981039346656037n;
  for (const b of new TextEncoder().encode(s)) h = ((h ^ BigInt(b)) * 1099511628211n) & ((1n << 64n) - 1n);
  return h.toString(36);
}
