/**
 * The repository behind `/_portal/api/git/*` in mock mode: a working tree
 * with six changed files (a rename, a staged one, an untracked one, a
 * binary), branches with an upstream, a thirty-commit history over three
 * branches with merges, and every endpoint mutating that state the way
 * git would (hunks move between the index and the tree, commits appear in
 * the log, a merge fast-forwards or conflicts, push resets ahead).
 */
import { NOW, MIN, rng } from "@gorbital/dash/lib/rand";
import { diffPath, parseUnifiedDiff } from "@/lib/git/diff";
import { validBranchName } from "@/lib/git/branch";
import type { GitBranch, GitCommit, GitDiff, GitFile, GitMergePreview, GitRemoteResult, GitStatus } from "../git";
import type { Problem } from "../types";

/* ---------- Responses ---------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 404: "Not Found", 409: "Conflict", 502: "Bad Gateway" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const refused = (message: string) => problem(409, "git_refused", message);

/* ---------- The history ---------- */

type Ref = { name: string; hash: string; upstream?: string; remoteHash?: string };

let commits: GitCommit[] = [];
let branches: Ref[] = [];
let tags: { name: string; hash: string }[] = [];
let current = "main";
let state = "";
let files: MockFile[] = [];
let seq = 0;

const r = rng(0x9a7);
const hash = () => r.hex(40);
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * MIN).toISOString();

const authors = [
  ["Ada Okafor", "ada@acme.dev"],
  ["Mikkel Sørensen", "mikkel@acme.dev"],
  ["Priya Natarajan", "priya@acme.dev"],
] as const;

function add(subject: string, parents: string[], minutesAgo: number, body = "", who = 0): string {
  const h = hash();
  const [author, email] = authors[who % authors.length];
  commits.push({ hash: h, short: h.slice(0, 7), parents, author, email, time: iso(minutesAgo), subject, body: body || undefined, refs: [] });
  return h;
}

function buildHistory() {
  commits = [];
  const D = 24 * 60;
  const c1 = add("Initial commit from orb new", [], 40 * D, "orb new fullsmoke --preset full", 0);
  const c2 = add("Add project layout and Makefile", [c1], 39 * D + 300, "", 0);
  const c3 = add("Wire the health endpoint", [c2], 38 * D, "GET /healthz answers ok; /readyz checks PostgreSQL and River.", 1);
  const c4 = add("Add PostgreSQL compose service", [c3], 37 * D, "", 1);
  const c5 = add("Add the users table migration", [c4], 36 * D, "", 2);
  // feature/auth
  const a1 = add("auth: sessions table and model", [c5], 35 * D + 200, "", 2);
  const a2 = add("auth: sign-in and sign-out handlers", [a1], 34 * D + 100, "Password sign-in with argon2id; sessions in the auth schema.", 2);
  const a3 = add("auth: rate-limit sign-in attempts", [a2], 33 * D, "Ten attempts per email per fifteen minutes, then 429.", 2);
  const c6 = add("Add request logging middleware", [c5], 35 * D, "", 0);
  const c7 = add("Configure CORS origins from the environment", [c6], 34 * D, "", 1);
  const c8 = add("Merge branch 'feature/auth'", [c7, a3], 32 * D + 600, "", 0);
  const c9 = add("Add the ops API and the dev operator", [c8], 30 * D, "orb dev sends its console token to /ops and the app treats it as a development operator (ADR-0066).", 0);
  const c10 = add("Prepare 1.0: changelog and version", [c9], 28 * D, "", 1);
  // feature/jobs
  const j1 = add("jobs: River client and the default queue", [c10], 27 * D + 200, "", 1);
  const j2 = add("jobs: audit.rollup nightly job", [j1], 26 * D, "Rolls the audit log up into daily counts at 02:00.", 1);
  const c11 = add("Fix the readiness check when PostgreSQL is starting", [c10], 27 * D, "", 2);
  const c12 = add("Bump Go to 1.25", [c11], 25 * D, "", 0);
  const c13 = add("Merge branch 'feature/jobs'", [c12, j2], 24 * D + 300, "", 1);
  const c14 = add("mail: capture outgoing email in development", [c13], 22 * D, "Mailpit in compose; the dev console lists what was sent.", 2);
  const c15 = add("Add the storage module with MinIO in compose", [c14], 20 * D, "", 0);
  const c16 = add("Document the dev portal in the README", [c15], 15 * D, "", 1);
  // fix/readme-typo, from c16
  const f1 = add("Fix a typo in the README", [c16], 13 * D, "", 2);
  const c17 = add("Add an audit log for settings changes", [c16], 12 * D, "", 0);
  const c18 = add("Rewrite the README's getting started section", [c17], 9 * D, "The quickstart now runs orb new, orb dev and opens the portal.", 1);
  const c19 = add("Add the projects table and the API", [c18], 6 * D, "", 2);
  const c20 = add("Return 422 for invalid project names", [c19], 4 * D, "", 2);
  const c21 = add("Add the schema diagram export", [c20], 2 * D, "PNG, SVG and Mermaid from the Schema page.", 0);
  const c22 = add("Pin sql-formatter and regenerate the lockfile", [c21], 3 * 60, "", 0);
  // feature/webhooks, from c22
  const w1 = add("webhooks: outgoing deliveries table", [c22], 100, "", 1);
  const w2 = add("webhooks: sign payloads with HMAC", [w1], 35, "X-Signature carries an HMAC-SHA256 of the body with the endpoint's secret.", 1);
  branches = [
    { name: "main", hash: c22, upstream: "origin/main", remoteHash: c21 },
    { name: "feature/webhooks", hash: w2, upstream: "origin/feature/webhooks", remoteHash: w2 },
    { name: "fix/readme-typo", hash: f1 },
    { name: "release/1.0", hash: c10, upstream: "origin/release/1.0", remoteHash: c10 },
  ];
  tags = [{ name: "v1.0.0", hash: c10 }];
  current = "main";
  state = "";
}

