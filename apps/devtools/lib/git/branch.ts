/**
 * Branch names as the backend accepts them (`ValidBranchName` in
 * cli/internal/portal/git.go): the pattern, no `..`, no trailing `/` or
 * `.lock`, no `//`. git's own `check-ref-format` has the last word.
 */

const pattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

/** True when the backend's pattern accepts `name`. */
export function validBranchName(name: string): boolean {
  return pattern.test(name) && !name.includes("..") && !name.endsWith("/") && !name.endsWith(".lock") && !name.includes("//");
}

/** Why a name is refused, in a sentence, or undefined when it's fine. An empty name is "required". */
export function branchNameError(name: string): string | undefined {
  if (name === "") return "A name is required.";
  if (/\s/.test(name)) return "No spaces: use - or _.";
  if (!/^[A-Za-z0-9]/.test(name)) return "Start with a letter or a digit.";
  if (name.length > 200) return "At most 200 characters.";
  if (name.includes("..")) return "No “..” in a branch name.";
  if (name.includes("//")) return "No empty path segment (“//”).";
  if (name.endsWith("/")) return "Can't end with “/”.";
  if (name.endsWith(".lock")) return "Can't end with “.lock”.";
  if (!pattern.test(name)) return "Only letters, digits, “.”, “_”, “-” and “/”.";
  return undefined;
}

/** `origin/feature/x` → `feature/x`; a local name stays. */
export function localName(remoteBranch: string, remotes: string[] = ["origin"]): string {
  for (const r of remotes) if (remoteBranch.startsWith(`${r}/`)) return remoteBranch.slice(r.length + 1);
  return remoteBranch;
}
