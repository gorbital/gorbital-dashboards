import { describe, expect, it } from "vitest";
import { addSample, emptySeries, pushSample, sparkData } from "./samples";

describe("pushSample", () => {
  it("appends and keeps the last `max`", () => {
    expect(pushSample([], 1)).toEqual([1]);
    expect(pushSample([1, 2], 3, 3)).toEqual([1, 2, 3]);
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
  it("keeps the input and turns NaN into 0", () => {
    const h = [1];
    expect(pushSample(h, Number.NaN)).toEqual([1, 0]);
    expect(h).toEqual([1]);
  });
});

describe("addSample", () => {
  it("folds a sample into every series", () => {
    const s = addSample(emptySeries, { at: "t1", cpu: 10, app_cpu: 1, memory: 70, app_rss: 1000, goroutines: 50, heap: 2000 });
    expect(s.cpu).toEqual([10]);
    expect(s.app_cpu).toEqual([1]);
    expect(s.goroutines).toEqual([50]);
    expect(s.heap).toEqual([2000]);
    expect(s.at).toBe("t1");
  });
  it("skips a repeated sample and keeps the runtime series when the app didn't answer", () => {
    const a = addSample(emptySeries, { at: "t1", cpu: 10, memory: 70, goroutines: 50 });
    const same = addSample(a, { at: "t1", cpu: 99, memory: 99 });
    expect(same).toBe(a);
    const b = addSample(a, { at: "t2", cpu: 20, memory: 71 });
    expect(b.cpu).toEqual([10, 20]);
    expect(b.goroutines).toEqual([50]);
    expect(b.app_cpu).toEqual([0, 0]);
  });
  it("holds at most 60 samples", () => {
    let s = emptySeries;
    for (let i = 0; i < 70; i++) s = addSample(s, { at: `t${i}`, cpu: i, memory: i });
    expect(s.cpu).toHaveLength(60);
    expect(s.cpu[0]).toBe(10);
  });
});

describe("sparkData", () => {
  it("pads to two points", () => {
    expect(sparkData([])).toEqual([0, 0]);
    expect(sparkData([5])).toEqual([5, 5]);
    expect(sparkData([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