const byHash = () => new Map(commits.map((c) => [c.hash, c]));

/** Every commit reachable from `from` (the hash itself included). */
function reachable(from: string, index = byHash()): Set<string> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const h = stack.pop()!;
    if (seen.has(h)) continue;
    const c = index.get(h);
    if (!c) continue;
    seen.add(h);
    stack.push(...c.parents);
  }
  return seen;
}

const headHash = () => branches.find((b) => b.name === current)?.hash ?? "";

function resolve(rev: string): string | undefined {
  if (rev === "HEAD" || rev === "") return headHash();
  const b = branches.find((x) => x.name === rev);
  if (b) return b.hash;
  const remote = branches.find((x) => x.upstream === rev);
  if (remote?.remoteHash) return remote.remoteHash;
  const t = tags.find((x) => x.name === rev);
  if (t) return t.hash;
  return commits.find((c) => c.hash === rev || c.hash.startsWith(rev))?.hash;
}

/** Refs as `git log --decorate` lists them, with `HEAD -> ` stripped as the backend does. */
function refsOf(h: string): string[] {
  const out: string[] = [];
  for (const b of branches) if (b.hash === h) out.push(b.name);
  for (const t of tags) if (t.hash === h) out.push(`tag: ${t.name}`);
  for (const b of branches) if (b.remoteHash === h && b.upstream) out.push(b.upstream);
  const cur = out.indexOf(current);
  if (cur > 0) out.unshift(...out.splice(cur, 1));
  return out;
}

function withRefs(c: GitCommit): GitCommit {
  return { ...c, refs: refsOf(c.hash) };
}

function log(opts: { all: boolean; range: string; limit: number; skip: number }): GitCommit[] | Response {
  const index = byHash();
  let set: Set<string>;
  if (opts.range) {
    const m = /^(.*?)\.\.(.*)$/.exec(opts.range);
    if (!m) {
      const h = resolve(opts.range);
      if (!h) return refused(`fatal: ambiguous argument '${opts.range}': unknown revision or path not in the working tree.`);
      set = reachable(h, index);
    } else {
      const a = resolve(m[1] || "HEAD");
      const b = resolve(m[2] || "HEAD");
      if (!a || !b) return refused(`fatal: ambiguous argument '${opts.range}': unknown revision or path not in the working tree.`);
      const exclude = reachable(a, index);
      set = new Set([...reachable(b, index)].filter((h) => !exclude.has(h)));
    }
  } else if (opts.all) {
    set = new Set(commits.map((c) => c.hash));
  } else {
    set = reachable(headHash(), index);
  }
  const list = commits
    .filter((c) => set.has(c.hash))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(opts.skip, opts.skip + opts.limit)
    .map(withRefs);
  return list;
}

/* ---------- The working tree ---------- */

type Kind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "binary";

