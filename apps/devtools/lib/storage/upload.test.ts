import { describe, expect, it } from "vitest";
import { aggregateProgress, describeBatch, planUploads, updateItem } from "./upload";

const id = (i: number) => `u${i}`;

describe("planUploads", () => {
  it("keys every file under the folder and refuses bad names up front", () => {
    const items = planUploads([{ name: "a.png", size: 10 }, { name: "..", size: 1 }, { name: "sub/b.txt", size: 5 }], "images/", id);
    expect(items.map((i) => [i.key, i.state])).toEqual([
      ["images/a.png", "queued"],
      ["images/..", "error"],
      ["images/sub/b.txt", "queued"],
    ]);
    expect(items[1].error).toMatch(/"\.\."/);
  });
});

describe("aggregateProgress", () => {
  it("is empty for no items", () => {
    expect(aggregateProgress([])).toEqual({ total: 0, loaded: 0, percent: 0, done: 0, failed: 0, remaining: 0, finished: false });
  });
  it("adds bytes across items and caps at 99 until everything finished", () => {
    let items = planUploads([{ name: "a", size: 100 }, { name: "b", size: 300 }], "", id);
    items = updateItem(items, "u0", { state: "uploading", loaded: 50 });
    expect(aggregateProgress(items)).toMatchObject({ total: 400, loaded: 50, percent: 12, remaining: 2, finished: false });
    items = updateItem(items, "u0", { state: "done", loaded: 100 });
    items = updateItem(items, "u1", { state: "uploading", loaded: 300 });
    expect(aggregateProgress(items)).toMatchObject({ loaded: 400, percent: 99, done: 1, remaining: 1, finished: false });
    items = updateItem(items, "u1", { state: "error", error: "boom" });
    expect(aggregateProgress(items)).toMatchObject({ percent: 100, done: 1, failed: 1, remaining: 0, finished: true });
  });
  it("counts an empty file as progress", () => {
    const items = updateItem(planUploads([{ name: "empty", size: 0 }], "", id), "u0", { state: "done" });
    expect(aggregateProgress(items)).toMatchObject({ total: 0, percent: 100, finished: true });
  });
  it("describes the batch", () => {
    expect(describeBatch(planUploads([{ name: "a", size: 1 }], "", id), (n) => `${n} B`)).toBe("1 file · 1 B");
    expect(describeBatch(planUploads([{ name: "a", size: 1 }, { name: "b", size: 2 }], "", id), (n) => `${n} B`)).toBe("2 files · 3 B");
  });
});
