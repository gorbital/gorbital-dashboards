/** What the portal accepts as a snippet name (portal/sqlstore.go: `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`). */
const pattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export const SNIPPET_NAME_MAX = 80;

/** Why a name won't do, or undefined when it will. */
export function snippetNameError(name: string): string | undefined {
  if (!name) return "A name is needed.";
  if (name.length > SNIPPET_NAME_MAX) return `At most ${SNIPPET_NAME_MAX} characters.`;
  if (!/^[A-Za-z0-9]/.test(name)) return "Start with a letter or a digit.";
  if (!pattern.test(name)) return "Letters, digits, hyphens and underscores only.";
  return undefined;
}

export const isValidSnippetName = (name: string) => snippetNameError(name) === undefined;

/** A name suggestion from the script: its first words, slugified; "query" when nothing usable. */
export function suggestSnippetName(sql: string): string {
  const firstLine = sql
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("--"));
  const words = (firstLine ?? "")
    .replace(/[^A-Za-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .toLowerCase();
  const name = words.replace(/^[^a-z0-9]+/, "").slice(0, SNIPPET_NAME_MAX);
  return isValidSnippetName(name) ? name : "query";
}

/** The migration name the server will derive (lower-case, non-alphanumerics to underscores, at most 60). */
export function migrationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
