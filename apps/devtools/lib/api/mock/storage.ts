/**
 * File storage in memory (ADR-0075): a bucket with a few folders and
 * objects, answering every `/ops/storage…` endpoint the Storage screen
 * calls with the app's status and problem codes, paging included.
 * `opsProxy` in index.ts hands `/ops/storage` paths here before it parses a
 * JSON body, because an upload's body is the file itself.
 *
 * Two profiles: `local` (the development default: a directory on this
 * machine) and `spaces` (a DigitalOcean Spaces bucket, `local: false`, for
 * the production guard); `off` answers 404 `storage_off` everywhere. The
 * profile persists in `localStorage.devtoolsStorageProfile` so the demo
 * can switch and reload.
 */
import { NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";
import type { Problem } from "../types";
import type { SignedURL, StorageObject, StoragePage, StorageStatus } from "../storage";
import { contentTypeFor } from "@/lib/storage/format";
import { isDirectoryMarker, normalizePrefix, validKey, validPrefix } from "@/lib/storage/keys";

export type StorageProfile = "local" | "spaces" | "off";

const PROFILE_KEY = "devtoolsStorageProfile";
const iso = (t: number) => new Date(t).toISOString();

/* ---------- The bucket ---------- */

type Stored = { object: StorageObject; body: Uint8Array };

const text = (s: string) => new TextEncoder().encode(s);

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="20" fill="#0B0C0A"/><circle cx="48" cy="48" r="26" fill="none" stroke="#C6F24A" stroke-width="6"/><circle cx="48" cy="22" r="7" fill="#C6F24A"/></svg>`;
const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="32" fill="#1F221A"/><circle cx="32" cy="26" r="11" fill="#A8AB9F"/><path d="M12 56c3-12 11-18 20-18s17 6 20 18" fill="#A8AB9F"/></svg>`;
const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#16180F"/><stop offset="1" stop-color="#2F3D12"/></linearGradient></defs><rect width="640" height="320" fill="url(#g)"/><g fill="none" stroke="#C6F24A" stroke-width="2" opacity="0.8"><path d="M0 240 C120 200 200 260 320 200 S520 120 640 160"/><path d="M0 280 C120 240 200 300 320 240 S520 160 640 200" opacity="0.5"/></g><text x="32" y="64" font-family="monospace" font-size="28" fill="#F2F1EC">acme-api</text></svg>`;
/** A 4×4 lime PNG. */
const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVQI12P4z8Dwn4GBAYb/QzEDAwCJ2QX/+mZmiwAAAABJRU5ErkJggg==";

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A one-page PDF that says what it is; enough for a viewer. */
function pdf(title: string): string {
  const content = `BT /F1 24 Tf 72 720 Td (${title}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const usersCsv = `id,email,created_at,roles\nusr_3frf6yknqvo4wx5ar5ut5pof4a,admin@example.com,2026-08-05T09:12:00Z,platform_admin\nusr_grace7q2kxw4bmz5ar5ut5pof,grace@northwind.dev,2026-09-03T15:40:00Z,ops_viewer\nusr_ada2kxw4bmz5ar5ut5pof4a,ada@acme.dev,2026-09-15T14:30:00Z,\n`;
const reportJson = JSON.stringify({ generated_at: iso(NOW - 2 * HOUR), period: "2026-09", totals: { users: 5, sessions: 3, jobs_completed: 412, jobs_failed: 3 }, top_routes: [{ route: "GET /v1/projects", count: 1832 }, { route: "POST /v1/auth/login", count: 641 }] }, null, 2);
const readmeMd = `# Exports\n\nFiles the \`exports.nightly\` job writes: one CSV of accounts and one JSON report per month.\n\n- \`users.csv\` — every account with its roles\n- \`report.json\` — the month's totals\n\nSigned GET URLs hand these to the finance team without an account.\n`;
const notesTxt = `Storage notes\n=============\n\nThe local driver keeps objects under .orb/storage/objects and a sidecar\nunder .orb/storage/meta. Signed URLs are served by the app at /storage/.\n\nSet STORAGE_SIGNING_KEY so links survive a restart.\n`;

const seed = (): [string, { body: Uint8Array; type: string; at: number; etag?: string; metadata?: Record<string, string> }][] => [
  ["images/logo.svg", { body: text(logoSvg), type: "image/svg+xml", at: NOW - 31 * DAY, metadata: { source: "brand kit", version: "3" } }],
  ["images/hero.svg", { body: text(heroSvg), type: "image/svg+xml", at: NOW - 12 * DAY }],
  ["images/avatar.svg", { body: text(avatarSvg), type: "image/svg+xml", at: NOW - 3 * DAY - 2 * HOUR }],
  ["images/pixel.png", { body: fromBase64(pixelPng), type: "image/png", at: NOW - 45 * MIN }],
  ["invoices/2026/inv_42.pdf", { body: text(pdf("Invoice 42 - ACME Ltd - 1,240.00 EUR")), type: "application/pdf", at: NOW - 9 * DAY, metadata: { invoice: "inv_42", customer: "org_acme" } }],
  ["invoices/2026/inv_43.pdf", { body: text(pdf("Invoice 43 - Northwind - 380.00 EUR")), type: "application/pdf", at: NOW - 2 * DAY, metadata: { invoice: "inv_43", customer: "org_northwind" } }],
  ["exports/users.csv", { body: text(usersCsv), type: "text/csv", at: NOW - 6 * HOUR }],
  ["exports/report.json", { body: text(reportJson), type: "application/json", at: NOW - 2 * HOUR }],
  ["exports/README.md", { body: text(readmeMd), type: "text/markdown", at: NOW - 20 * DAY }],
  ["notes.txt", { body: text(notesTxt), type: "text/plain", at: NOW - 5 * DAY }],
  ["drafts/.keep", { body: new Uint8Array(), type: "application/octet-stream", at: NOW - 1 * DAY }],
];

/** FNV-1a over the bytes, twice with different seeds, as a 32-hex ETag like the local driver's MD5. */
function etagOf(body: Uint8Array): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (const b of body) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return `${fnv(0x811c9dc5)}${fnv(0x9747b28c)}${fnv(0x12345678)}${fnv(body.length + 1)}`;
}

let objects = new Map<string, Stored>();
let profile: StorageProfile = "local";

function readStoredProfile(): StorageProfile | undefined {
  try {
    const v = typeof window === "undefined" ? undefined : window.localStorage.getItem(PROFILE_KEY);
    return v === "local" || v === "spaces" || v === "off" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Back to the seeded bucket; the profile comes from localStorage when the browser set one. */
export function resetMockStorage() {
  objects = new Map();
  for (const [key, s] of seed()) objects.set(key, { object: { key, size: s.body.length, content_type: s.type, etag: etagOf(s.body), last_modified: iso(s.at), metadata: s.metadata }, body: s.body });
  profile = readStoredProfile() ?? "local";
}
resetMockStorage();

export function mockStorageProfile(): StorageProfile {
  return profile;
}

/** Switches the profile for the guard: `local` on this machine, `spaces` elsewhere, `off` for the gate. Persists for reloads. */
export function setMockStorageProfile(p: StorageProfile) {
  profile = p;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(PROFILE_KEY, p);
  } catch {
    // Storage may be unavailable; the switch lasts as long as the page then.
  }
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 503: "Service Unavailable" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

const invalidKey = () => problem(422, "invalid_storage_key", 'keys are 1 to 1024 characters of path segments without ".", ".." or a leading slash');
const notFound = () => problem(404, "storage_object_not_found", "no object has this key");

const profiles: Record<Exclude<StorageProfile, "off">, () => StorageStatus> = {
  local: () => ({ driver: "local", bucket: "storage", endpoint: "/Users/you/src/acme-api/.orb/storage", local: true, status: "ok", ping_ms: 0.03 + Math.random() * 0.05 }),
  spaces: () => ({
    driver: "spaces",
    bucket: "acme-files",
    endpoint: "fra1.digitaloceanspaces.com",
    region: "fra1",
    local: false,
    public_url: "https://acme-files.fra1.cdn.digitaloceanspaces.com",
    status: "ok",
    ping_ms: 34 + Math.random() * 12,
  }),
};

/** Sorted keys, like the local driver's walk. */
const sortedKeys = () => [...objects.keys()].sort();

/**
 * `GET /ops/storage/objects`: the local driver's algorithm, keys sorted,
 * folded at the next slash unless recursive, `limit` entries a page, the
 * cursor being the last key the page consumed. Markers are hidden and
 * don't count.
 */
function list(prefix: string, recursive: boolean, cursor: string, limit: number): StoragePage {
  const page: StoragePage = { prefix, objects: [], prefixes: [] };
  const seen = new Set<string>();
  let count = 0;
  let last = "";
  const keys = sortedKeys().filter((k) => k.startsWith(prefix) && (!cursor || k > cursor));
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!recursive) {
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) {
        const dir = prefix + rest.slice(0, slash + 1);
        if (!seen.has(dir)) {
          seen.add(dir);
          page.prefixes!.push(dir);
          count++;
        }
        last = key;
        // Skip the rest of this directory: it folds into the same prefix.
        while (i + 1 < keys.length && keys[i + 1].startsWith(dir)) last = keys[++i];
        if (count >= limit && i + 1 < keys.length) {
          page.next_cursor = last;
          break;
        }
        continue;
      }
    }
    last = key;
    if (isDirectoryMarker(key)) continue;
    page.objects!.push(objects.get(key)!.object);
    count++;
    if (count >= limit && i + 1 < keys.length) {
      page.next_cursor = last;
      break;
    }
  }
  return page;
}

