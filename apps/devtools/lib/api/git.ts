"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { queryString, retry } from "./queries";

/*
 * The Git screen's data layer (ADR-0076): orb dev runs the developer's git
 * in the app directory and serves it under /_portal/api/git/. The shapes
 * match cli/internal/portal/git.go field for field.
 */

/* ---------- Types ---------- */

/** One changed path (`GitFile`): git's two status letters and what they mean. */
export type GitFile = {
  path: string;
  /** Set for renames. */
  old_path?: string;
  /** Index and worktree letters (M, A, D, R, ?, U, `.` for none). */
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflict: boolean;
};

/** `GET git/status`: the repository at a glance. */
export type GitStatus = {
  /** The branch, or the short hash when detached. */
  branch: string;
  detached: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  /** merging, rebasing, cherry-picking, reverting, or absent. */
  state?: string;
  head: string;
  remote?: string;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
};

/** `GET git/diff?path=&staged=`: one file's unified diff. */
export type GitDiff = {
  path: string;
  staged: boolean;
  patch: string;
  binary: boolean;
  /** Shown whole, as an addition. */
  untracked: boolean;
  additions: number;
  deletions: number;
};

export type GitCommit = {
  hash: string;
  short: string;
  parents: string[];
  author: string;
  email: string;
  time: string;
  subject: string;
  body?: string;
  /** Branch and tag names on the commit (`HEAD -> ` stripped). */
  refs: string[];
};

export type GitBranch = {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  head: string;
  subject: string;
  /** Merged into the current branch: deleting it loses nothing. */
  merged: boolean;
};

export type GitBranches = { branches: GitBranch[]; remote: string[] };

/** Fetch, pull, push and merge: git's output, and the files a pull or merge left conflicted. */
export type GitRemoteResult = { output: string; conflicts?: string[] };

export type GitMergePreview = {
  branch: string;
  /** The branch's commits not on HEAD. */
  commits: GitCommit[];
  fast_forward: boolean;
  up_to_date: boolean;
  conflicts: string[];
  files: string[];
};

export type GitUnmerged = { branch: string; commits: GitCommit[] };
export type GitConflicts = { files: string[] };
export type GitLog = { commits: GitCommit[] };

export type GitLogQuery = { all?: boolean; range?: string; path?: string; limit?: number };

/* ---------- Keys ---------- */

const base = "/_portal/api/git";

export const gitKeys = {
  all: ["git"] as const,
  status: ["git", "status"] as const,
  diff: (path: string, staged: boolean) => ["git", "diff", path, staged] as const,
  branches: ["git", "branches"] as const,
  log: (q: GitLogQuery) => ["git", "log", q.all ?? false, q.range ?? "", q.path ?? "", q.limit ?? 50] as const,
  preview: (branch: string) => ["git", "merge", "preview", branch] as const,
  unmerged: (branch: string) => ["git", "unmerged", branch] as const,
  conflicts: ["git", "conflicts"] as const,
};

/** The portal says the directory holds no repository (404 `not_a_repository`), or this orb dev runs no git (404 `no_git`). */
export function isNoRepository(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 404 && (err.code === "not_a_repository" || err.code === "no_git");
}

/** git refused (409 `git_refused`): its own message is the detail, shown verbatim. */
export function isGitRefused(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === "git_refused";
}

/** Every git query is stale after any action: the status, the branches, the log, the diffs. */
export function invalidateGit(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: gitKeys.all });
}

/** Before a write: a status poll in flight would land after the answer and show the old state for a moment. */
function settle(qc: QueryClient) {
  return qc.cancelQueries({ queryKey: gitKeys.all });
}

/* ---------- Queries ---------- */

/** `GET git/status`, every 5 s while the tab is visible; refetched after every action. */
export function useGitStatus(enabled = true) {
  return useQuery({
    queryKey: gitKeys.status,
    queryFn: () => apiFetch<GitStatus>(`${base}/status`),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 2000,
    enabled,
    retry,
  });
}

