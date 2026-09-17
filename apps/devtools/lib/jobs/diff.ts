/**
 * A line diff for the generator's plan preview: `before` against `content`
 * for a modified file, folded into hunks with a little context, the way
 * `git diff` shows it. Small and dependency-free; the files it compares are
 * a few hundred lines at most.
 */

export type DiffLine = { type: "same" | "add" | "del"; text: string; oldNo?: number; newNo?: number };

export type DiffHunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };

function splitLines(s: string): string[] {
  if (s === "") return [];
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Every line of both files, in order, marked same, add or del (an LCS on lines). */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  // Trim the common prefix and suffix first so the table stays small for the usual one-line insert.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ type: "same", text: a[i], oldNo: i + 1, newNo: i + 1 });
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  // LCS table over the middle.
  const n = midA.length;
  const m = midB.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      out.push({ type: "same", text: midA[i], oldNo: start + i + 1, newNo: start + j + 1 });
      i++;
      j++;
    } else if (j < m && (i >= n || table[i][j + 1] > table[i + 1][j])) {
      // On a tie, deletions come first, as git prints them.
      out.push({ type: "add", text: midB[j], newNo: start + j + 1 });
      j++;
    } else {
      out.push({ type: "del", text: midA[i], oldNo: start + i + 1 });
      i++;
    }
  }
  const tail = a.length - endA;
  for (let k = 0; k < tail; k++) out.push({ type: "same", text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 });
  return out;
}

/** Folds a diff into hunks: every change with `context` unchanged lines around it; nothing when the files are equal. */
export function diffHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const changed = lines.map((l) => l.type !== "same");
  if (!changed.some(Boolean)) return [];
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!changed[i]) continue;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  }
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!keep[i]) {
      i++;
      continue;
    }
    const startIdx = i;
    while (i < lines.length && keep[i]) i++;
    const slice = lines.slice(startIdx, i);
    const first = slice[0];
    const oldStart = first.oldNo ?? nextNo(slice, "oldNo") ?? 1;
    const newStart = first.newNo ?? nextNo(slice, "newNo") ?? 1;
    hunks.push({
      oldStart,
      oldLines: slice.filter((l) => l.type !== "add").length,
      newStart,
      newLines: slice.filter((l) => l.type !== "del").length,
      lines: slice,
    });
  }
  return hunks;
}

function nextNo(lines: DiffLine[], key: "oldNo" | "newNo"): number | undefined {
  for (const l of lines) if (l[key] !== undefined) return l[key];
  return undefined;
}

/** The unified-diff text, for copying. */
export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  const hunks = diffHunks(lineDiff(before, after), context);
  if (!hunks.length) return "";
  const out = [`--- a/${path}`, `+++ b/${path}`];
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) out.push(`${l.type === "add" ? "+" : l.type === "del" ? "-" : " "}${l.text}`);
  }
  return out.join("\n") + "\n";
}

/** How many lines a diff adds and removes. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((l) => l.type === "add").length, removed: lines.filter((l) => l.type === "del").length };
}
