import { describe, expect, it } from "vitest";
import type { LogRecord } from "@/lib/api/logs";
import { initialTail, mergeRecords, reduceTail } from "./tail";

const rec = (id: number): LogRecord => ({ id, time: new Date(id * 1000).toISOString(), source: "app", level: "INFO", message: `m${id}` });

describe("the tail reducer", () => {
  it("puts new records first and ignores one it already has", () => {
    let s = reduceTail(initialTail, { type: "record", record: rec(1) });
    s = reduceTail(s, { type: "record", record: rec(2) });
    expect(s.items.map((r) => r.id)).toEqual([2, 1]);
    expect(reduceTail(s, { type: "record", record: rec(2) })).toBe(s);
  });

  it("holds records back while held, shows the count, and flushes in order", () => {
    let s = reduceTail(initialTail, { type: "record", record: rec(1) });
    s = reduceTail(s, { type: "hold", held: true });
    s = reduceTail(s, { type: "record", record: rec(2) });
    s = reduceTail(s, { type: "record", record: rec(3) });
    expect(s.items.map((r) => r.id)).toEqual([1]);
    expect(s.pending.map((r) => r.id)).toEqual([3, 2]);
    s = reduceTail(s, { type: "hold", held: false });
    expect(s.held).toBe(false);
    expect(s.pending).toEqual([]);
    expect(s.items.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("caps at max and counts what it dropped", () => {
    let s = initialTail;
    for (let i = 1; i <= 5; i++) s = reduceTail(s, { type: "record", record: rec(i) }, 3);
    expect(s.items.map((r) => r.id)).toEqual([5, 4, 3]);
    expect(s.dropped).toBe(2);
    s = reduceTail(s, { type: "clear" });
    expect(s).toEqual(initialTail);
  });

  it("merges the tail with the pages, newest first, nothing twice", () => {
    expect(mergeRecords([rec(5), rec(4)], [rec(4), rec(3), rec(1)]).map((r) => r.id)).toEqual([5, 4, 3, 1]);
    expect(mergeRecords([], [rec(2), rec(1)]).map((r) => r.id)).toEqual([2, 1]);
    expect(mergeRecords([rec(9)], [rec(2), rec(1)], 2).map((r) => r.id)).toEqual([9, 2]);
  });
});