/** One hunk of a file's diff, on one side of the index. */
type MockHunk = {
  /** The `@@` line and the content lines, as printed. */
  lines: string[];
  staged: boolean;
};

type MockFile = {
  path: string;
  old_path?: string;
  kind: Kind;
  hunks: MockHunk[];
  conflict?: boolean;
};

function hunk(oldStart: number, newStart: number, lines: string[], staged = false, section = ""): MockHunk {
  const oldLines = lines.filter((l) => !l.startsWith("+") && !l.startsWith("\\")).length;
  const newLines = lines.filter((l) => !l.startsWith("-") && !l.startsWith("\\")).length;
  return { lines: [`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${section ? ` ${section}` : ""}`, ...lines], staged };
}

function buildTree() {
  files = [
    {
      path: "README.md",
      kind: "modified",
      hunks: [
        hunk(1, 1, ["# fullsmoke", " ", "-A gorbital app.", "+A gorbital app, generated with `orb new fullsmoke --preset full`.", "+", "+Run it with `orb dev`; the Dev Portal opens at http://127.0.0.1:3100.", " ", "## Getting started"]),
        hunk(24, 26, [" ## Configuration", " ", " Settings come from `.env`:", "-- `DATABASE_URL`: PostgreSQL", "-- `MAIL_URL`: Mailpit", "+- `DATABASE_URL`: the PostgreSQL connection string", "+- `MAIL_URL`: where outgoing mail is captured in development", "+- `STORAGE_URL`: the MinIO endpoint", " ", " ## Jobs"], false, "## Configuration"),
        hunk(58, 61, [" ## License", " ", "-MIT", "+MIT. See `LICENSE`.", "+", "+Made with [gorbital](https://gorbital.dev)."], false, "## License"),
      ],
    },
    {
      path: "internal/app/server.go",
      kind: "modified",
      hunks: [
        hunk(12, 12, [' \t"net/http"', ' \t"time"', " ", '+\t"github.com/gorbital/gorbital/pkg/observe"', ' \t"github.com/gorbital/gorbital/pkg/router"', " )", " "], true),
        hunk(41, 42, [" \tsrv := &http.Server{", " \t\tAddr:              cfg.Addr,", " \t\tHandler:           h,", "-\t\tReadHeaderTimeout: 5 * time.Second,", "+\t\tReadHeaderTimeout: 10 * time.Second,", "+\t\tIdleTimeout:       120 * time.Second,", " \t}", "+\tobserve.Register(srv)", " \treturn srv"], false, "func newServer(cfg Config, h http.Handler) *http.Server {"),
      ],
    },
    {
      path: "api/handlers/healthz.go",
      old_path: "api/handlers/health.go",
      kind: "renamed",
      hunks: [hunk(9, 9, [" // Healthz answers ok while the process runs.", "-func Health(w http.ResponseWriter, _ *http.Request) {", "+func Healthz(w http.ResponseWriter, _ *http.Request) {", ' \tw.Header().Set("Content-Type", "application/json")', ' \t_, _ = w.Write([]byte(`{"status":"ok"}`))', " }"], true, "package handlers")],
    },
    {
      path: "db/migrations/0004_projects_name_index.sql",
      kind: "added",
      hunks: [hunk(0, 1, ["+-- +goose Up", "+CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_name_idx ON projects (lower(name));", "+", "+-- +goose Down", "+DROP INDEX IF EXISTS projects_name_idx;"], true)],
    },
    {
      path: "docs/notes.md",
      kind: "untracked",
      hunks: [hunk(0, 1, ["+# Notes", "+", "+- the webhook signing key rotates monthly", "+- move the audit rollup to 03:00 in production"])],
    },
    {
      path: "web/logo.png",
      kind: "binary",
      hunks: [{ lines: ["Binary files a/web/logo.png and b/web/logo.png differ"], staged: false }],
    },
  ];
}

