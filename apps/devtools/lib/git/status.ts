/**
 * The Changes tab's two lists from `GitStatus.files`: what is staged (the
 * index letter) and what is not (the worktree letter, untracked files and
 * conflicts). A file with both is in both lists, as `git status` shows it.
 */

export type StatusFile = {
  path: string;
  old_path?: string;
  index: string;
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflict: boolean;
};

export type ChangeKind = "M" | "A" | "D" | "R" | "C" | "T" | "U" | "?" | "!";

export type ChangeEntry = {
  file: StatusFile;
  /** Which side of the index this entry shows. */
  side: "staged" | "unstaged";
  /** The status letter for this side. */
  letter: string;
};

/** The staged list and the changes list (worktree changes, untracked, conflicts). */
export function splitFiles(files: StatusFile[]): { staged: ChangeEntry[]; changes: ChangeEntry[] } {
  const staged: ChangeEntry[] = [];
  const changes: ChangeEntry[] = [];
  for (const file of files) {
    if (file.conflict) {
      changes.push({ file, side: "unstaged", letter: "U" });
      continue;
    }
    if (file.untracked) {
      changes.push({ file, side: "unstaged", letter: "?" });
      continue;
    }
    if (file.staged) staged.push({ file, side: "staged", letter: file.index });
    if (file.unstaged) changes.push({ file, side: "unstaged", letter: file.worktree });
  }
  // Bytewise, as git orders paths.
  const byPath = (a: ChangeEntry, b: ChangeEntry) => (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0);
  return { staged: staged.sort(byPath), changes: changes.sort(byPath) };
}

/** What a status letter means, for tooltips. */
export function describeLetter(letter: string): string {
  return (
    {
      M: "modified",
      A: "added",
      D: "deleted",
      R: "renamed",
      C: "copied",
      T: "type changed",
      U: "conflict",
      "?": "untracked",
      "!": "ignored",
    }[letter] ?? letter
  );
}

/** The badge tone for a status letter. */
export function letterTone(letter: string): "ok" | "warn" | "danger" | "info" | "muted" | "violet" {
  switch (letter) {
    case "A":
    case "?":
      return "ok";
    case "D":
      return "danger";
    case "U":
      return "danger";
    case "R":
    case "C":
      return "violet";
    case "M":
    case "T":
      return "warn";
    default:
      return "muted";
  }
}

/** "merging", "rebasing"… as a label, or undefined when nothing is in progress. */
export function describeState(state: string | undefined): string | undefined {
  if (!state) return undefined;
  return `${state}…`;
}

/** "3 staged · 2 changed · 1 untracked · 1 conflict", omitting zeros; "clean" when nothing. */
export function describeCounts(s: { staged: number; unstaged: number; untracked: number; conflicts: number }): string {
  const parts: string[] = [];
  if (s.staged) parts.push(`${s.staged} staged`);
  if (s.unstaged) parts.push(`${s.unstaged} changed`);
  if (s.untracked) parts.push(`${s.untracked} untracked`);
  if (s.conflicts) parts.push(`${s.conflicts} conflict${s.conflicts === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "clean";
}
