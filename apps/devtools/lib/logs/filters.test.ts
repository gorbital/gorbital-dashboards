import { describe, expect, it } from "vitest";
import { bucketFor, countActiveFilters, describeFilters, filtersEqual, filtersFromJSON, filtersToApi, filtersToParams, normalizeFilters, parseFilters, resolveRange } from "./filters";

describe("the filter codec", () => {
  it("round-trips every filter through the query string", () => {
    const f = parseFilters(new URLSearchParams("range=6h&level=warn,ERROR&min_level=info&source=HTTP,auth&user=usr_1&method=get&path=/v1&status_class=5xx&status=503&min_duration_ms=250&request_id=req_1&trace_id=abc&q=time out"));
    expect(f).toEqual({ range: "6h", level: ["WARN", "ERROR"], min_level: "INFO", source: ["http", "auth"], user: "usr_1", method: "GET", path: "/v1", status_class: "5xx", status: 503, min_duration_ms: 250, request_id: "req_1", trace_id: "abc", q: "time out" });
    expect(parseFilters(filtersToParams(f))).toEqual(f);
    expect(filtersToParams(f).toString()).toBe("range=6h&level=WARN%2CERROR&source=http%2Cauth&min_level=INFO&user=usr_1&method=GET&path=%2Fv1&status_class=5xx&request_id=req_1&trace_id=abc&q=time+out&status=503&min_duration_ms=250");
  });

  it("ignores what isn't a filter and drops malformed values", () => {
    expect(parseFilters(new URLSearchParams("view=errors&id=12&range=2d&from=yesterday&status=abc&min_duration_ms=-1&level=,,"))).toEqual({});
    expect(parseFilters(new URLSearchParams("status=0"))).toEqual({});
  });

  it("treats the default range and empty values as absent", () => {
    expect(normalizeFilters({ range: "1h", q: "  ", level: [], source: ["http", "http"] })).toEqual({ source: ["http"] });
    expect(filtersToParams({ range: "1h" }).toString()).toBe("");
    expect(filtersEqual({ range: "1h", q: "x" }, { q: "x" })).toBe(true);
    expect(filtersEqual({ q: "x" }, { q: "y" })).toBe(false);
  });

  it("prefers an absolute window over a preset", () => {
    const f = parseFilters(new URLSearchParams("range=6h&from=2026-09-16T10:00:00.000Z&to=2026-09-16T11:00:00.000Z"));
    expect(f).toEqual({ from: "2026-09-16T10:00:00.000Z", to: "2026-09-16T11:00:00.000Z" });
    const r = resolveRange(f, Date.UTC(2026, 8, 16, 12));
    expect(r).toEqual({ from: Date.UTC(2026, 8, 16, 10), to: Date.UTC(2026, 8, 16, 11), ms: 3_600_000, absolute: true });
  });

  it("resolves a preset against now, ending now", () => {
    const now = Date.UTC(2026, 8, 16, 12);
    expect(resolveRange({}, now)).toEqual({ from: now - 3_600_000, to: now, ms: 3_600_000, absolute: false });
    expect(resolveRange({ range: "15m" }, now).ms).toBe(15 * 60_000);
    const api = filtersToApi({ range: "15m", source: ["http"], level: ["WARN", "ERROR"], status: 500 }, now);
    expect(api).toMatchObject({ from: "2026-09-16T11:45:00.000Z", to: undefined, source: "http", level: "WARN,ERROR", status: 500 });
    expect(filtersToApi({ from: "2026-09-16T10:00:00.000Z", to: "2026-09-16T11:00:00.000Z" }, now)).toMatchObject({ from: "2026-09-16T10:00:00.000Z", to: "2026-09-16T11:00:00.000Z" });
  });

  it("picks the histogram bucket from the window", () => {
    expect(bucketFor(15 * 60_000).bucket).toBe("1m");
    expect(bucketFor(2 * 3_600_000).bucket).toBe("1m");
    expect(bucketFor(2 * 3_600_000 + 1).bucket).toBe("5m");
    expect(bucketFor(12 * 3_600_000).bucket).toBe("5m");
    expect(bucketFor(24 * 3_600_000).bucket).toBe("15m");
    expect(bucketFor(7 * 86_400_000)).toEqual({ bucket: "1h", ms: 3_600_000 });
  });

  it("counts and describes the active filters", () => {
    expect(countActiveFilters({ range: "6h" })).toBe(0);
    expect(countActiveFilters({ source: ["http"], status_class: "5xx", q: "x" })).toBe(3);
    expect(describeFilters({ source: ["http"], min_duration_ms: 250, q: "timeout" })).toEqual(["last 1h", "http", "≥ 250 ms", '"timeout"']);
  });

  it("reads a saved filter's query, whatever it holds", () => {
    expect(filtersFromJSON({ range: "24h", source: ["jobs"], status: 500, nonsense: { a: 1 } })).toEqual({ range: "24h", source: ["jobs"], status: 500 });
    expect(filtersFromJSON("not an object")).toEqual({});
  });
});
