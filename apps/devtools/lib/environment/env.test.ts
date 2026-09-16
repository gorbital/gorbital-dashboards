import { describe, expect, it } from "vitest";
import type { EnvEntry } from "@/lib/api/env";
import { entryBadges, filterEntries, groupEntries, isMasked, keyNameError, keyPrefix, maskValue, missingCount, readByApp, shownValue, valueError } from "./env";

const entry = (over: Partial<EnvEntry>): EnvEntry => ({ key: "APP_ENV", value: "development", set: true, example: "development", in_example: true, missing: false, description: "development or production", secret: false, line: 3, ...over });

describe("keyNameError", () => {
  it("accepts identifiers and refuses the rest", () => {
    expect(keyNameError("P9_TEST")).toBeUndefined();
    expect(keyNameError("_x")).toBeUndefined();
    expect(keyNameError("lower_ok")).toBeUndefined();
    expect(keyNameError("")).toMatch(/required/);
    expect(keyNameError("9ABC")).toMatch(/not starting with a digit/);
    expect(keyNameError("A-B")).toMatch(/letters, digits/);
    expect(keyNameError("A B")).toBeDefined();
    expect(keyNameError("APP_ENV", ["APP_ENV"])).toMatch(/already/);
  });
  it("refuses values that span lines", () => {
    expect(valueError("one line")).toBeUndefined();
    expect(valueError("two\nlines")).toMatch(/span lines/);
  });
});

describe("masking", () => {
  it("masks like orb dev and recognises its mask", () => {
    expect(maskValue("short")).toBe("••••••••");
    expect(maskValue("12345678")).toBe("••••••••");
    expect(maskValue("postgres://user:pw@host/db")).toBe("po••••••••db");
    expect(isMasked("••••••••")).toBe(true);
    expect(isMasked("po••••••••db")).toBe(true);
    expect(isMasked("development")).toBe(false);
  });
  it("shows the revealed value when known, the mask otherwise, and nothing for an unset key", () => {
    const secret = entry({ key: "DATABASE_URL", value: "po••••••••db", secret: true });
    expect(shownValue(secret, {})).toEqual({ value: "po••••••••db", masked: true });
    expect(shownValue(secret, { DATABASE_URL: "postgres://x" })).toEqual({ value: "postgres://x", masked: false });
    expect(shownValue(entry({ key: "RESEND_API_KEY", value: "", secret: true }), {})).toEqual({ value: "", masked: false });
    expect(shownValue(entry({ set: false, value: "", missing: true }), {})).toEqual({ value: "", masked: false });
    expect(shownValue(entry({}), {})).toEqual({ value: "development", masked: false });
  });
});

describe("what the app read", () => {
  const config = [
    { name: "APP_ENV", secret: false, set: true, value: "development" },
    { name: "DATABASE_URL", secret: true, set: true },
  ];
  it("answers per key, or undefined without the console", () => {
    expect(readByApp("APP_ENV", config)).toBe(true);
    expect(readByApp("P9_TEST", config)).toBe(false);
    expect(readByApp("APP_ENV", undefined)).toBeUndefined();
  });
  it("lists the badges in order", () => {
    expect(entryBadges(entry({}), config)).toEqual([]);
    expect(entryBadges(entry({ key: "GOOGLE_CLIENT_ID", set: false, value: "", missing: true }), config)).toEqual(["missing"]);
    expect(entryBadges(entry({ key: "P9_TEST", value: "1", in_example: false }), config)).toEqual(["not_in_example", "not_read"]);
    expect(entryBadges(entry({ key: "DATABASE_URL", value: "po••••••••db", secret: true }), config)).toEqual(["secret"]);
    expect(entryBadges(entry({ key: "APP_LOG_FORMAT", value: "" }), config)).toEqual(["empty", "not_read"]);
    expect(entryBadges(entry({ key: "P9_TEST", value: "1", in_example: false }), undefined)).toEqual(["not_in_example"]);
  });
});

describe("grouping and filtering", () => {
  const entries = [entry({ key: "APP_ENV" }), entry({ key: "APP_ADDR", value: "127.0.0.1:8080", description: "Address the API listens on." }), entry({ key: "DATABASE_URL", value: "po••••••••db", secret: true, description: "PostgreSQL" }), entry({ key: "GOOGLE_CLIENT_SECRET", value: "", set: false, missing: true, secret: true }), entry({ key: "P9_TEST", value: "1", in_example: false }), entry({ key: "PORT", value: "80", in_example: false })];

  it("takes the prefix before the first underscore", () => {
    expect(keyPrefix("APP_LOG_LEVEL")).toBe("APP");
    expect(keyPrefix("PORT")).toBe("PORT");
    expect(keyPrefix("_X")).toBe("_X");
  });
  it("groups by prefix in file order", () => {
    const groups = groupEntries(entries);
    expect(groups.map((g) => g.name)).toEqual(["APP", "DATABASE", "GOOGLE", "P9", "PORT"]);
    expect(groups[0].entries.map((e) => e.key)).toEqual(["APP_ENV", "APP_ADDR"]);
  });
  it("filters by words over key and description, and by what to show", () => {
    expect(filterEntries(entries, "listens", "all").map((e) => e.key)).toEqual(["APP_ADDR"]);
    expect(filterEntries(entries, "app addr", "all").map((e) => e.key)).toEqual(["APP_ADDR"]);
    expect(filterEntries(entries, "", "missing").map((e) => e.key)).toEqual(["GOOGLE_CLIENT_SECRET"]);
    expect(filterEntries(entries, "", "secrets").map((e) => e.key)).toEqual(["DATABASE_URL", "GOOGLE_CLIENT_SECRET"]);
    expect(filterEntries(entries, "", "extra").map((e) => e.key)).toEqual(["P9_TEST", "PORT"]);
    expect(filterEntries(entries, "nothing here", "all")).toEqual([]);
    expect(missingCount(entries)).toBe(1);
  });
});
