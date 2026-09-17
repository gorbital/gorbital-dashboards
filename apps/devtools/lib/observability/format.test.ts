import { describe, expect, it } from "vitest";
import { bytes, count, millis, millisFromString, oneLine, percent, percentOf100, rate, seconds } from "./format";

describe("percent", () => {
  it("formats a ratio with one decimal", () => {
    expect(percent(0.9992)).toBe("99.9%");
    expect(percent(0.5)).toBe("50.0%");
    expect(percent(1)).toBe("100.0%");
    expect(percent(0)).toBe("0.0%");
  });
  it("never rounds a ratio under 1 up to 100%", () => {
    expect(percent(0.99999)).toBe(">99.9%");
    expect(percent(0.9996, 2)).toBe("99.96%");
  });
  it("shows a tiny ratio as under the smallest step", () => {
    expect(percent(0.0001)).toBe("<0.1%");
    expect(percent(0.00001, 2)).toBe("<0.01%");
  });
  it("is a dash for NaN", () => {
    expect(percent(Number.NaN)).toBe("—");
  });
  it("formats a percentage the sampler computed", () => {
    expect(percentOf100(68.309)).toBe("68%");
    expect(percentOf100(0.22)).toBe("0.2%");
    expect(percentOf100(9.96)).toBe("10.0%");
  });
});

describe("bytes", () => {
  it("picks the unit", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(10_409_663)).toBe("9.9 MB");
    expect(bytes(139_264)).toBe("136 KB");
    expect(bytes(34_359_738_368)).toBe("32 GB");
  });
  it("is a dash for unknown or negative sizes", () => {
    expect(bytes(-1)).toBe("—");
    expect(bytes(undefined)).toBe("—");
    expect(bytes(null)).toBe("—");
  });
});

describe("millis", () => {
  it("scales from microseconds to hours", () => {
    expect(millis(0.4)).toBe("0.40 ms");
    expect(millis(1.23)).toBe("1.2 ms");
    expect(millis(18.4)).toBe("18 ms");
    expect(millis(1420)).toBe("1.42 s");
    expect(millis(95_000)).toBe("1 min 35 s");
    expect(millis(120_000)).toBe("2 min");
    expect(millis(3_900_000)).toBe("1 h 5 min");
  });
  it("reads the lock table's decimal string", () => {
    expect(millisFromString("4200")).toBe("4.20 s");
    expect(millisFromString("")).toBe("—");
    expect(millisFromString(undefined)).toBe("—");
    expect(millisFromString("abc")).toBe("—");
  });
});

describe("rate", () => {
  it("chooses per hour, per minute or per second", () => {
    expect(rate(0)).toBe("0/min");
    expect(rate(0.1)).toBe("6.0/h");
    expect(rate(2.34)).toBe("2.3/min");
    expect(rate(802.7)).toBe("13.4/s");
    expect(rate(45)).toBe("45/min");
  });
});

describe("count and seconds", () => {
  it("separates thousands and hides PostgreSQL's -1", () => {
    expect(count(1_234_567)).toBe("1,234,567");
    expect(count(-1)).toBe("—");
    expect(count(undefined)).toBe("—");
  });
  it("formats an uptime", () => {
    expect(seconds(40)).toBe("40s");
    expect(seconds(720)).toBe("12m");
    expect(seconds(7500)).toBe("2h 5m");
    expect(seconds(100_000)).toBe("1d 3h");
    expect(seconds(-1)).toBe("—");
  });
});

describe("oneLine", () => {
  it("collapses whitespace and cuts with an ellipsis", () => {
    expect(oneLine("SELECT *\n  FROM   users\n WHERE id = $1")).toBe("SELECT * FROM users WHERE id = $1");
    expect(oneLine("x".repeat(200), 10)).toBe("xxxxxxxxx…");
    expect(oneLine("short", 10)).toBe("short");
  });
});