function header(f: MockFile, staged: boolean): string[] {
  const oid = () => r.hex(7);
  switch (f.kind) {
    case "untracked":
      return [`diff --git a/${f.path} b/${f.path}`, "new file mode 100644", `index 0000000..${oid()}`, "--- /dev/null", `+++ b/${f.path}`];
    case "added":
      return [`diff --git a/${f.path} b/${f.path}`, "new file mode 100644", `index 0000000..${oid()}`, "--- /dev/null", `+++ b/${f.path}`];
    case "deleted":
      return [`diff --git a/${f.path} b/${f.path}`, "deleted file mode 100644", `index ${oid()}..0000000`, `--- a/${f.path}`, "+++ /dev/null"];
    case "renamed":
      if (staged) return [`diff --git a/${f.old_path} b/${f.path}`, "similarity index 88%", `rename from ${f.old_path}`, `rename to ${f.path}`, `index ${oid()}..${oid()} 100644`, `--- a/${f.old_path}`, `+++ b/${f.path}`];
      return [`diff --git a/${f.path} b/${f.path}`, `index ${oid()}..${oid()} 100644`, `--- a/${f.path}`, `+++ b/${f.path}`];
    default:
      return [`diff --git a/${f.path} b/${f.path}`, `index ${oid()}..${oid()} 100644`, `--- a/${f.path}`, `+++ b/${f.path}`];
  }
}

function diffOf(path: string, staged: boolean): GitDiff {
  const f = files.find((x) => x.path === path);
  const d: GitDiff = { path, staged, patch: "", binary: false, untracked: false, additions: 0, deletions: 0 };
  if (!f) return d;
  if (f.kind === "binary") {
    if (staged === f.hunks[0].staged) {
      d.patch = [`diff --git a/${f.path} b/${f.path}`, `index ${r.hex(7)}..${r.hex(7)} 100644`, ...f.hunks[0].lines].join("\n") + "\n";
      d.binary = true;
    }
    return d;
  }
  if (f.conflict) {
    if (staged) return d;
    d.patch = [`diff --cc ${f.path}`, `index ${r.hex(7)},${r.hex(7)}..0000000`, `--- a/${f.path}`, `+++ b/${f.path}`, ...f.hunks[0].lines].join("\n") + "\n";
    d.additions = f.hunks[0].lines.filter((l) => l.startsWith("+")).length;
    return d;
  }
  const hunks = f.hunks.filter((h) => h.staged === staged);
  if (!hunks.length) return d;
  d.untracked = f.kind === "untracked" && !staged;
  d.patch = [...header(f, staged), ...hunks.flatMap((h) => h.lines)].join("\n") + "\n";
  for (const h of hunks) {
    for (const l of h.lines.slice(1)) {
      if (l.startsWith("+")) d.additions++;
      else if (l.startsWith("-")) d.deletions++;
    }
  }
  return d;
}

function fileStatus(f: MockFile): GitFile {
  if (f.conflict) return { path: f.path, index: "U", worktree: "U", staged: false, unstaged: true, untracked: false, conflict: true };
  if (f.kind === "untracked") return { path: f.path, index: "?", worktree: "?", staged: false, unstaged: false, untracked: true, conflict: false };
  const anyStaged = f.hunks.some((h) => h.staged);
  const anyUnstaged = f.hunks.some((h) => !h.staged);
  const indexLetter = !anyStaged ? "." : f.kind === "added" ? "A" : f.kind === "renamed" ? "R" : f.kind === "deleted" ? "D" : "M";
  const worktreeLetter = !anyUnstaged ? "." : f.kind === "deleted" ? "D" : "M";
  return { path: f.path, old_path: f.kind === "renamed" && anyStaged ? f.old_path : undefined, index: indexLetter, worktree: worktreeLetter, staged: anyStaged, unstaged: anyUnstaged, untracked: false, conflict: false };
}

