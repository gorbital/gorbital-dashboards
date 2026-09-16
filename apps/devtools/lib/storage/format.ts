/** Sizes, dates and content types as the Storage screen shows them. */

/** `0 B`, `14 B`, `1.2 KB`, `3.4 MB`, `12 GB`: binary units, one decimal under 10. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(b) : b < 10 ? b.toFixed(1) : Math.round(b)} ${units[i]}`;
}

/** `1,234 bytes`, for the metadata line next to the rounded size. */
export function formatBytes(bytes: number): string {
  return `${new Intl.NumberFormat("en-US").format(Math.round(bytes))} ${bytes === 1 ? "byte" : "bytes"}`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** `15 Sep 2026 14:32` in local time; `—` for anything unparseable. `now` is the year it may omit. */
export function formatModified(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${months[d.getMonth()]}${year} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "in 14m", "in 1h", "in 7d", "expired": how long a signed URL still works. */
export function formatExpiry(expiresAt: string, now: number = Date.now()): string {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return "—";
  const s = Math.round((t - now) / 1000);
  if (s <= 0) return "expired";
  if (s < 60) return `in ${s}s`;
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  if (s < 86_400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86_400)}d`;
}

export type PreviewKind = "image" | "pdf" | "text" | "other";

/** What the preview pane can show for a content type (and the key's extension when the type says nothing). */
export function previewKind(contentType: string | undefined, key = ""): PreviewKind {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const ext = extensionOf(key);
  if (type.startsWith("image/") && type !== "image/vnd.adobe.photoshop") return "image";
  if (type === "application/pdf" || (!type && ext === "pdf")) return "pdf";
  if (type.startsWith("text/")) return "text";
  if (textTypes.has(type) || type.endsWith("+json") || type.endsWith("+xml")) return "text";
  if ((!type || type === "application/octet-stream") && imageExtensions.has(ext)) return "image";
  if ((!type || type === "application/octet-stream") && textExtensions.has(ext)) return "text";
  return "other";
}

const textTypes = new Set(["application/json", "application/xml", "application/javascript", "application/x-yaml", "application/yaml", "application/toml", "application/sql", "application/x-sh", "application/x-ndjson"]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
const textExtensions = new Set(["txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "toml", "xml", "html", "htm", "css", "js", "ts", "go", "sql", "log", "env", "ini", "sh"]);

/** The bytes of a text preview: the first 64 KiB. */
export const TEXT_PREVIEW_LIMIT = 64 * 1024;

/** The lower-case extension without the dot, or "". */
export function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

const byExtension: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  go: "text/plain",
  sql: "application/sql",
  log: "text/plain",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

/** The Content-Type an upload sends: the browser's for the file, else by extension, else octet-stream (the app decides by extension then too). */
export function contentTypeFor(name: string, browserType?: string): string {
  if (browserType) return browserType;
  return byExtension[extensionOf(name)] ?? "application/octet-stream";
}

/** A short label for the type column: `png`, `pdf`, `json`, `text`, `folder`… */
export function shortType(contentType: string, key = ""): string {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!type || type === "application/octet-stream") return extensionOf(key) || "binary";
  const sub = type.slice(type.indexOf("/") + 1);
  if (sub === "plain") return "text";
  if (sub === "svg+xml") return "svg";
  if (sub === "jpeg") return "jpg";
  if (sub.startsWith("x-")) return sub.slice(2);
  if (sub.startsWith("vnd.")) return extensionOf(key) || sub;
  return sub;
}
