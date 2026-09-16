/**
 * A unified diff, as `git diff` prints it, parsed into files, hunks and
 * lines with their old and new line numbers, and rebuilt one hunk at a
 * time for `POST git/patch` (`git apply --cached --recount --unidiff-zero`).
 * Dependency-free; the diffs it reads are one file at a time.
 */

export type DiffLineType = "same" | "add" | "del" | "meta";

export type DiffLine = {
  type: DiffLineType;
  /** The line without its first character; a `meta` line keeps the whole text (`\ No newline at end of file`). */
  text: string;
  oldNo?: number;
  newNo?: number;
};

export type DiffHunk = {
  /** The `@@ … @@` line as printed, with the section heading git appends. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  additions: number;
  deletions: number;
};

export type DiffFile = {
  /** Paths from the `---`/`+++` lines without the `a/`/`b/` prefix; `/dev/null` for a created or deleted file. */
  oldPath: string;
  newPath: string;
  /** Everything before the first hunk: `diff --git`, `index`, `new file mode`, `rename from`, `---`, `+++`. */
  header: string[];
  hunks: DiffHunk[];
  /** `Binary files … differ` or a `GIT binary patch`: no hunks to show. */
  binary: boolean;
  /** A `rename from`/`rename to` header. */
  renamed: boolean;
  /** A `new file mode` header. */
  created: boolean;
  /** A `deleted file mode` header. */
  deleted: boolean;
};

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function stripPrefix(p: string): string {
  if (p === "/dev/null") return p;
  return p.replace(/^[ab]\//, "");
}

/** Every file of a unified diff. A patch without hunks (binary, mode-only) gives a file with none. */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldNo = 0;
  let newNo = 0;
  const startFile = () => {
    file = { oldPath: "", newPath: "", header: [], hunks: [], binary: false, renamed: false, created: false, deleted: false };
    files.push(file);
    hunk = undefined;
  };
  for (const raw of lines) {
    if (raw.startsWith("diff --git ")) startFile();
    else if (!file) startFile(); // a patch without the `diff --git` line: `---` comes first
    const m = hunkHeader.exec(raw);
    if (m) {
      if (!file) startFile();
      hunk = {
        header: raw,
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        lines: [],
        additions: 0,
        deletions: 0,
      };
      oldNo = hunk.oldStart;
      newNo = hunk.newStart;
      file!.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      const f = file!;
      f.header.push(raw);
      if (raw.startsWith("--- ")) f.oldPath = stripPrefix(raw.slice(4).replace(/\t.*$/, ""));
      else if (raw.startsWith("+++ ")) f.newPath = stripPrefix(raw.slice(4).replace(/\t.*$/, ""));
      else if (raw.startsWith("rename from ")) f.renamed = true;
      else if (raw.startsWith("new file mode")) f.created = true;
      else if (raw.startsWith("deleted file mode")) f.deleted = true;
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) f.binary = true;
      if (!f.oldPath && !f.newPath && raw.startsWith("diff --git ")) {
        const paths = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
        if (paths) {
          f.oldPath = paths[1];
          f.newPath = paths[2];
        }
      }
      continue;
    }
    const c = raw[0];
    if (c === "+") {
      hunk.lines.push({ type: "add", text: raw.slice(1), newNo: newNo++ });
      hunk.additions++;
    } else if (c === "-") {
      hunk.lines.push({ type: "del", text: raw.slice(1), oldNo: oldNo++ });
      hunk.deletions++;
    } else if (c === "\\") {
      hunk.lines.push({ type: "meta", text: raw });
    } else {
      // A context line; an empty line means a blank context line (git prints a single space, some tools strip it).
      hunk.lines.push({ type: "same", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return files;
}

/** The path a diff is about: the new one, or the old one for a deletion. */
export function diffPath(file: DiffFile): string {
  return file.newPath && file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
}

/** The `---`/`+++` pair a hunk patch needs, from the file's header (the `diff --git` and `index` lines are kept too; `git apply` reads them). */
export function fileHeader(file: DiffFile): string[] {
  return file.header;
}

/** One hunk's lines, as printed. */
export function hunkText(hunk: DiffHunk): string {
  return [hunk.header, ...hunk.lines.map((l) => (l.type === "add" ? `+${l.text}` : l.type === "del" ? `-${l.text}` : l.type === "meta" ? l.text : ` ${l.text}`))].join("\n") + "\n";
}

/**
 * The patch that stages this one hunk: the file's header lines and the
 * hunk, ending in a newline. The backend passes `--recount`, so the counts
 * needn't be recomputed when a hunk is applied on its own.
 */
export function hunkPatch(file: DiffFile, hunk: DiffHunk): string {
  return fileHeader(file).join("\n") + "\n" + hunkText(hunk);
}

/**
 * The same hunk with additions and deletions swapped and the paths
 * exchanged, so applying it forward undoes the hunk (what `git apply -R`
 * does; the API takes `reverse: true` instead, this is for tests and
 * copies).
 */
export function hunkPatchReversed(file: DiffFile, hunk: DiffHunk): string {
  const header = fileHeader(file).map((l) => {
    if (l.startsWith("--- ")) return `+++ ${l.slice(4)}`;
    if (l.startsWith("+++ ")) return `--- ${l.slice(4)}`;
    if (l.startsWith("new file mode")) return `deleted file mode${l.slice("new file mode".length)}`;
    if (l.startsWith("deleted file mode")) return `new file mode${l.slice("deleted file mode".length)}`;
    return l;
  });
  // The --- line must precede +++: swap their positions too.
  const minus = header.findIndex((l) => l.startsWith("--- "));
  const plus = header.findIndex((l) => l.startsWith("+++ "));
  if (minus > plus && plus >= 0) [header[minus], header[plus]] = [header[plus], header[minus]];
  const lines = hunk.lines.map((l) => (l.type === "add" ? `-${l.text}` : l.type === "del" ? `+${l.text}` : l.type === "meta" ? l.text : ` ${l.text}`));
  const h = `@@ -${hunk.newStart},${hunk.newLines} +${hunk.oldStart},${hunk.oldLines} @@${hunk.header.replace(hunkHeader, "$5")}`;
  return header.join("\n") + "\n" + [h, ...lines].join("\n") + "\n";
}

/** Added and removed lines over every hunk of a file. */
export function diffStat(file: DiffFile | undefined): { additions: number; deletions: number } {
  if (!file) return { additions: 0, deletions: 0 };
  return file.hunks.reduce((s, h) => ({ additions: s.additions + h.additions, deletions: s.deletions + h.deletions }), { additions: 0, deletions: 0 });
}

/** "3 additions and 1 deletion" for confirmations. */
export function describeStat(additions: number, deletions: number): string {
  const a = `${additions} addition${additions === 1 ? "" : "s"}`;
  const d = `${deletions} deletion${deletions === 1 ? "" : "s"}`;
  return `${a} and ${d}`;
}
