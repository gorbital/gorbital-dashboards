import { describe, expect, it } from "vitest";
import { connectionsGrade, errorRateGrade, gradeTone, hitGrade, loadGrade, usageGrade, worstStatus } from "./grade";

describe("hitGrade", () => {
  it("grades cache and index hit ratios", () => {
    expect(hitGrade(0.999)).toBe("good");
    expect(hitGrade(0.99)).toBe("good");
    expect(hitGrade(0.97)).toBe("ok");
    expect(hitGrade(0.95)).toBe("ok");
    expect(hitGrade(0.9)).toBe("poor");
    expect(hitGrade(Number.NaN)).toBe("poor");
  });
  it("maps to the theme's tones", () => {
    expect(gradeTone.good).toBe("ok");
    expect(gradeTone.ok).toBe("warn");
    expect(gradeTone.poor).toBe("danger");
  });
});

describe("usageGrade and connectionsGrade", () => {
  it("grades a percentage", () => {
    expect(usageGrade(10)).toBe("good");
    expect(usageGrade(69.9)).toBe("good");
    expect(usageGrade(70)).toBe("ok");
    expect(usageGrade(90)).toBe("poor");
  });
  it("grades connections against the limit", () => {
    expect(connectionsGrade(67, 100)).toBe("good");
    expect(connectionsGrade(75, 100)).toBe("ok");
    expect(connectionsGrade(95, 100)).toBe("poor");
    expect(connectionsGrade(1, 0)).toBe("poor");
  });
});

describe("errorRateGrade and loadGrade", () => {
  it("grades server errors per request", () => {
    expect(errorRateGrade(0)).toBe("good");
    expect(errorRateGrade(0.0005)).toBe("good");
    expect(errorRateGrade(0.001)).toBe("ok");
    expect(errorRateGrade(0.02)).toBe("poor");
  });
  it("grades a load average against the cores", () => {
    expect(loadGrade(3, 10)).toBe("good");
    expect(loadGrade(10.5, 10)).toBe("ok");
    expect(loadGrade(16, 10)).toBe("poor");
    expect(loadGrade(99, 0)).toBe("good");
  });
});

describe("worstStatus", () => {
  it("lets the worst service decide", () => {
    expect(worstStatus(["ok", "ok"])).toBe("ok");
    expect(worstStatus(["ok", "unknown"])).toBe("unknown");
    expect(worstStatus(["degraded", "unknown", "ok"])).toBe("degraded");
    expect(worstStatus(["degraded", "down"])).toBe("down");
    expect(worstStatus([])).toBe("ok");
  });
});