/** `GET git/diff?path=&staged=`: the worktree against the index, or with `staged` the index against HEAD. */
export function useGitDiff(path: string | undefined, staged: boolean) {
  return useQuery({
    queryKey: gitKeys.diff(path ?? "", staged),
    queryFn: () => apiFetch<GitDiff>(`${base}/diff${queryString({ path, staged: staged ? "true" : "false" })}`),
    enabled: Boolean(path),
    retry,
  });
}

/** `GET git/branches`: local branches with upstream and ahead/behind, and remote branch names. Every 15 s, and whenever the status sees HEAD move. */
export function useGitBranches(enabled = true) {
  return useQuery({
    queryKey: gitKeys.branches,
    queryFn: () => apiFetch<GitBranches>(`${base}/branches`),
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/** `GET git/log?all=&range=&path=&limit=&skip=`, `limit` a page; `fetchNextPage` skips what is loaded. */
export function useGitLog(q: GitLogQuery, enabled = true) {
  const limit = q.limit ?? 50;
  return useInfiniteQuery({
    queryKey: gitKeys.log({ ...q, limit }),
    queryFn: ({ pageParam }) => apiFetch<GitLog>(`${base}/log${queryString({ all: q.all ? "true" : undefined, range: q.range, path: q.path, limit, skip: pageParam || undefined })}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.commits.length < limit ? undefined : pages.reduce((n, p) => n + p.commits.length, 0)),
    enabled,
    retry,
  });
}

/** `GET git/merge/preview?branch=`: what merging `branch` into HEAD would do, without touching the tree. */
export function useMergePreview(branch: string | undefined) {
  return useQuery({
    queryKey: gitKeys.preview(branch ?? ""),
    queryFn: () => apiFetch<GitMergePreview>(`${base}/merge/preview${queryString({ branch })}`),
    enabled: Boolean(branch),
    staleTime: 0,
    retry,
  });
}

/** `GET git/unmerged?branch=`: the commits deleting `branch` would lose. */
export function useUnmergedCommits(branch: string | undefined) {
  return useQuery({
    queryKey: gitKeys.unmerged(branch ?? ""),
    queryFn: () => apiFetch<GitUnmerged>(`${base}/unmerged${queryString({ branch })}`),
    enabled: Boolean(branch),
    staleTime: 0,
    retry,
  });
}

/** `GET git/conflicts`: the conflicted files, while a merge or a pull is in progress. */
export function useGitConflicts(enabled: boolean) {
  return useQuery({
    queryKey: gitKeys.conflicts,
    queryFn: () => apiFetch<GitConflicts>(`${base}/conflicts`),
    enabled,
    refetchInterval: 5000,
    retry,
  });
}

/* ---------- Mutations ---------- */

type PathsAction = "stage" | "unstage" | "discard";

/** `POST git/stage|unstage|discard {paths}`; the answer is the new status, written into the query. */
export function useGitPaths(action: PathsAction) {
  const qc = useQueryClient();
  const verb = { stage: "Staged", unstage: "Unstaged", discard: "Discarded" }[action];
  return useMutation({
    mutationFn: (paths: string[]) => apiFetch<GitStatus>(`${base}/${action}`, { method: "POST", json: { paths } }),
    onMutate: () => settle(qc),
    onSuccess: (status, paths) => {
      qc.setQueryData(gitKeys.status, status);
      if (action === "discard") toast.success(`${verb} ${paths.length === 1 ? paths[0] : `${paths.length} files`}`);
    },
    onError: (err, paths) => toast.error(`Couldn't ${action} ${paths.length === 1 ? paths[0] : `${paths.length} files`}`, { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/patch {patch, reverse}`: stages one hunk (`git apply --cached`), or with `reverse` unstages it. */
export function useGitPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { patch: string; reverse: boolean }) => apiFetch<GitStatus>(`${base}/patch`, { method: "POST", json: body }),
    onMutate: () => settle(qc),
    onSuccess: (status) => qc.setQueryData(gitKeys.status, status),
    onError: (err, { reverse }) => toast.error(reverse ? "Couldn't unstage the hunk" : "Couldn't stage the hunk", { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/commit {message}`: records the index; answers the new commit. */
export function useGitCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => apiFetch<GitCommit>(`${base}/commit`, { method: "POST", json: { message } }),
    onMutate: () => settle(qc),
    onSuccess: (c) => toast.success(`Committed ${c.short}`, { description: c.subject }),
    onError: (err) => toast.error("Couldn't commit", { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/branches {name, from, checkout}`; answers the branch list. */
export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; from: string; checkout: boolean }) => apiFetch<GitBranches>(`${base}/branches`, { method: "POST", json: body }),
    onMutate: () => settle(qc),
    onSuccess: (branches, { name, checkout }) => {
      qc.setQueryData(gitKeys.branches, branches);
      toast.success(checkout ? `Created and switched to ${name}` : `Created ${name}`);
    },
    onError: (err, { name }) => toast.error(`Couldn't create ${name}`, { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/switch {name}`: git refuses when local changes would be lost, and says so. */
export function useSwitchBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<GitStatus>(`${base}/switch`, { method: "POST", json: { name } }),
    onMutate: () => settle(qc),
    onSuccess: (status, name) => {
      qc.setQueryData(gitKeys.status, status);
      toast.success(`Switched to ${name}`);
    },
    onError: (err, name) => toast.error(`Couldn't switch to ${name}`, { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `DELETE git/branches/{name}?force=`: `-d`, or `-D` once the unmerged commits were shown. */
export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, force }: { name: string; force: boolean }) => apiFetch<GitBranches>(`${base}/branches/${name.split("/").map(encodeURIComponent).join("/")}${force ? "?force=true" : ""}`, { method: "DELETE" }),
    onMutate: () => settle(qc),
    onSuccess: (branches, { name }) => {
      qc.setQueryData(gitKeys.branches, branches);
      toast.success(`Deleted ${name}`);
    },
    onError: (err, { name }) => toast.error(`Couldn't delete ${name}`, { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

export type RemoteAction = "fetch" | "pull" | "push";

/** `POST git/fetch|pull|push` (no body): git's output, and a pull's conflicts. The sheet shows the outcome; a refusal is the sheet's too. */
export function useRemoteAction(action: RemoteAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<GitRemoteResult>(`${base}/${action}`, { method: "POST" }),
    onMutate: () => settle(qc),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/merge {branch}`: a fast-forward or a merge commit; conflicts stay in the tree and are listed. */
export function useGitMerge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) => apiFetch<GitRemoteResult>(`${base}/merge`, { method: "POST", json: { branch } }),
    onMutate: () => settle(qc),
    onSuccess: (res, branch) => {
      if (res.conflicts?.length) toast.warning(`Merging ${branch} left ${res.conflicts.length} conflict${res.conflicts.length === 1 ? "" : "s"}`, { description: "resolve them in the editor, or abort the merge" });
      else toast.success(`Merged ${branch}`);
    },
    onError: (err, branch) => toast.error(`Couldn't merge ${branch}`, { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/merge/abort`: back to before the conflicted merge; the commits stay. */
export function useAbortMerge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<GitStatus>(`${base}/merge/abort`, { method: "POST" }),
    onMutate: () => settle(qc),
    onSuccess: (status) => {
      qc.setQueryData(gitKeys.status, status);
      toast.success("Merge aborted", { description: "the working tree is back to before the merge" });
    },
    onError: (err) => toast.error("Couldn't abort the merge", { description: errorMessage(err) }),
    onSettled: () => invalidateGit(qc),
  });
}

/** `POST git/open {path, line}` (204): the developer's editor. 404 `no_editor` and 502 `editor_failed` become toasts. */
export function useOpenInEditor() {
  return useMutation({
    mutationFn: (body: { path: string; line?: number }) => apiFetch<void>(`${base}/open`, { method: "POST", json: { path: body.path, line: body.line ?? 0 } }),
    onSuccess: (_, { path }) => toast.success(`Opened ${path}`, { description: "in your editor (ORB_EDITOR, VISUAL, code, or the system opener)" }),
    onError: (err, { path }) => toast.error(`Couldn't open ${path}`, { description: errorMessage(err) }),
  });
}
