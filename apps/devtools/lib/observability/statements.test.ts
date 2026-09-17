import { describe, expect, it } from "vitest";
import type { Statement } from "../api/observability";
import { hasPlaceholders, maxShare, shareLabel, shareWidth, statementForEditor, statementRows } from "./statements";

const stmt = (query_id: number, total_share: number, extra: Partial<Statement> = {}): Statement => ({
  query_id,
  query: "SELECT 1",
  calls: 10,
  total_ms: total_share * 1000,
  mean_ms: total_share * 100,
  min_ms: 0.1,
  max_ms: 5,
  stddev_ms: 0.5,
  rows: 10,
  hit_ratio: 0.99,
  total_share,
  ...extra,
});

describe("share bars", () => {
  it("scales the bar to the heaviest statement", () => {
    const list = [stmt(1, 0.6), stmt(2, 0.3), stmt(3, 0.001)];
    const max = maxShare(list);
    expect(max).toBe(0.6);
    expect(shareWidth(list[0], max)).toBe(100);
    expect(shareWidth(list[1], max)).toBe(50);
    expect(shareWidth(list[2], max)).toBeCloseTo(0.5, 5);
    expect(shareWidth(stmt(4, 0), max)).toBe(0);
    expect(shareWidth(stmt(4, 0.5), 0)).toBe(0);
  });
  it("labels the share", () => {
    expect(shareLabel(0.6)).toBe("60%");
    expect(shareLabel(0.0042)).toBe("0.4%");
    expect(shareLabel(0.0001)).toBe("<0.1%");
    expect(shareLabel(0)).toBe("0%");
  });
  it("attaches the widths to the rows", () => {
    const rows = statementRows([stmt(1, 0.5), stmt(2, 0.25)]);
    expect(rows.map((r) => r.share_width)).toEqual([100, 50]);
    expect(rows[0].query_id).toBe(1);
  });
});

describe("statementForEditor", () => {
  it("adds a comment and a terminator", () => {
    expect(statementForEditor(stmt(42, 0.1, { query: "SELECT * FROM users WHERE id = $1;;", calls: 7, mean_ms: 1.234 }))).toBe("-- pg_stat_statements query 42: 7 calls, mean 1.23 ms\nSELECT * FROM users WHERE id = $1;\n");
  });
  it("knows a normalised statement from a literal one", () => {
    expect(hasPlaceholders("SELECT * FROM users WHERE id = $1")).toBe(true);
    expect(hasPlaceholders("SELECT count(*) FROM users")).toBe(false);
    expect(hasPlaceholders("SELECT '$' || 'x'")).toBe(false);
  });
});
