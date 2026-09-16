import { describe, expect, it } from "vitest";
import { describeConstraints, displaySettingValue, durationMs, formatSettingValue, parseSettingValue, shortDuration } from "./setting-value";

describe("durations", () => {
  it("reads Go durations", () => {
    expect(durationMs("15m0s")).toBe(15 * 60_000);
    expect(durationMs("1h30m")).toBe(90 * 60_000);
    expect(durationMs("500ms")).toBe(500);
    expect(durationMs("0")).toBe(0);
    expect(durationMs("2 hours")).toBeNaN();
    expect(durationMs("")).toBeNaN();
  });

  it("shortens them for tables", () => {
    expect(shortDuration("336h0m0s")).toBe("14d");
    expect(shortDuration("1h30m0s")).toBe("1h 30m");
    expect(shortDuration("15m0s")).toBe("15m");
    expect(shortDuration("2160h0m0s")).toBe("90d");
    expect(shortDuration("0")).toBe("0");
    expect(shortDuration("garbage")).toBe("garbage");
  });
});

describe("formatSettingValue", () => {
  it("shows each kind as the form expects", () => {
    expect(formatSettingValue("bool", true)).toBe("true");
    expect(formatSettingValue("int", 12)).toBe("12");
    expect(formatSettingValue("duration", "720h0m0s")).toBe("720h0m0s");
    expect(formatSettingValue("string", "")).toBe("");
    expect(formatSettingValue("string_list", ["a", "b"])).toBe("a\nb");
    expect(formatSettingValue("string", null)).toBe("");
  });
});

describe("parseSettingValue", () => {
  it("types ints and floats within their bounds", () => {
    expect(parseSettingValue("int", " 12 ", { min: 8, max: 128 })).toEqual({ ok: true, value: 12 });
    expect(parseSettingValue("int", "7", { min: 8 })).toMatchObject({ ok: false, error: "at least 8" });
    expect(parseSettingValue("int", "1.5")).toMatchObject({ ok: false });
    expect(parseSettingValue("float", "2.5", { min: 0.1, max: 100 })).toEqual({ ok: true, value: 2.5 });
    expect(parseSettingValue("float", "x")).toMatchObject({ ok: false });
  });

  it("keeps durations as strings and checks their bounds", () => {
    expect(parseSettingValue("duration", "24h", { min: "1h0m0s", max: "2160h0m0s" })).toEqual({ ok: true, value: "24h" });
    expect(parseSettingValue("duration", "30m", { min: "1h0m0s" })).toMatchObject({ ok: false, error: "at least 1h" });
    expect(parseSettingValue("duration", "1 day")).toMatchObject({ ok: false });
  });

  it("handles bools, enums, lists and strings", () => {
    expect(parseSettingValue("bool", "true")).toEqual({ ok: true, value: true });
    expect(parseSettingValue("bool", "yes")).toMatchObject({ ok: false });
    expect(parseSettingValue("enum", "b", { one_of: ["a", "b"] })).toEqual({ ok: true, value: "b" });
    expect(parseSettingValue("enum", "c", { one_of: ["a", "b"] })).toMatchObject({ ok: false, error: "one of a, b" });
    expect(parseSettingValue("string_list", "a\n\n b \n", { max_items: 3 })).toEqual({ ok: true, value: ["a", "b"] });
    expect(parseSettingValue("string_list", "a\nb\nc\nd", { max_items: 3 })).toMatchObject({ ok: false });
    expect(parseSettingValue("string", "hello", { max_len: 3 })).toMatchObject({ ok: false, error: "at most 3 characters" });
    expect(parseSettingValue("string", "not-an-email", { format: "email" })).toMatchObject({ ok: false });
    expect(parseSettingValue("string", "", { format: "email" })).toEqual({ ok: true, value: "" });
  });
});

describe("display", () => {
  it("describes constraints and shows values", () => {
    expect(describeConstraints("duration", { min: "1h0m0s", max: "2160h0m0s" })).toBe("duration · 1h – 90d");
    expect(describeConstraints("int", { min: 3, max: 100 })).toBe("int · 3 – 100");
    expect(describeConstraints("string", { max_len: 100, format: "email" })).toBe("string · ≤ 100 chars · email");
    expect(displaySettingValue("duration", "336h0m0s")).toBe("14d");
    expect(displaySettingValue("string_list", [])).toBe("");
    expect(displaySettingValue("bool", false)).toBe("false");
  });
});
