/**
 * The store's error grouping, mirrored from cli/internal/portal/logstore.go
 * (`Fingerprint`, `normalizeShape`, `fingerprintID`) so the mock groups as
 * orb dev does and the UI can explain a group's shape.
 */

export type FingerprintInput = { message: string; raw?: string; attrs?: { key: string; value: string }[] };

const fpUUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const fpHex = /\b[0-9a-fA-F]{12,}\b/g;
const fpID = /\b[a-z]{2,5}_[A-Za-z0-9]{6,}\b/g;
const fpNumber = /\b\d+(\.\d+)?\b/g;
const fpQuoted = /"[^"]*"|'[^']*'/g;

/** The message with quoted values, UUIDs, `xxx_…` IDs, long hex and numbers replaced by placeholders, at most 200 characters. */
export function normalizeShape(s: string): string {
  s = s.replace(fpQuoted, '"…"');
  s = s.replace(fpUUID, "<uuid>");
  s = s.replace(fpID, "<id>");
  s = s.replace(fpHex, "<hex>");
  s = s.replace(fpNumber, "<n>");
  s = s.trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

const attr = (r: FingerprintInput, key: string) => r.attrs?.find((a) => a.key === key)?.value ?? "";

/** The shape of the message and the top of the stack or error: what groups records of one problem. */
export function fingerprint(r: FingerprintInput): { shape: string; top: string } {
  const shape = normalizeShape(r.message || r.raw || "");
  const stack = attr(r, "stack");
  if (stack) return { shape, top: firstLine(stack) };
  const error = attr(r, "error") || attr(r, "err");
  return { shape, top: error ? normalizeShape(firstLine(error)) : "" };
}

/** FNV-1a (64 bit) of `shape + "\0" + top` in base 36: the group's stable id. */
export function fingerprintID(shape: string, top: string): string {
  const bytes = new TextEncoder().encode(`${shape}\0${top}`);
  let h = 14695981039346656037n;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 1099511628211n) & 0xffffffffffffffffn;
  }
  return h.toString(36);
}

/** Placeholders the shape carries, so "See records" can search for a literal part of it. */
export function literalOfShape(shape: string): string {
  const parts = shape
    .split(/<uuid>|<id>|<hex>|<n>|"…"/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  return parts.sort((a, b) => b.length - a.length)[0] ?? shape;
}
