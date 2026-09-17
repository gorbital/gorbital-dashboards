import { describe, expect, it } from "vitest";
import { branchNameError, localName, validBranchName } from "./branch";
import { describeStat, diffPath, diffStat, hunkPatch, hunkPatchReversed, parseUnifiedDiff } from "./diff";
import { assignLanes, graphWidth } from "./graph";
import { joinMessage, shortSubject, splitMessage } from "./message";
import { describeCounts, letterTone, splitFiles } from "./status";
import { relativeTime } from "./time";

const patch = `diff --git a/README.md b/README.md
index 3b18e51..a1b2c3d 100644
--- a/README.md
+++ b/README.md
@@ -1,4 +1,5 @@
 # fullsmoke
+A line added at the top.

 Some text.
-Old line.
+New line.
@@ -20,3 +21,4 @@ ## Section
 twenty
 twenty-one
 twenty-two
+twenty-three
\\ No newline at end of file
`;

describe("parseUnifiedDiff", () => {
  it("reads files, hunks and numbered lines", () => {
    const files = parseUnifiedDiff(patch);
    expect(files).toHaveLength(1);
    const f = files[0];
    expect(f.oldPath).toBe("README.md");
    expect(f.newPath).toBe("README.md");
    expect(diffPath(f)).toBe("README.md");
    expect(f.header).toEqual(["diff --git a/README.md b/README.md", "index 3b18e51..a1b2c3d 100644", "--- a/README.md", "+++ b/README.md"]);
    expect(f.hunks).toHaveLength(2);
    const [h1, h2] = f.hunks;
    expect(h1).toMatchObject({ oldStart: 1, oldLines: 4, newStart: 1, newLines: 5, additions: 2, deletions: 1 });
    expect(h1.lines.map((l) => [l.type, l.oldNo, l.newNo])).toEqual([
      ["same", 1, 1],
      ["add", undefined, 2],
      ["same", 2, 3],
      ["same", 3, 4],
      ["del", 4, undefined],
      ["add", undefined, 5],
    ]);
    expect(h2.header).toBe("@@ -20,3 +21,4 @@ ## Section");
    expect(h2.lines[h2.lines.length - 1]).toEqual({ type: "meta", text: "\\ No newline at end of file" });
    expect(diffStat(f)).toEqual({ additions: 3, deletions: 1 });
  });

  it("recognises created, deleted, renamed and binary files", () => {
    const created = parseUnifiedDiff("diff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello\n")[0];
    expect(created).toMatchObject({ created: true, oldPath: "/dev/null", newPath: "new.txt" });
    expect(diffPath(created)).toBe("new.txt");
    expect(created.hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1 });
    const deleted = parseUnifiedDiff("diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye\n")[0];
    expect(deleted).toMatchObject({ deleted: true });
    expect(diffPath(deleted)).toBe("gone.txt");
    const renamed = parseUnifiedDiff("diff --git a/a.txt b/b.txt\nsimilarity index 90%\nrename from a.txt\nrename to b.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-x\n+y\n")[0];
    expect(renamed).toMatchObject({ renamed: true, oldPath: "a.txt", newPath: "b.txt" });
    const binary = parseUnifiedDiff("diff --git a/logo.png b/logo.png\nindex 1..2 100644\nBinary files a/logo.png and b/logo.png differ\n")[0];
    expect(binary).toMatchObject({ binary: true, oldPath: "logo.png", newPath: "logo.png", hunks: [] });
    // The no-index diff of an untracked file (what the backend sends for one).
    const untracked = parseUnifiedDiff("diff --git a/dev/null b/notes.txt\nnew file mode 100644\nindex 0000000..1234567\n--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n")[0];
    expect(diffPath(untracked)).toBe("notes.txt");
    expect(untracked.hunks[0].lines.map((l) => l.newNo)).toEqual([1, 2]);
  });

  it("gives nothing for an empty patch", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("hunkPatch", () => {
  it("rebuilds the file header and one hunk", () => {
    const f = parseUnifiedDiff(patch)[0];
    const one = hunkPatch(f, f.hunks[1]);
    expect(one).toBe(`diff --git a/README.md b/README.md
index 3b18e51..a1b2c3d 100644
--- a/README.md
+++ b/README.md
@@ -20,3 +21,4 @@ ## Section
 twenty
 twenty-one
 twenty-two
+twenty-three
\\ No newline at end of file
`);
    // Parsing it again gives the same hunk.
    const again = parseUnifiedDiff(one)[0];
    expect(again.hunks).toHaveLength(1);
    expect(again.hunks[0].lines).toEqual(f.hunks[1].lines);
  });

  it("reverses signs, counts and paths", () => {
    const f = parseUnifiedDiff(patch)[0];
    const rev = hunkPatchReversed(f, f.hunks[0]);
    expect(rev).toContain("--- b/README.md\n+++ a/README.md\n");
    expect(rev).toContain("@@ -1,5 +1,4 @@\n");
    expect(rev).toContain("\n-A line added at the top.\n");
    expect(rev).toContain("\n+Old line.\n-New line.\n");
    const parsed = parseUnifiedDiff(rev)[0];
    expect(diffStat(parsed)).toEqual({ additions: 1, deletions: 2 });
    const created = parseUnifiedDiff("diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello\n")[0];
    const revCreated = hunkPatchReversed(created, created.hunks[0]);
    expect(revCreated).toBe("diff --git a/new.txt b/new.txt\ndeleted file mode 100644\n--- b/new.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-hello\n");
  });

  it("describes a stat", () => {
    expect(describeStat(1, 1)).toBe("1 addition and 1 deletion");
    expect(describeStat(3, 0)).toBe("3 additions and 0 deletions");
  });
});

describe("assignLanes", () => {
  it("keeps a linear history in one lane", () => {
    const rows = assignLanes([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows[0].edges).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(rows[2].edges).toEqual([]);
    expect(graphWidth(rows)).toBe(1);
  });

  it("opens a lane for a merge's second parent and closes it at the fork", () => {
    // m merges f into main: m -> [c, f]; f -> b; c -> b; b -> a
    const rows = assignLanes([
      { hash: "m", parents: ["c", "f"] },
      { hash: "f", parents: ["b"] },
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    const byHash = Object.fromEntries(rows.map((r) => [r.hash, r]));
    expect(byHash.m.lane).toBe(0);
    expect(byHash.m.merge).toBe(true);
    expect(byHash.m.edges).toEqual(expect.arrayContaining([{ from: 0, to: 0, color: 0 }, { from: 0, to: 1, color: 1 }]));
    expect(byHash.f.lane).toBe(1);
    expect(byHash.c.lane).toBe(0);
    // c's parent b is already waited for by lane 1 (f's parent): lane 1 is pulled into lane 0 and the fork closes.
    expect(byHash.b.lane).toBe(0);
    expect(byHash.c.edges).toEqual(expect.arrayContaining([{ from: 1, to: 0, color: 1 }, { from: 0, to: 0, color: 0 }]));
    expect(byHash.b.edges).toEqual([{ from: 0, to: 0, color: 0 }]);
    expect(byHash.b.width).toBe(1);
    expect(byHash.a.width).toBe(1);
    expect(graphWidth(rows)).toBe(2);
  });

  it("closes a branch head whose parent is already waited for", () => {
    // Two branch tips with a shared parent (all branches view).
    const rows = assignLanes([
      { hash: "x", parents: ["a"] },
      { hash: "y", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1);
    expect(rows[1].edges).toEqual(expect.arrayContaining([{ from: 1, to: 0, color: 1 }, { from: 0, to: 0, color: 0 }]));
    expect(rows[2].lane).toBe(0);
    expect(rows[2].width).toBe(1);
  });
});

describe("branch names", () => {
  it("mirrors the backend's rules", () => {
    for (const ok of ["main", "feature/x", "v1.2", "a-b_c", "fix/ISSUE-12"]) expect(validBranchName(ok)).toBe(true);
    for (const bad of ["", "-x", "a..b", "a/", "a.lock", "a//b", "a b", "/x", "x~1", "a".repeat(201)]) expect(validBranchName(bad)).toBe(false);
  });
  it("explains", () => {
    expect(branchNameError("")).toMatch(/required/);
    expect(branchNameError("a b")).toMatch(/spaces/);
    expect(branchNameError("-x")).toMatch(/Start/);
    expect(branchNameError("a..b")).toMatch(/\.\./);
    expect(branchNameError("a/")).toMatch(/end/);
    expect(branchNameError("x~1")).toMatch(/Only/);
    expect(branchNameError("feature/x")).toBeUndefined();
  });
  it("strips the remote", () => {
    expect(localName("origin/feature/x")).toBe("feature/x");
    expect(localName("main")).toBe("main");
    expect(localName("upstream/dev", ["origin", "upstream"])).toBe("dev");
  });
});

describe("messages", () => {
  it("joins and splits", () => {
    expect(joinMessage("Subject ", "")).toBe("Subject");
    expect(joinMessage("Subject", "Body line\n\n")).toBe("Subject\n\nBody line");
    expect(splitMessage("Subject\n\nBody\nmore\n")).toEqual({ subject: "Subject", body: "Body\nmore" });
    expect(splitMessage("Only subject")).toEqual({ subject: "Only subject", body: "" });
    expect(splitMessage("Subject\nno blank line")).toEqual({ subject: "Subject", body: "no blank line" });
    expect(shortSubject("x".repeat(80), 20)).toHaveLength(20);
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 8, 17, 12, 0, 0);
  const at = (ms: number) => new Date(now - ms).toISOString();
  it("speaks", () => {
    expect(relativeTime(at(10_000), now)).toBe("just now");
    expect(relativeTime(at(5 * 60_000), now)).toBe("5 minutes ago");
    expect(relativeTime(at(60_000), now)).toBe("1 minute ago");
    expect(relativeTime(at(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(relativeTime(at(26 * 3_600_000), now)).toBe("yesterday");
    expect(relativeTime(at(4 * 86_400_000), now)).toBe("4 days ago");
    expect(relativeTime(at(15 * 86_400_000), now)).toBe("2 weeks ago");
    expect(relativeTime(at(70 * 86_400_000), now)).toBe("2 months ago");
    expect(relativeTime(at(800 * 86_400_000), now)).toBe("2 years ago");
    expect(relativeTime(undefined, now)).toBe("—");
    expect(relativeTime(at(0), 0)).toBe("—");
  });
});

describe("status", () => {
  it("splits files into the two lists", () => {
    const { staged, changes } = splitFiles([
      { path: "b.txt", index: "M", worktree: "M", staged: true, unstaged: true, untracked: false, conflict: false },
      { path: "a.txt", index: "A", worktree: ".", staged: true, unstaged: false, untracked: false, conflict: false },
      { path: "c.txt", index: "?", worktree: "?", staged: false, unstaged: false, untracked: true, conflict: false },
      { path: "d.txt", index: "U", worktree: "U", staged: false, unstaged: true, untracked: false, conflict: true },
      { path: "new.txt", old_path: "old.txt", index: "R", worktree: ".", staged: true, unstaged: false, untracked: false, conflict: false },
    ]);
    expect(staged.map((e) => `${e.letter} ${e.file.path}`)).toEqual(["A a.txt", "M b.txt", "R new.txt"]);
    expect(changes.map((e) => `${e.letter} ${e.file.path}`)).toEqual(["M b.txt", "? c.txt", "U d.txt"]);
    expect(letterTone("D")).toBe("danger");
    expect(letterTone("?")).toBe("ok");
    expect(describeCounts({ staged: 1, unstaged: 0, untracked: 2, conflicts: 0 })).toBe("1 staged · 2 untracked");
    expect(describeCounts({ staged: 0, unstaged: 0, untracked: 0, conflicts: 0 })).toBe("clean");
  });
});
