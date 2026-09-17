import { describe, expect, it } from "vitest";
import { addrError, corsChange, docsChange, formatValue, loggingKeys, portError, setKey } from "./env-keys";

describe("env key mapping", () => {
  it("sets or unsets one key", () => {
    expect(setKey("APP_ADDR", "127.0.0.1:8099")).toEqual({ set: { APP_ADDR: "127.0.0.1:8099" } });
    expect(setKey("APP_LOG_FORMAT", "")).toEqual({ set: { APP_LOG_FORMAT: "" } });
    expect(setKey("APP_DOCS_ENABLED", null)).toEqual({ unset: ["APP_DOCS_ENABLED"] });
  });

  it("maps the CORS list and the docs switch to their keys", () => {
    expect(corsChange("APP_CORS_ORIGINS", ["https://a.example", "http://localhost:5173"])).toEqual({ set: { APP_CORS_ORIGINS: "https://a.example,http://localhost:5173" } });
    expect(corsChange("APP_CORS_ORIGINS", [])).toEqual({ set: { APP_CORS_ORIGINS: "" } });
    expect(docsChange("APP_DOCS_ENABLED", true)).toEqual({ set: { APP_DOCS_ENABLED: "true" } });
    expect(docsChange("APP_DOCS_ENABLED", false)).toEqual({ set: { APP_DOCS_ENABLED: "false" } });
  });

  it("reads the logging keys and the reported format", () => {
    expect(loggingKeys(["APP_LOG_LEVEL", "APP_LOG_FORMAT"])).toEqual({ level: "APP_LOG_LEVEL", format: "APP_LOG_FORMAT" });
    expect(loggingKeys(undefined)).toEqual({ level: "APP_LOG_LEVEL", format: "APP_LOG_FORMAT" });
    expect(formatValue("json (orb dev)")).toBe("");
    expect(formatValue("text")).toBe("text");
    expect(formatValue("json")).toBe("json");
  });

  it("checks addresses and ports", () => {
    expect(addrError("127.0.0.1:8080")).toBeUndefined();
    expect(addrError(":8080")).toBeUndefined();
    expect(addrError("")).toMatch(/required/);
    expect(addrError("8080")).toMatch(/host:port/);
    expect(addrError("127.0.0.1:70000")).toMatch(/between 1 and 65535/);
    expect(portError("")).toBeUndefined();
    expect(portError("", true)).toMatch(/required/);
    expect(portError("3100")).toBeUndefined();
    expect(portError("abc")).toMatch(/number/);
    expect(portError("0")).toMatch(/between/);
  });
});
