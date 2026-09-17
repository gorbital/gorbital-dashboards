import { describe, expect, it } from "vitest";
import { contentTypeFor, extensionOf, formatBytes, formatExpiry, formatModified, formatSize, previewKind, shortType } from "./format";

describe("sizes", () => {
  it("formats in binary units", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(14)).toBe("14 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(10 * 1024)).toBe("10 KB");
    expect(formatSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatSize(12 * 1024 ** 3)).toBe("12 GB");
    expect(formatSize(-1)).toBe("—");
  });
  it("spells bytes", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(1234)).toBe("1,234 bytes");
  });
});

describe("dates", () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0);
  it("omits the year when it is this year", () => {
    const s = formatModified("2026-09-15T14:32:08Z", now);
    expect(s).toMatch(/^15 Sep \d\d:\d\d$/);
    expect(formatModified("2025-01-02T03:04:05Z", now)).toMatch(/^2 Jan 2025 \d\d:\d\d$/);
    expect(formatModified("nope", now)).toBe("—");
  });
  it("says how long a signed URL lasts", () => {
    expect(formatExpiry(new Date(now + 30_000).toISOString(), now)).toBe("in 30s");
    expect(formatExpiry(new Date(now + 15 * 60_000).toISOString(), now)).toBe("in 15m");
    expect(formatExpiry(new Date(now + 3_600_000).toISOString(), now)).toBe("in 1h");
    expect(formatExpiry(new Date(now + 7 * 86_400_000).toISOString(), now)).toBe("in 7d");
    expect(formatExpiry(new Date(now - 1).toISOString(), now)).toBe("expired");
  });
});

describe("content types", () => {
  it("decides the preview kind from the type, then the extension", () => {
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/svg+xml")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("text/plain; charset=utf-8")).toBe("text");
    expect(previewKind("text/csv")).toBe("text");
    expect(previewKind("text/markdown")).toBe("text");
    expect(previewKind("application/json")).toBe("text");
    expect(previewKind("application/ld+json")).toBe("text");
    expect(previewKind("application/zip")).toBe("other");
    expect(previewKind("application/octet-stream", "photo.JPG")).toBe("image");
    expect(previewKind("", "notes.md")).toBe("text");
    expect(previewKind("", "inv.pdf")).toBe("pdf");
    expect(previewKind(undefined, "blob")).toBe("other");
  });
  it("picks an upload's content type", () => {
    expect(contentTypeFor("a.png", "image/png")).toBe("image/png");
    expect(contentTypeFor("a.png", "")).toBe("image/png");
    expect(contentTypeFor("report.json")).toBe("application/json");
    expect(contentTypeFor("Makefile")).toBe("application/octet-stream");
    expect(extensionOf(".env")).toBe("");
    expect(extensionOf("dir.v2/file.TAR.GZ")).toBe("gz");
  });
  it("shortens types for the column", () => {
    expect(shortType("image/png")).toBe("png");
    expect(shortType("image/jpeg")).toBe("jpg");
    expect(shortType("image/svg+xml")).toBe("svg");
    expect(shortType("text/plain; charset=utf-8")).toBe("text");
    expect(shortType("application/pdf")).toBe("pdf");
    expect(shortType("application/octet-stream", "a.bin")).toBe("bin");
    expect(shortType("application/octet-stream", "blob")).toBe("binary");
    expect(shortType("application/x-tar")).toBe("tar");
  });
});
