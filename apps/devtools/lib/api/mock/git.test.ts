import { beforeEach, describe, expect, it } from "vitest";
import { parseUnifiedDiff, hunkPatch } from "@/lib/git/diff";
import type { GitBranches, GitCommit, GitDiff, GitLog, GitMergePreview, GitRemoteResult, GitStatus } from "../git";
import { mockGitFetch, mockGitOpened, resetMockGit } from "./git";

const H = { "X-Orb-Portal": "1" };

async function call<T>(path: string, method = "GET", body?: unknown): Promise<{ status: number; body: T }> {
  const res = mockGitFetch(new URL(path, "http://127.0.0.1:3100"), method, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res) throw new Error(`no answer for ${path}`);
  return { status: res.status, body: res.status === 204 ? (undefined as T) : ((await res.json()) as T) };
}

const get = <T>(path: string) => call<T>(path);
const post = <T>(path: string, body?: unknown) => call<T>(path, "POST", body ?? {});

beforeEach(() => resetMockGit());

describe("status and diffs", () => {
  it("starts on main, ahead 1, with six changed files", async () => {
    const { status, body } = await get<GitStatus>("/_portal/api/git/status");
    expect(status).toBe(200);
    expect(body).toMatchObject({ branch: "main", detached: false, upstream: "origin/main", ahead: 1, behind: 0, remote: "origin", conflicts: 0 });
    expect(body.state).toBeUndefined();
    expect(body.files).toHaveLength(6);
    const byPath = Object.fromEntries(body.files.map((f) => [f.path, f]));
    expect(byPath["README.md"]).toMatchObject({ index: ".", worktree: "M", staged: false, unstaged: true });
    expect(byPath["internal/app/server.go"]).toMatchObject({ index: "M", worktree: "M", staged: true, unstaged: true });
    expect(byPath["api/handlers/healthz.go"]).toMatchObject({ index: "R", worktree: ".", old_path: "api/handlers/health.go", staged: true });
    expect(byPath["db/migrations/0004_projects_name_index.sql"]).toMatchObject({ index: "A", staged: true, unstaged: false });
    expect(byPath["docs/notes.md"]).toMatchObject({ index: "?", worktree: "?", untracked: true });
    expect(byPath["web/logo.png"]).toMatchObject({ index: ".", worktree: "M" });
    expect(body).toMatchObject({ staged: 3, unstaged: 3, untracked: 1 });
  });

  it("answers the diff per side, whole for untracked, binary for the image", async () => {
    const readme = (await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=false")).body;
    expect(readme.patch.startsWith("diff --git a/README.md b/README.md\n")).toBe(true);
    expect(parseUnifiedDiff(readme.patch)[0].hunks).toHaveLength(3);
    expect(readme).toMatchObject({ additions: 9, deletions: 4, binary: false, untracked: false });
    expect((await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=true")).body.patch).toBe("");
    const server = (await get<GitDiff>("/_portal/api/git/diff?path=internal%2Fapp%2Fserver.go&staged=true")).body;
    expect(parseUnifiedDiff(server.patch)[0].hunks).toHaveLength(1);
    const notes = (await get<GitDiff>("/_portal/api/git/diff?path=docs%2Fnotes.md&staged=false")).body;
    expect(notes.untracked).toBe(true);
    expect(notes.patch).toContain("--- /dev/null\n+++ b/docs/notes.md\n");
    const logo = (await get<GitDiff>("/_portal/api/git/diff?path=web%2Flogo.png&staged=false")).body;
    expect(logo.binary).toBe(true);
    const renamed = (await get<GitDiff>("/_portal/api/git/diff?path=api%2Fhandlers%2Fhealthz.go&staged=true")).body;
    expect(renamed.patch).toContain("rename from api/handlers/health.go\nrename to api/handlers/healthz.go\n");
    expect((await get("/_portal/api/git/diff?path=..%2Fetc%2Fpasswd")).status).toBe(400);
  });
});

describe("staging", () => {
  it("stages one hunk with a patch and unstages it in reverse", async () => {
    const before = parseUnifiedDiff((await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=false")).body.patch)[0];
    const patch = hunkPatch(before, before.hunks[1]);
    const r1 = await post<GitStatus>("/_portal/api/git/patch", { patch, reverse: false });
    expect(r1.status).toBe(200);
    expect(r1.body.files.find((f) => f.path === "README.md")).toMatchObject({ index: "M", worktree: "M" });
    const staged = parseUnifiedDiff((await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=true")).body.patch)[0];
    expect(staged.hunks).toHaveLength(1);
    expect(staged.hunks[0].header).toContain("## Configuration");
    const unstaged = parseUnifiedDiff((await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=false")).body.patch)[0];
    expect(unstaged.hunks).toHaveLength(2);
    // The same hunk again doesn't apply (it is staged now).
    expect((await post("/_portal/api/git/patch", { patch, reverse: false })).status).toBe(409);
    const r2 = await post<GitStatus>("/_portal/api/git/patch", { patch: hunkPatch(staged, staged.hunks[0]), reverse: true });
    expect(r2.status).toBe(200);
    expect(r2.body.files.find((f) => f.path === "README.md")).toMatchObject({ index: ".", worktree: "M" });
    expect((await post("/_portal/api/git/patch", { patch: "", reverse: false })).status).toBe(400);
  });

  it("stages, unstages and discards files", async () => {
    const s1 = (await post<GitStatus>("/_portal/api/git/stage", { paths: ["README.md", "docs/notes.md"] })).body;
    expect(s1.files.find((f) => f.path === "README.md")).toMatchObject({ index: "M", worktree: "." });
    expect(s1.files.find((f) => f.path === "docs/notes.md")).toMatchObject({ index: "A", worktree: ".", untracked: false });
    expect(s1.untracked).toBe(0);
    const s2 = (await post<GitStatus>("/_portal/api/git/unstage", { paths: ["docs/notes.md", "db/migrations/0004_projects_name_index.sql"] })).body;
    expect(s2.files.find((f) => f.path === "docs/notes.md")).toMatchObject({ untracked: true });
    expect(s2.files.find((f) => f.path === "db/migrations/0004_projects_name_index.sql")).toMatchObject({ untracked: true });
    const s3 = (await post<GitStatus>("/_portal/api/git/discard", { paths: ["docs/notes.md", "web/logo.png"] })).body;
    expect(s3.files.map((f) => f.path)).not.toContain("docs/notes.md");
    expect(s3.files.map((f) => f.path)).not.toContain("web/logo.png");
    expect((await post("/_portal/api/git/discard", { paths: [] })).status).toBe(400);
    expect((await post("/_portal/api/git/stage", { paths: ["nope.txt"] })).status).toBe(409);
  });

  it("commits the index and refuses an empty one", async () => {
    const c = await post<GitCommit>("/_portal/api/git/commit", { message: "Add the projects index\n\nCONCURRENTLY, so it doesn't lock the table." });
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ subject: "Add the projects index", body: "CONCURRENTLY, so it doesn't lock the table.", refs: ["main"] });
    const st = (await get<GitStatus>("/_portal/api/git/status")).body;
    expect(st.ahead).toBe(2);
    expect(st.head).toBe(c.body.hash);
    expect(st.files.map((f) => f.path)).toEqual(["README.md", "docs/notes.md", "internal/app/server.go", "web/logo.png"]);
    expect(st.files.find((f) => f.path === "internal/app/server.go")).toMatchObject({ index: ".", worktree: "M" });
    const log = (await get<GitLog>("/_portal/api/git/log?limit=2")).body;
    expect(log.commits[0].hash).toBe(c.body.hash);
    expect(log.commits[0].parents).toEqual([log.commits[1].hash]);
    const again = await post<GitStatus>("/_portal/api/git/commit", { message: "nothing" });
    expect(again.status).toBe(409);
    expect((await post("/_portal/api/git/commit", { message: "  " })).status).toBe(400);
  });
});

describe("branches", () => {
  it("lists local and remote branches with merged and ahead/behind", async () => {
    const { body } = await get<GitBranches>("/_portal/api/git/branches");
    const names = body.branches.map((b) => b.name);
    expect(names).toEqual(["main", "feature/webhooks", "fix/readme-typo", "release/1.0"]);
    expect(body.branches[0]).toMatchObject({ current: true, upstream: "origin/main", ahead: 1, behind: 0, merged: true });
    expect(body.branches.find((b) => b.name === "feature/webhooks")).toMatchObject({ merged: false, ahead: 0, behind: 0 });
    expect(body.branches.find((b) => b.name === "release/1.0")).toMatchObject({ merged: true });
    expect(body.remote).toEqual(["origin/feature/webhooks", "origin/main", "origin/release/1.0"]);
  });

  it("creates, switches and deletes; refusals read like git", async () => {
    const bad = await post("/_portal/api/git/branches", { name: "a..b", from: "", checkout: false });
    expect(bad.status).toBe(400);
    const dup = await post("/_portal/api/git/branches", { name: "main", from: "", checkout: false });
    expect(dup.status).toBe(409);
    // From an older commit with checkout: README.md differs there and has local changes, so git refuses the switch.
    const older = await post<{ detail: string }>("/_portal/api/git/branches", { name: "feature/old", from: "release/1.0", checkout: true });
    expect(older.status).toBe(409);
    expect(older.body.detail).toContain("would be overwritten by checkout");
    const made = await post<GitBranches>("/_portal/api/git/branches", { name: "feature/exports", from: "", checkout: true });
    expect(made.status).toBe(200);
    expect(made.body.branches.find((b) => b.name === "feature/exports")).toMatchObject({ current: true, merged: true });
    expect(made.body.branches.find((b) => b.name === "feature/old")).toMatchObject({ current: false, merged: true });
    expect((await get<GitStatus>("/_portal/api/git/status")).body.branch).toBe("feature/exports");
    const back = await post<GitStatus>("/_portal/api/git/switch", { name: "main" });
    expect(back.status).toBe(200);
    expect(back.body.branch).toBe("main");
    // README.md has local changes and fix/readme-typo touches it: git refuses.
    const clash = await post<{ detail: string }>("/_portal/api/git/switch", { name: "fix/readme-typo" });
    expect(clash.status).toBe(409);
    expect(clash.body.detail).toContain("would be overwritten by checkout");
    expect((await post("/_portal/api/git/switch", { name: "nope" })).status).toBe(409);
    // Delete: the current one, an unmerged one, then with force.
    expect((await call("/_portal/api/git/branches/main", "DELETE")).status).toBe(409);
    const unmerged = await call<{ detail: string }>("/_portal/api/git/branches/feature%2Fwebhooks", "DELETE");
    expect(unmerged.status).toBe(409);
    expect(unmerged.body.detail).toContain("not fully merged");
    const list = (await get<{ commits: GitCommit[] }>("/_portal/api/git/unmerged?branch=feature/webhooks")).body;
    expect(list.commits.map((c) => c.subject)).toEqual(["webhooks: sign payloads with HMAC", "webhooks: outgoing deliveries table"]);
    const forced = await call<GitBranches>("/_portal/api/git/branches/feature%2Fwebhooks?force=true", "DELETE");
    expect(forced.status).toBe(200);
    expect(forced.body.branches.map((b) => b.name)).not.toContain("feature/webhooks");
    const merged = await call<GitBranches>("/_portal/api/git/branches/feature%2Fexports", "DELETE");
    expect(merged.status).toBe(200);
  });
});

describe("remote", () => {
  it("pushes what is ahead, fetches and pulls", async () => {
    const pushed = await post<GitRemoteResult>("/_portal/api/git/push");
    expect(pushed.status).toBe(200);
    expect(pushed.body.output).toContain("main -> main");
    expect((await get<GitStatus>("/_portal/api/git/status")).body.ahead).toBe(0);
    expect((await post<GitRemoteResult>("/_portal/api/git/push")).body.output).toBe("Everything up-to-date\n");
    expect((await post<GitRemoteResult>("/_portal/api/git/fetch")).body.output).toBe("Fetching origin\n");
    expect((await post<GitRemoteResult>("/_portal/api/git/pull")).body.output).toBe("Already up to date.\n");
    await post("/_portal/api/git/branches", { name: "local-only", from: "", checkout: true });
    const first = await post<GitRemoteResult>("/_portal/api/git/push");
    expect(first.body.output).toContain("[new branch]");
    expect((await get<GitStatus>("/_portal/api/git/status")).body.upstream).toBe("origin/local-only");
  });
});

describe("merge", () => {
  it("previews a fast-forward and merges it", async () => {
    const pv = (await get<GitMergePreview>("/_portal/api/git/merge/preview?branch=feature/webhooks")).body;
    expect(pv).toMatchObject({ branch: "feature/webhooks", fast_forward: true, up_to_date: false, conflicts: [] });
    expect(pv.commits).toHaveLength(2);
    expect(pv.files).toEqual(["db/migrations/0005_webhook_deliveries.sql", "internal/webhooks/deliveries.go", "internal/webhooks/sign.go", "internal/webhooks/sign_test.go"]);
    const done = await post<GitRemoteResult>("/_portal/api/git/merge", { branch: "feature/webhooks" });
    expect(done.status).toBe(200);
    expect(done.body.output).toContain("Fast-forward");
    const st = (await get<GitStatus>("/_portal/api/git/status")).body;
    expect(st.ahead).toBe(3);
    expect(st.state).toBeUndefined();
    expect((await get<GitMergePreview>("/_portal/api/git/merge/preview?branch=feature/webhooks")).body.up_to_date).toBe(true);
    expect((await get<GitBranches>("/_portal/api/git/branches")).body.branches.find((b) => b.name === "feature/webhooks")?.merged).toBe(true);
  });

  it("previews a conflict, merges into a conflicted state, opens the file and aborts", async () => {
    const pv = (await get<GitMergePreview>("/_portal/api/git/merge/preview?branch=fix/readme-typo")).body;
    expect(pv).toMatchObject({ fast_forward: false, conflicts: ["README.md"], files: ["README.md"] });
    expect(pv.commits.map((c) => c.subject)).toEqual(["Fix a typo in the README"]);
    // Local README changes: refused like git.
    const clash = await post<{ detail: string }>("/_portal/api/git/merge", { branch: "fix/readme-typo" });
    expect(clash.status).toBe(409);
    expect(clash.body.detail).toContain("would be overwritten by merge");
    await post("/_portal/api/git/discard", { paths: ["README.md"] });
    const merged = await post<GitRemoteResult>("/_portal/api/git/merge", { branch: "fix/readme-typo" });
    expect(merged.status).toBe(200);
    expect(merged.body.conflicts).toEqual(["README.md"]);
    expect(merged.body.output).toContain("CONFLICT (content)");
    const st = (await get<GitStatus>("/_portal/api/git/status")).body;
    expect(st.state).toBe("merging");
    expect(st.conflicts).toBe(1);
    expect(st.files.find((f) => f.path === "README.md")).toMatchObject({ index: "U", worktree: "U", conflict: true });
    expect((await get<{ files: string[] }>("/_portal/api/git/conflicts")).body.files).toEqual(["README.md"]);
    const diff = (await get<GitDiff>("/_portal/api/git/diff?path=README.md&staged=false")).body;
    expect(diff.patch).toContain("<<<<<<< HEAD");
    expect((await post("/_portal/api/git/commit", { message: "x" })).status).toBe(409);
    expect((await post("/_portal/api/git/switch", { name: "main" })).status).toBe(409);
    const opened = await post("/_portal/api/git/open", { path: "README.md", line: 3 });
    expect(opened.status).toBe(204);
    expect(mockGitOpened()).toBe(1);
    expect((await post("/_portal/api/git/open", { path: "/etc/hosts", line: 0 })).status).toBe(400);
    const aborted = await post<GitStatus>("/_portal/api/git/merge/abort");
    expect(aborted.status).toBe(200);
    expect(aborted.body.state).toBeUndefined();
    expect(aborted.body.conflicts).toBe(0);
    expect((await post("/_portal/api/git/merge/abort")).status).toBe(409);
  });

  it("resolves a conflict by staging the file and committing a merge commit", async () => {
    await post("/_portal/api/git/discard", { paths: ["README.md"] });
    await post("/_portal/api/git/merge", { branch: "fix/readme-typo" });
    const staged = (await post<GitStatus>("/_portal/api/git/stage", { paths: ["README.md"] })).body;
    expect(staged.conflicts).toBe(0);
    expect(staged.state).toBe("merging");
    const c = (await post<GitCommit>("/_portal/api/git/commit", { message: "Merge branch 'fix/readme-typo'" })).body;
    expect(c.parents).toHaveLength(2);
    expect((await get<GitStatus>("/_portal/api/git/status")).body.state).toBeUndefined();
  });
});

describe("log", () => {
  it("lists main's history, every branch, ranges and pages", async () => {
    const main = (await get<GitLog>("/_portal/api/git/log?limit=100")).body.commits;
    expect(main).toHaveLength(27);
    expect(main[0]).toMatchObject({ subject: "Pin sql-formatter and regenerate the lockfile", refs: ["main"] });
    expect(main[1].refs).toEqual(["origin/main"]);
    expect(main.find((c) => c.subject === "Merge branch 'feature/auth'")?.parents).toHaveLength(2);
    expect(main.find((c) => c.subject === "Prepare 1.0: changelog and version")?.refs).toEqual(["release/1.0", "tag: v1.0.0", "origin/release/1.0"]);
    expect(main.map((c) => c.subject)).not.toContain("webhooks: sign payloads with HMAC");
    const all = (await get<GitLog>("/_portal/api/git/log?all=true&limit=100")).body.commits;
    expect(all).toHaveLength(30);
    expect(all[0].subject).toBe("webhooks: sign payloads with HMAC");
    for (let i = 1; i < all.length; i++) expect(Date.parse(all[i - 1].time)).toBeGreaterThanOrEqual(Date.parse(all[i].time));
    const page1 = (await get<GitLog>("/_portal/api/git/log?all=true&limit=20")).body.commits;
    const page2 = (await get<GitLog>("/_portal/api/git/log?all=true&limit=20&skip=20")).body.commits;
    expect(page1).toHaveLength(20);
    expect(page2).toHaveLength(10);
    expect([...page1, ...page2].map((c) => c.hash)).toEqual(all.map((c) => c.hash));
    const range = (await get<GitLog>("/_portal/api/git/log?range=HEAD..fix%2Freadme-typo")).body.commits;
    expect(range.map((c) => c.subject)).toEqual(["Fix a typo in the README"]);
    expect((await get("/_portal/api/git/log?range=-x")).status).toBe(400);
    expect((await get("/_portal/api/git/log?range=nope..main")).status).toBe(409);
  });
});
