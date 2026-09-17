/**
 * `APP_CORS_ORIGINS` as a list: the app reads a comma-separated value
 * ("Comma-separated browser origins allowed to call the API"), the screen
 * edits one origin per row.
 */

/** Splits the env value into origins, trimmed, empty ones dropped, duplicates kept once. */
export function parseOrigins(value: string | undefined | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const o = raw.trim();
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

/** The env value for a list: trimmed, empty ones dropped, comma-joined; "" clears CORS. */
export function joinOrigins(origins: string[]): string {
  return parseOrigins(origins.join(",")).join(",");
}

/**
 * Why an origin can't be one: a scheme and a host, no path, query or
 * fragment, no wildcard (the app matches origins exactly). Undefined when fine.
 */
export function originError(origin: string): string | undefined {
  const o = origin.trim();
  if (!o) return "empty";
  if (o === "*") return "a wildcard isn't an origin; list each origin";
  let url: URL;
  try {
    url = new URL(o);
  } catch {
    return "an origin is a scheme and a host, such as https://app.example.com";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "the scheme must be http or https";
  if (!url.host) return "an origin needs a host";
  if (url.username || url.password) return "an origin carries no credentials";
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) return "an origin has no path, query or fragment";
  if (o.endsWith("/")) return "drop the trailing slash";
  return undefined;
}

/** Every problem in a list, by row. */
export function validateOrigins(origins: string[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Set<string>();
  origins.forEach((o, i) => {
    const err = originError(o);
    if (err) errors[i] = err;
    else if (seen.has(o.trim())) errors[i] = "listed twice";
    seen.add(o.trim());
  });
  return errors;
}