async function bodyBytes(body: RequestInit["body"]): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array();
  if (typeof body === "string") return text(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (typeof body === "object" && "arrayBuffer" in body && typeof (body as Blob).arrayBuffer === "function") return new Uint8Array(await (body as Blob).arrayBuffer());
  return text(String(body));
}

function parseJson(body: RequestInit["body"]): Record<string, unknown> | null {
  if (typeof body !== "string" || body === "") return {};
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function put(key: string, body: Uint8Array, contentType: string, metadata?: Record<string, string>): StorageObject {
  const object: StorageObject = { key, size: body.length, content_type: contentType || contentTypeFor(key), etag: etagOf(body), last_modified: new Date().toISOString(), metadata };
  objects.set(key, { object, body });
  return object;
}

function signedUrl(key: string, method: string, expires: number): string {
  if (profile === "spaces") {
    const date = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const sig = etagOf(text(`${key}${method}${expires}`)) + etagOf(text(`${expires}${key}`));
    const q = new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `DO00EXAMPLEKEY/${date.slice(0, 8)}/fra1/s3/aws4_request`, "X-Amz-Date": date, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host", "X-Amz-Signature": sig });
    return `https://acme-files.fra1.digitaloceanspaces.com/${key.split("/").map(encodeURIComponent).join("/")}?${q}`;
  }
  const exp = Math.floor(Date.now() / 1000) + expires;
  const sig = etagOf(text(`${key}${method}${exp}`)) + etagOf(text(`${exp}${key}`));
  return `http://127.0.0.1:8080/storage/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&method=${method}&sig=${sig}`;
}

/**
 * Answers an `/ops/storage…` path, or `undefined` when the path isn't one.
 * Takes the raw init: an upload's body is the file, not JSON.
 */
export function mockStorageFetch(path: string, query: URLSearchParams, method: string, init: RequestInit): Response | Promise<Response> | undefined {
  if (path !== "/ops/storage" && !path.startsWith("/ops/storage/")) return undefined;
  if (profile === "off") return problem(404, "storage_off", "the app has no file storage: set STORAGE_DRIVER (local in development) and restart");

  if (path === "/ops/storage" && method === "GET") return json(profiles[profile]());

  if (path === "/ops/storage/objects" && method === "GET") {
    const prefix = query.get("prefix") ?? "";
    if (!validPrefix(prefix)) return invalidKey();
    const limitRaw = query.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return problem(422, "validation_failed", "limit must be between 1 and 1000");
    return json(list(prefix, query.get("recursive") === "true", query.get("cursor") ?? "", limit));
  }

  if (path === "/ops/storage/object" || path === "/ops/storage/object/content") {
    const key = query.get("key") ?? "";
    if (!validKey(key)) return invalidKey();
    if (path === "/ops/storage/object" && method === "PUT") {
      return (async () => {
        const body = await bodyBytes(init.body);
        const type = new Headers(init.headers).get("content-type") ?? "";
        return json(put(key, body, type.split(";")[0].trim()), 201);
      })();
    }
    if (path === "/ops/storage/object" && method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const s = objects.get(key);
    if (method !== "GET") return problem(405, "method_not_allowed", `${method} not allowed`);
    if (!s) return notFound();
    if (path === "/ops/storage/object") return json(s.object);
    const bytes = new Uint8Array(s.body.length);
    bytes.set(s.body);
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": s.object.content_type, "Content-Length": String(s.body.length), "Content-Disposition": `attachment; filename="${key.slice(key.lastIndexOf("/") + 1)}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
    });
  }

  const body = parseJson(init.body);
  if (!body) return problem(422, "validation_failed", "the body must be JSON");

  if (path === "/ops/storage/object/move" && method === "POST") {
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    if (!validKey(from) || !validKey(to)) return invalidKey();
    const s = objects.get(from);
    if (!s) return notFound();
    if (from === to) return json(s.object);
    const moved: StorageObject = { ...s.object, key: to, last_modified: new Date().toISOString() };
    objects.set(to, { object: moved, body: s.body });
    objects.delete(from);
    return json(moved);
  }

  if (path === "/ops/storage/directories" && method === "POST") {
    const raw = typeof body.prefix === "string" ? body.prefix : "";
    const prefix = normalizePrefix(raw);
    if (!prefix || !validPrefix(prefix) || raw.startsWith("/")) return invalidKey();
    const marker = `${prefix}.keep`;
    if (!objects.has(marker)) put(marker, new Uint8Array(), "application/octet-stream");
    return json({ prefix }, 201);
  }

  if (path === "/ops/storage/signed-url" && method === "POST") {
    const key = typeof body.key === "string" ? body.key : "";
    if (!validKey(key)) return invalidKey();
    const m = body.method === undefined || body.method === "" ? "GET" : body.method;
    if (m !== "GET" && m !== "PUT") return problem(422, "validation_failed", "method must be GET or PUT");
    const raw = body.expiry_seconds === undefined ? 3600 : body.expiry_seconds;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 604_800) return problem(422, "validation_failed", "expiry_seconds must be between 1 and 604800");
    const res: SignedURL = { key, method: m, url: signedUrl(key, m, raw), expires_at: new Date(Date.now() + raw * 1000).toISOString() };
    return json(res, 201);
  }

  return problem(404, "not_found", `no route matches ${method} ${path}`);
}