function status(): GitStatus {
  const b = branches.find((x) => x.name === current)!;
  const list = files.map(fileStatus).sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  const st: GitStatus = { branch: current, detached: false, upstream: b.upstream, ahead: 0, behind: 0, files: list, state: state || undefined, head: b.hash, remote: b.upstream ? b.upstream.split("/")[0] : undefined, staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  if (b.upstream && b.remoteHash) {
    const index = byHash();
    const local = reachable(b.hash, index);
    const remote = reachable(b.remoteHash, index);
    st.ahead = [...local].filter((h) => !remote.has(h)).length;
    st.behind = [...remote].filter((h) => !local.has(h)).length;
  }
  for (const f of list) {
    if (f.conflict) st.conflicts++;
    else if (f.untracked) st.untracked++;
    else {
      if (f.staged) st.staged++;
      if (f.unstaged) st.unstaged++;
    }
  }
  return st;
}

function branchList(): { branches: GitBranch[]; remote: string[] } {
  const index = byHash();
  const head = reachable(headHash(), index);
  const local: GitBranch[] = branches.map((b) => {
    let ahead = 0;
    let behind = 0;
    if (b.upstream && b.remoteHash) {
      const l = reachable(b.hash, index);
      const rr = reachable(b.remoteHash, index);
      ahead = [...l].filter((h) => !rr.has(h)).length;
      behind = [...rr].filter((h) => !l.has(h)).length;
    }
    return { name: b.name, current: b.name === current, upstream: b.upstream, ahead, behind, head: b.hash.slice(0, 7), subject: index.get(b.hash)?.subject ?? "", merged: head.has(b.hash) };
  });
  const remote = branches.filter((b) => b.upstream).map((b) => b.upstream!);
  return { branches: local, remote: [...new Set(remote)].sort() };
}

/* ---------- Mutations ---------- */

const badPath = (p: string) => !p || p.startsWith("-") || p.startsWith("/") || p.split("/").includes("..");

function stage(paths: string[]): Response {
  for (const p of paths) {
    const f = files.find((x) => x.path === p);
    if (!f) return refused(`fatal: pathspec '${p}' did not match any files`);
    if (f.conflict) {
      f.conflict = false;
      f.kind = "modified";
      f.hunks = [hunk(1, 1, ["-A gorbital app.", "+A gorbital app, resolved."], true)];
      continue;
    }
    if (f.kind === "untracked") f.kind = "added";
    for (const h of f.hunks) h.staged = true;
  }
  return json(status());
}

function unstage(paths: string[]): Response {
  for (const p of paths) {
    const f = files.find((x) => x.path === p);
    if (!f) return refused(`error: pathspec '${p}' did not match any file(s) known to git`);
    if (f.kind === "added") f.kind = "untracked";
    for (const h of f.hunks) h.staged = false;
  }
  return json(status());
}

function discard(paths: string[]): Response {
  for (const p of paths) {
    if (!files.some((x) => x.path === p)) return refused(`error: pathspec '${p}' did not match any file(s) known to git`);
  }
  files = files.filter((x) => !paths.includes(x.path));
  return json(status());
}

function applyPatch(patch: string, reverse: boolean): Response {
  const parsed = parseUnifiedDiff(patch);
  if (!parsed.length || !parsed[0].hunks.length) return refused("error: unrecognized input");
  for (const pf of parsed) {
    const path = diffPath(pf);
    const f = files.find((x) => x.path === path);
    if (!f) return refused(`error: ${path}: does not exist in index`);
    for (const ph of pf.hunks) {
      const body = ph.lines.map((l) => (l.type === "add" ? `+${l.text}` : l.type === "del" ? `-${l.text}` : l.type === "meta" ? l.text : ` ${l.text}`)).join("\n");
      const mine = f.hunks.find((h) => h.lines.slice(1).join("\n") === body && h.staged === reverse);
      if (!mine) return refused(`error: patch failed: ${path}:${ph.oldStart}\nerror: ${path}: patch does not apply`);
      mine.staged = !reverse;
      if (f.kind === "untracked" && !reverse) f.kind = "added";
      if (f.kind === "added" && reverse && !f.hunks.some((h) => h.staged)) f.kind = "untracked";
    }
  }
  return json(status());
}

function commit(message: string): Response {
  if (!message.trim()) return problem(400, "invalid_git_request", "a commit message is required");
  if (state === "merging" && files.some((f) => f.conflict)) return refused("error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.");
  const staged = files.filter((f) => f.kind !== "untracked" && f.hunks.some((h) => h.staged));
  if (!staged.length) return refused(files.length ? 'no changes added to commit (use "git add" and/or "git commit -a")' : "nothing to commit, working tree clean");
  const [subject, ...rest] = message.trim().split("\n");
  const body = rest.join("\n").trim();
  const b = branches.find((x) => x.name === current)!;
  const parents = state === "merging" && mergeHead ? [b.hash, mergeHead] : [b.hash];
  const h = add(subject.trim(), parents, 0, body, 0);
  commits[commits.length - 1].time = new Date().toISOString();
  b.hash = h;
  state = "";
  mergeHead = undefined;
  for (const f of staged) {
    f.hunks = f.hunks.filter((x) => !x.staged);
    if (f.kind === "renamed" || f.kind === "added") f.kind = "modified";
  }
  files = files.filter((f) => f.hunks.length > 0);
  return json(withRefs(commits[commits.length - 1]));
}

function createBranch(name: string, from: string, checkout: boolean): Response {
  if (!validBranchName(name)) return problem(400, "invalid_git_request", "not a valid branch name");
  if (branches.some((b) => b.name === name)) return refused(`fatal: a branch named '${name}' already exists`);
  const start = resolve(from || "HEAD");
  if (!start) return refused(`fatal: not a valid object name: '${from}'`);
  branches.push({ name, hash: start });
  if (checkout) {
    const sw = switchTo(name);
    if (sw.status !== 200) return sw;
  }
  return json(branchList());
}

function switchTo(name: string): Response {
  if (!validBranchName(name)) return problem(400, "invalid_git_request", "not a valid branch name");
  const b = branches.find((x) => x.name === name);
  if (!b) return refused(`fatal: invalid reference: ${name}`);
  if (state === "merging") return refused("error: you need to resolve your current index first\nfatal: cannot switch branch while merging");
  // Like git: a switch that would overwrite local changes is refused with the file listed.
  const touched = touchedBetween(headHash(), b.hash);
  const clash = files.filter((f) => f.kind !== "untracked" && touched.includes(f.path));
  if (clash.length) return refused(`error: Your local changes to the following files would be overwritten by checkout:\n${clash.map((f) => `\t${f.path}`).join("\n")}\nPlease commit your changes or stash them before you switch branches.\nAborting`);
  current = name;
  return json(status());
}

/** What a branch's own commits change, for the merge preview and the switch refusal. */
function touchedBy(name: string): string[] {
  const b = branches.find((x) => x.name === name);
  if (!b) return [];
  const index = byHash();
  const head = reachable(headHash(), index);
  const own = [...reachable(b.hash, index)].filter((h) => !head.has(h)).map((h) => index.get(h)!);
  const paths = new Set<string>();
  for (const c of own) for (const p of filesOf(c)) paths.add(p);
  return [...paths].sort();
}

/** What differs between two commits: the files of the commits on either side only. */
function touchedBetween(a: string, b: string): string[] {
  const index = byHash();
  const ra = reachable(a, index);
  const rb = reachable(b, index);
  const paths = new Set<string>();
  for (const h of [...ra].filter((x) => !rb.has(x)).concat([...rb].filter((x) => !ra.has(x)))) for (const p of filesOf(index.get(h)!)) paths.add(p);
  return [...paths].sort();
}

/** The files a commit changed: named by its subject, so the sample history reads coherently. */
function filesOf(c: GitCommit): string[] {
  const s = c.subject.toLowerCase();
  if (s.startsWith("webhooks: outgoing")) return ["db/migrations/0005_webhook_deliveries.sql", "internal/webhooks/deliveries.go"];
  if (s.startsWith("webhooks: sign")) return ["internal/webhooks/sign.go", "internal/webhooks/sign_test.go"];
  if (s.includes("readme")) return ["README.md"];
  if (s.startsWith("auth:")) return ["internal/modules/auth/" + s.slice(6).split(" ")[0].replace(/[^a-z]/g, "") + ".go"];
  if (s.startsWith("jobs:")) return ["internal/jobs/" + s.slice(6).split(" ")[0].replace(/[^a-z]/g, "") + ".go"];
  if (s.startsWith("merge")) return [];
  return [`internal/app/${s.split(" ")[1]?.replace(/[^a-z]/g, "") || "app"}.go`];
}

function deleteBranch(name: string, force: boolean): Response {
  if (!validBranchName(name)) return problem(400, "invalid_git_request", "not a valid branch name");
  const b = branches.find((x) => x.name === name);
  if (!b) return refused(`error: branch '${name}' not found`);
  if (name === current) return refused(`error: cannot delete branch '${name}' used by worktree at '/Users/dev/src/fullsmoke'`);
  const merged = reachable(headHash()).has(b.hash);
  if (!merged && !force) return refused(`error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'`);
  branches = branches.filter((x) => x.name !== name);
  return json(branchList());
}

function preview(branch: string): Response {
  if (!validBranchName(branch)) return problem(400, "invalid_git_request", "not a valid branch name");
  const b = branches.find((x) => x.name === branch);
  if (!b) return refused(`fatal: ambiguous argument '${branch}': unknown revision or path not in the working tree.`);
  const own = log({ all: false, range: `HEAD..${branch}`, limit: 200, skip: 0 });
  if (own instanceof Response) return own;
  const p: GitMergePreview = { branch, commits: own, fast_forward: false, up_to_date: own.length === 0, conflicts: [], files: touchedBy(branch) };
  if (p.up_to_date) return json(p);
  p.fast_forward = reachable(b.hash).has(headHash());
  if (!p.fast_forward && p.files.includes("README.md")) p.conflicts = ["README.md"];
  return json(p);
}

let mergeHead: string | undefined;

function merge(branch: string): Response {
  const pv = preview(branch);
  if (pv.status !== 200) return pv;
  if (state === "merging") return refused("error: Merging is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nfatal: Exiting because of an unresolved conflict.");
  const b = branches.find((x) => x.name === branch)!;
  const cur = branches.find((x) => x.name === current)!;
  const touched = touchedBy(branch);
  const clash = files.filter((f) => f.kind !== "untracked" && touched.includes(f.path));
  if (clash.length) return refused(`error: Your local changes to the following files would be overwritten by merge:\n${clash.map((f) => `\t${f.path}`).join("\n")}\nPlease commit your changes or stash them before you merge.\nAborting`);
  const own = log({ all: false, range: `HEAD..${branch}`, limit: 200, skip: 0 }) as GitCommit[];
  if (!own.length) return json({ output: "Already up to date.\n" } satisfies GitRemoteResult);
  const fastForward = reachable(b.hash).has(cur.hash);
  const stat = touched.map((p) => ` ${p.padEnd(44)} | ${r.int(3, 40)} ${"+".repeat(r.int(1, 8))}`).join("\n");
  if (fastForward) {
    const from = cur.hash.slice(0, 7);
    cur.hash = b.hash;
    return json({ output: `Updating ${from}..${b.hash.slice(0, 7)}\nFast-forward\n${stat}\n ${touched.length} files changed, ${r.int(20, 200)} insertions(+)\n` } satisfies GitRemoteResult);
  }
  if (touched.includes("README.md")) {
    state = "merging";
    mergeHead = b.hash;
    files = files.filter((f) => f.path !== "README.md");
    files.push({
      path: "README.md",
      kind: "modified",
      conflict: true,
      hunks: [{ lines: ["@@@ -1,4 -1,4 +1,10 @@@", "  # fullsmoke", "  ", "++<<<<<<< HEAD", " +A gorbital app, generated with `orb new fullsmoke --preset full`.", "++=======", "+ A gorbital application.", `++>>>>>>> ${branch}`, "  ", "  ## Getting started"], staged: false }],
    });
    return json({ output: `Auto-merging README.md\nCONFLICT (content): Merge conflict in README.md\nAutomatic merge failed; fix conflicts and then commit the result.\n`, conflicts: ["README.md"] } satisfies GitRemoteResult);
  }
  const h = add(`Merge branch '${branch}'`, [cur.hash, b.hash], 0, "", 0);
  commits[commits.length - 1].time = new Date().toISOString();
  cur.hash = h;
  return json({ output: `Merge made by the 'ort' strategy.\n${stat}\n ${touched.length} files changed, ${r.int(20, 200)} insertions(+)\n` } satisfies GitRemoteResult);
}

function abortMerge(): Response {
  if (state !== "merging") return refused("fatal: There is no merge to abort (MERGE_HEAD missing).");
  state = "";
  mergeHead = undefined;
  files = files.filter((f) => !f.conflict);
  return json(status());
}

function push(): Response {
  const b = branches.find((x) => x.name === current)!;
  const st = status();
  if (!b.upstream) {
    b.upstream = `origin/${current}`;
    b.remoteHash = b.hash;
    return json({ output: `To github.com:acme/fullsmoke.git\n * [new branch]      ${current} -> ${current}\nbranch '${current}' set up to track 'origin/${current}'.\n` } satisfies GitRemoteResult);
  }
  if (st.behind > 0) return refused(`To github.com:acme/fullsmoke.git\n ! [rejected]        ${current} -> ${current} (fetch first)\nerror: failed to push some refs to 'github.com:acme/fullsmoke.git'\nhint: Updates were rejected because the remote contains work that you do not have locally.`);
  if (st.ahead === 0) return json({ output: "Everything up-to-date\n" } satisfies GitRemoteResult);
  const from = b.remoteHash!.slice(0, 7);
  b.remoteHash = b.hash;
  return json({ output: `To github.com:acme/fullsmoke.git\n   ${from}..${b.hash.slice(0, 7)}  ${current} -> ${current}\n` } satisfies GitRemoteResult);
}

/* ---------- The router ---------- */

function parseBody(init: RequestInit): Record<string, unknown> | null {
  if (typeof init.body !== "string" || init.body === "") return {};
  try {
    const v = JSON.parse(init.body) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

/** Answers `/_portal/api/git/*`; null for any other path. */
export function mockGitFetch(url: URL, method: string, init: RequestInit = {}): Response | null {
  const p = url.pathname;
  if (!p.startsWith("/_portal/api/git/")) return null;
  const rest = p.slice("/_portal/api/git/".length);
  const q = url.searchParams;
  const body = method === "POST" ? parseBody(init) : {};
  if (body === null) return problem(400, "invalid_body", "the body must be JSON");

  if (rest === "status" && method === "GET") return json(status());
  if (rest === "diff" && method === "GET") {
    const path = q.get("path") ?? "";
    if (badPath(path)) return problem(400, "invalid_git_request", "not a repository path");
    return json(diffOf(path, q.get("staged") === "true"));
  }
  if ((rest === "stage" || rest === "unstage" || rest === "discard") && method === "POST") {
    const paths = strings(body.paths);
    if (!paths || !paths.length) return problem(400, "invalid_git_request", "no paths");
    if (paths.some(badPath)) return problem(400, "invalid_git_request", "not a repository path");
    return rest === "stage" ? stage(paths) : rest === "unstage" ? unstage(paths) : discard(paths);
  }
  if (rest === "patch" && method === "POST") {
    if (typeof body.patch !== "string" || !body.patch.trim()) return problem(400, "invalid_git_request", "empty patch");
    return applyPatch(body.patch, body.reverse === true);
  }
  if (rest === "commit" && method === "POST") return commit(String(body.message ?? ""));
  if (rest === "branches" && method === "GET") return json(branchList());
  if (rest === "branches" && method === "POST") return createBranch(String(body.name ?? ""), String(body.from ?? ""), body.checkout === true);
  if (rest.startsWith("branches/") && method === "DELETE") return deleteBranch(decodeURIComponent(rest.slice("branches/".length)), q.get("force") === "true");
  if (rest === "switch" && method === "POST") return switchTo(String(body.name ?? ""));
  if (rest === "unmerged" && method === "GET") {
    const branch = q.get("branch") ?? "";
    if (!validBranchName(branch)) return problem(400, "invalid_git_request", "not a valid branch name");
    const list = log({ all: false, range: `HEAD..${branch}`, limit: 100, skip: 0 });
    return list instanceof Response ? list : json({ branch, commits: list });
  }
  if (rest === "fetch" && method === "POST") return json({ output: "Fetching origin\n" } satisfies GitRemoteResult);
  if (rest === "pull" && method === "POST") {
    const st = status();
    if (state === "merging") return refused("error: You have not concluded your merge (MERGE_HEAD exists).\nhint: Please, commit your changes before merging.\nfatal: Exiting because of unfinished merge.");
    if (!st.upstream) return refused(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.`);
    return json({ output: "Already up to date.\n" } satisfies GitRemoteResult);
  }
  if (rest === "push" && method === "POST") return push();
  if (rest === "merge/preview" && method === "GET") return preview(q.get("branch") ?? "");
  if (rest === "merge" && method === "POST") {
    const branch = String(body.branch ?? "");
    if (!validBranchName(branch)) return problem(400, "invalid_git_request", "not a valid branch name");
    return merge(branch);
  }
  if (rest === "merge/abort" && method === "POST") return abortMerge();
  if (rest === "conflicts" && method === "GET") return json({ files: files.filter((f) => f.conflict).map((f) => f.path) });
  if (rest === "log" && method === "GET") {
    const limit = Math.min(Math.max(Number(q.get("limit")) || 100, 1), 1000);
    const skip = Math.max(Number(q.get("skip")) || 0, 0);
    const range = q.get("range") ?? "";
    if (range.startsWith("-")) return problem(400, "invalid_git_request", "not a revision range");
    const list = log({ all: q.get("all") === "true", range, limit, skip });
    return list instanceof Response ? list : json({ commits: list });
  }
  if (rest === "open" && method === "POST") {
    const path = String(body.path ?? "");
    if (badPath(path)) return problem(400, "invalid_path", "not a repository path");
    seq++;
    return new Response(null, { status: 204 });
  }
  return problem(404, "not_found", `no portal endpoint ${method} ${p}`);
}

/** Back to the first state; `resetMock` calls it. */
export function resetMockGit() {
  buildHistory();
  buildTree();
  mergeHead = undefined;
  seq = 0;
}

/** How many files were opened in the editor (for tests). */
export const mockGitOpened = () => seq;

resetMockGit();
