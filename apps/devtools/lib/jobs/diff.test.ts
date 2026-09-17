import { describe, expect, it } from "vitest";
import { diffHunks, diffStat, lineDiff, unifiedDiff } from "./diff";

const before = ["package app", "", "func defineJobs(defs *jobs.Definitions, deps jobDeps) {", "\t//orb:anchor jobs", "\tdefineHeartbeatJob(defs, deps)", "\tdefineAuthCleanupJob(defs, deps)", "}", ""].join("\n");
const after = ["package app", "", "func defineJobs(defs *jobs.Definitions, deps jobDeps) {", "\t//orb:anchor jobs", "\tdefinePingHealthJob(defs, deps)", "\tdefineHeartbeatJob(defs, deps)", "\tdefineAuthCleanupJob(defs, deps)", "}", ""].join("\n");

describe("lineDiff", () => {
  it("marks one inserted line and numbers both sides", () => {
    const d = lineDiff(before, after);
    expect(d.map((l) => l.type)).toEqual(["same", "same", "same", "same", "add", "same", "same", "same"]);
    expect(d[4]).toEqual({ type: "add", text: "\tdefinePingHealthJob(defs, deps)", newNo: 5 });
    expect(d[5]).toEqual({ type: "same", text: "\tdefineHeartbeatJob(defs, deps)", oldNo: 5, newNo: 6 });
    expect(diffStat(d)).toEqual({ added: 1, removed: 0 });
  });

  it("marks replaced and removed lines", () => {
    const d = lineDiff("a\nb\nc\n", "a\nB\n");
    expect(d).toEqual([
      { type: "same", text: "a", oldNo: 1, newNo: 1 },
      { type: "del", text: "b", oldNo: 2 },
      { type: "del", text: "c", oldNo: 3 },
      { type: "add", text: "B", newNo: 2 },
    ]);
    expect(diffStat(d)).toEqual({ added: 1, removed: 2 });
  });

  it("handles empty and equal files", () => {
    expect(lineDiff("", "")).toEqual([]);
    expect(lineDiff("", "x\n")).toEqual([{ type: "add", text: "x", newNo: 1 }]);
    expect(lineDiff("x\n", "")).toEqual([{ type: "del", text: "x", oldNo: 1 }]);
    expect(lineDiff("x\ny\n", "x\ny\n").every((l) => l.type === "same")).toBe(true);
    expect(diffHunks(lineDiff("x\ny\n", "x\ny\n"))).toEqual([]);
  });
});

describe("diffHunks", () => {
  it("folds unchanged lines away, keeping context", () => {
    const many = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const changed = [...many];
    changed[20] = "line 21 changed";
    const hunks = diffHunks(lineDiff(many.join("\n") + "\n", changed.join("\n") + "\n"), 2);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ oldStart: 19, oldLines: 5, newStart: 19, newLines: 5 });
    expect(hunks[0].lines.map((l) => l.type)).toEqual(["same", "same", "del", "add", "same", "same"]);
  });

  it("makes one hunk per change when they are far apart", () => {
    const many = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
    const changed = [...many];
    changed[2] = "x";
    changed[35] = "y";
    const hunks = diffHunks(lineDiff(many.join("\n"), changed.join("\n")), 3);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].oldStart).toBe(1);
    expect(hunks[1].oldStart).toBe(33);
  });

  it("renders unified text", () => {
    const text = unifiedDiff("internal/app/jobs.go", before, after, 1);
    expect(text).toBe(["--- a/internal/app/jobs.go", "+++ b/internal/app/jobs.go", "@@ -4,2 +4,3 @@", " \t//orb:anchor jobs", "+\tdefinePingHealthJob(defs, deps)", " \tdefineHeartbeatJob(defs, deps)", ""].join("\n"));
    expect(unifiedDiff("a", "same\n", "same\n")).toBe("");
  });
});
