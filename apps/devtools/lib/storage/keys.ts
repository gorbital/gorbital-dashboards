/**
 * Object keys and prefixes as `modules/storage` (ADR-0075) defines them:
 * a key is 1 to 1024 characters of path segments, none empty, `.` or `..`,
 * no leading slash, no control characters; a prefix is empty or a key with
 * an optional trailing slash. Object stores have no directories: a folder
 * is a prefix ending in a slash, folded out of the keys under it.
 */

export const MAX_KEY_LENGTH = 1024;

/** The hidden object that makes an empty folder exist (`storage.DirectoryMarker`). */
export const DIRECTORY_MARKER = ".keep";

/** Mirrors `storage.ValidKey`. */
export function validKey(key: string): boolean {
  return keyError(key) === undefined;
}

/** Why a key is refused, in the tone of the 422 the app answers; `undefined` when it's fine. */
export function keyError(key: string): string | undefined {
  if (key === "") return "a key can't be empty";
  if (new TextEncoder().encode(key).length > MAX_KEY_LENGTH) return `a key is at most ${MAX_KEY_LENGTH} bytes`;
  if (key.startsWith("/")) return "a key can't start with a slash";
  for (const ch of key) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) return "a key can't contain control characters";
    if (c === 0xfffd) return "a key must be valid UTF-8";
  }
  for (const seg of key.split("/")) {
    if (seg === "") return key.endsWith("/") ? "a key can't end with a slash" : "a key can't contain an empty segment (//)";
    if (seg === "." || seg === "..") return `a key can't contain a "${seg}" segment`;
  }
  return undefined;
}

/** Mirrors `storage.ValidPrefix`: empty, or a valid key optionally ending with a slash. */
export function validPrefix(prefix: string): boolean {
  if (prefix === "") return true;
  return validKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
}

/** A folder prefix in canonical form: no leading slashes, no doubled slashes, one trailing slash (or empty for the root). */
export function normalizePrefix(input: string): string {
  const parts = input.split("/").filter((s) => s !== "");
  return parts.length ? `${parts.join("/")}/` : "";
}

/** `images/2026/` → the root plus one crumb per folder: `[{name:"images",prefix:"images/"},{name:"2026",prefix:"images/2026/"}]`. */
export function breadcrumbs(prefix: string): { name: string; prefix: string }[] {
  const out: { name: string; prefix: string }[] = [];
  let acc = "";
  for (const seg of normalizePrefix(prefix).split("/").filter(Boolean)) {
    acc += `${seg}/`;
    out.push({ name: seg, prefix: acc });
  }
  return out;
}

/** Every prefix from the root down to `prefix`, for the column view: `["", "images/", "images/2026/"]`. */
export function ancestors(prefix: string): string[] {
  return ["", ...breadcrumbs(prefix).map((c) => c.prefix)];
}

/** The folder a key or a folder prefix lives in: `images/a.png` → `images/`, `images/2026/` → `images/`, `a.png` → ``. */
export function parentPrefix(keyOrPrefix: string): string {
  const trimmed = keyOrPrefix.endsWith("/") ? keyOrPrefix.slice(0, -1) : keyOrPrefix;
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? "" : trimmed.slice(0, i + 1);
}

/** The last segment of a key or a folder prefix: `images/a.png` → `a.png`, `images/2026/` → `2026`. */
export function baseName(keyOrPrefix: string): string {
  const trimmed = keyOrPrefix.endsWith("/") ? keyOrPrefix.slice(0, -1) : keyOrPrefix;
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}

/** `prefix + name`, with the prefix normalised and the name's own slashes kept (so `a/b` nests). */
export function joinKey(prefix: string, name: string): string {
  return `${normalizePrefix(prefix)}${name.replace(/^\/+/, "")}`;
}

/** `storage.IsDirectoryMarker`: the `.keep` object listings hide. */
export function isDirectoryMarker(key: string): boolean {
  return key === DIRECTORY_MARKER || key.endsWith(`/${DIRECTORY_MARKER}`);
}

/**
 * The key a rename moves to: the same folder, the new name. A name with a
 * slash moves into a subfolder; a name starting with `/` is refused by
 * `keyError` on the result.
 */
export function moveTarget(key: string, newName: string): string {
  return `${parentPrefix(key)}${newName}`;
}

/** Whether `target` is a rename (same folder) rather than a move. */
export function isRename(key: string, target: string): boolean {
  return parentPrefix(key) === parentPrefix(target) && key !== target;
}
