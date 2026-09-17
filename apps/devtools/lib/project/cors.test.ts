import { describe, expect, it } from "vitest";
import { joinOrigins, originError, parseOrigins, validateOrigins } from "./cors";

describe("cors origins", () => {
  it("parses the comma list the app reads", () => {
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("https://app.example.com, http://localhost:5173 ,,https://app.example.com")).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });

  it("joins back without empties or duplicates", () => {
    expect(joinOrigins(["https://a.example", " ", "https://a.example", "http://localhost:3000"])).toBe("https://a.example,http://localhost:3000");
    expect(joinOrigins([])).toBe("");
  });

  it("knows what an origin is", () => {
    expect(originError("https://app.example.com")).toBeUndefined();
    expect(originError("http://localhost:5173")).toBeUndefined();
    expect(originError("*")).toMatch(/wildcard/);
    expect(originError("app.example.com")).toMatch(/scheme and a host/);
    expect(originError("ftp://x.example")).toMatch(/http or https/);
    expect(originError("https://app.example.com/")).toMatch(/trailing slash/);
    expect(originError("https://app.example.com/path")).toMatch(/no path/);
    expect(originError("https://app.example.com?x=1")).toMatch(/no path/);
    expect(originError("https://u:p@app.example.com")).toMatch(/credentials/);
    expect(originError("")).toBe("empty");
  });

  it("reports every bad row and duplicates", () => {
    expect(validateOrigins(["https://a.example", "https://a.example", "nope"])).toEqual({ 1: "listed twice", 2: "an origin is a scheme and a host, such as https://app.example.com" });
    expect(validateOrigins(["https://a.example"])).toEqual({});
  });
});
