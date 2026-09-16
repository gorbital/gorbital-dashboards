/**
 * A bearer token handed from one page to another: the Authentication screen's
 * "Act as user" stores the impersonation token here and the Routes page's
 * request builder picks it up as its pasted bearer token. It lives in
 * sessionStorage (this tab, until it closes), never in the query string.
 */

const KEY = "devtoolsBearer";

export type StoredBearer = {
  token: string;
  /** Who the token acts as, for the builder's hint. */
  label: string;
  /** When it was stored, ISO. */
  at: string;
};

export function storeBearerToken(token: string, label: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, label, at: new Date().toISOString() } satisfies StoredBearer));
  } catch {
    // Storage can be blocked; the token still shows in the dialog to copy.
  }
}

export function readBearerToken(): StoredBearer | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as Partial<StoredBearer>;
    return typeof v.token === "string" && v.token ? { token: v.token, label: String(v.label ?? ""), at: String(v.at ?? "") } : undefined;
  } catch {
    return undefined;
  }
}

export function clearBearerToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
