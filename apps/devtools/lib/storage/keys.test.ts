import { describe, expect, it } from "vitest";
import { ancestors, baseName, breadcrumbs, isDirectoryMarker, isRename, joinKey, keyError, moveTarget, normalizePrefix, parentPrefix, validKey, validPrefix } from "./keys";

describe("validKey (mirrors storage.ValidKey)", () => {
  it("accepts plain keys and nested paths", () => {
    for (const k of ["a", "images/logo.svg", "invoices/2026/inv_42.pdf", "with space.txt", "ünïcödé/файл.txt", ".keep", "a/.keep", "a.b/c..d"]) expect(validKey(k), k).toBe(true);
  });
  it("refuses what the Go side refuses", () => {
    expect(keyError("")).toMatch(/empty/);
    expect(keyError("/a")).toMatch(/start with a slash/);
    expect(keyError("a/")).toMatch(/end with a slash/);
    expect(keyError("a//b")).toMatch(/empty segment/);
    expect(keyError("a/./b")).toMatch(/"\." segment/);
    expect(keyError("../etc")).toMatch(/"\.\." segment/);
    expect(keyError("a\nb")).toMatch(/control/);
    expect(keyError("a\x7fb")).toMatch(/control/);
    expect(keyError("a".repeat(1024))).toBeUndefined();
    expect(keyError("a".repeat(1025))).toMatch(/1024/);
    expect(keyError("é".repeat(600))).toMatch(/1024/); // bytes, not characters
  });
});

describe("prefixes", () => {
  it("validates a prefix as an optional trailing-slash key", () => {
    expect(validPrefix("")).toBe(true);
    expect(validPrefix("images/")).toBe(true);
    expect(validPrefix("images")).toBe(true);
    expect(validPrefix("/images/")).toBe(false);
    expect(validPrefix("a/../")).toBe(false);
  });
  it("normalises", () => {
    expect(normalizePrefix("")).toBe("");
    expect(normalizePrefix("/")).toBe("");
    expect(normalizePrefix("images")).toBe("images/");
    expect(normalizePrefix("/images//2026/")).toBe("images/2026/");
  });
  it("splits breadcrumbs and ancestors", () => {
    expect(breadcrumbs("")).toEqual([]);
    expect(breadcrumbs("images/2026/")).toEqual([
      { name: "images", prefix: "images/" },
      { name: "2026", prefix: "images/2026/" },
    ]);
    expect(ancestors("")).toEqual([""]);
    expect(ancestors("images/2026/")).toEqual(["", "images/", "images/2026/"]);
  });
  it("finds parents and base names", () => {
    expect(parentPrefix("images/a.png")).toBe("images/");
    expect(parentPrefix("images/2026/")).toBe("images/");
    expect(parentPrefix("a.png")).toBe("");
    expect(parentPrefix("images/")).toBe("");
    expect(baseName("images/a.png")).toBe("a.png");
    expect(baseName("images/2026/")).toBe("2026");
    expect(baseName("a.png")).toBe("a.png");
  });
  it("joins", () => {
    expect(joinKey("", "a.png")).toBe("a.png");
    expect(joinKey("images", "a.png")).toBe("images/a.png");
    expect(joinKey("images/", "/a.png")).toBe("images/a.png");
    expect(joinKey("images/", "2026/a.png")).toBe("images/2026/a.png");
  });
});

describe("markers and moves", () => {
  it("recognises the directory marker", () => {
    expect(isDirectoryMarker("drafts/.keep")).toBe(true);
    expect(isDirectoryMarker(".keep")).toBe(true);
    expect(isDirectoryMarker("drafts/keep")).toBe(false);
    expect(isDirectoryMarker("drafts/x.keep")).toBe(false);
  });
  it("turns a rename into a move target in the same folder", () => {
    expect(moveTarget("images/a.png", "b.png")).toBe("images/b.png");
    expect(moveTarget("a.png", "b.png")).toBe("b.png");
    expect(moveTarget("images/a.png", "2026/a.png")).toBe("images/2026/a.png");
    expect(isRename("images/a.png", "images/b.png")).toBe(true);
    expect(isRename("images/a.png", "images/a.png")).toBe(false);
    expect(isRename("images/a.png", "exports/a.png")).toBe(false);
  });
});
