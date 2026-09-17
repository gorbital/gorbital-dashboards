/**
 * The Routes page's request builder: pure functions that turn what the form
 * holds into the URL and `RequestInit` sent through the proxy, and the one
 * that sends it and measures the answer.
 */
import { MUTATION_HEADER, transportFetch } from "./client";

export type KeyValue = { key: string; value: string };

export type AuthMode = "operator" | "bearer" | "none";

export type RequestSpec = {
  method: string;
  /** The route pattern, such as /v1/projects/{id}. */
  path: string;
  /** Values for the `{params}` in `path`. */
  pathParams: Record<string, string>;
  query: KeyValue[];
  headers: KeyValue[];
  /** Sent as-is for methods with a body; empty means no body. */
  body: string;
  auth: AuthMode;
  /** The token for `auth: "bearer"`. */
  token?: string;
};

/** The proxy prefix: `/_portal/app/v1/x` reaches the app's `/v1/x`. */
export const APP_PREFIX = "/_portal/app";

/** The `{name}` placeholders of a route pattern, in order, without duplicates. */
export function pathParams(path: string): string[] {
  const out: string[] = [];
  for (const m of path.matchAll(/\{([^}]+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Substitutes the placeholders it has values for, URL-encoded; the rest stay as written so the user sees what's missing. */
export function fillPath(path: string, params: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined || v === "" ? whole : encodeURIComponent(v);
  });
}

/** Appends the non-empty query keys; keeps a query string the path already has. */
export function buildQuery(path: string, query: KeyValue[]): string {
  const pairs = query.filter((q) => q.key.trim() !== "").map((q) => `${encodeURIComponent(q.key.trim())}=${encodeURIComponent(q.value)}`);
  if (pairs.length === 0) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${pairs.join("&")}`;
}

export const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True when the proxy adds the dev operator's token to this path, so "none" can't really be none. */
export function proxyAddsAuth(path: string): boolean {
  return path.startsWith("/_dev") || path.startsWith("/ops/");
}

/** The URL (through the proxy) and the init for `fetch`, exactly as `sendRequest` uses them. */
export function buildRequest(spec: RequestSpec): { url: string; init: RequestInit } {
  const method = spec.method.toUpperCase();
  const path = buildQuery(fillPath(spec.path, spec.pathParams), spec.query);
  const headers = new Headers();
  headers.set("Accept", "application/json, application/problem+json, text/plain;q=0.9, */*;q=0.8");
  if (method !== "GET" && method !== "HEAD") headers.set(MUTATION_HEADER, "1");
  for (const h of spec.headers) if (h.key.trim() !== "") headers.set(h.key.trim(), h.value);
  if (spec.auth === "bearer" && spec.token) headers.set("Authorization", `Bearer ${spec.token.trim()}`);
  const init: RequestInit = { method, headers, credentials: "same-origin", cache: "no-store" };
  if (methodsWithBody.has(method) && spec.body.trim() !== "") {
    init.body = spec.body;
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  return { url: `${APP_PREFIX}${path}`, init };
}

/** Which response headers the builder shows; the rest stay in the browser's inspector. */
export const shownHeaders = ["content-type", "content-length", "x-request-id", "x-trace-id", "cache-control", "retry-after", "location", "www-authenticate", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"];

export type SentResponse = {
  status: number;
  statusText: string;
  /** Wall time from fetch to the last byte, in this browser. */
  durationMs: number;
  headers: KeyValue[];
  /** The body as text, pretty-printed when it was JSON. */
  body: string;
  json: boolean;
  requestId?: string;
  /** How many bytes the body had, before pretty-printing. */
  bytes: number;
};

export type SentRequest = {
  id: number;
  at: string;
  method: string;
  /** The path as sent, without the proxy prefix. */
  path: string;
  /** Undefined when nothing answered. */
  response?: SentResponse;
  error?: string;
};

/** Pretty-prints JSON bodies; anything else comes back as-is. */
export function prettyBody(text: string, contentType: string): { body: string; json: boolean } {
  if (/json/i.test(contentType) || /^\s*[[{]/.test(text)) {
    try {
      return { body: JSON.stringify(JSON.parse(text), null, 2), json: true };
    } catch {
      // Not JSON after all.
    }
  }
  return { body: text, json: false };
}

/** Sends the request through the proxy and measures the answer; a failed fetch rejects with the browser's error. */
export async function sendRequest(spec: RequestSpec): Promise<SentResponse> {
  const { url, init } = buildRequest(spec);
  const started = performance.now();
  const res = await transportFetch(url, init);
  const text = await res.text();
  const durationMs = performance.now() - started;
  const headers: KeyValue[] = [];
  res.headers.forEach((value, key) => {
    if (shownHeaders.includes(key.toLowerCase())) headers.push({ key, value });
  });
  headers.sort((a, b) => a.key.localeCompare(b.key));
  const { body, json } = prettyBody(text, res.headers.get("content-type") ?? "");
  return { status: res.status, statusText: res.statusText, durationMs, headers, body, json, requestId: res.headers.get("x-request-id") ?? undefined, bytes: text.length };
}
