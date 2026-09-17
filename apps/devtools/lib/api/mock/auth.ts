/**
 * The auth module's operator APIs in memory (ADR-0070): accounts with
 * sessions, passkeys, linked providers, second factors and pending codes,
 * the sign-in methods and the rate limiters. `mockAuthFetch` answers the
 * `/ops/auth/*` paths the Authentication screen calls, with the same status
 * codes and problem codes as the app; `opsProxy` in index.ts hands them here.
 */
import { NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";
import type { AuthSession, Identity, OpsCode, OpsMFAStatus, OpsUser, OpsUserDetail, Passkey, RateLimiter, SignInMethod } from "../auth";
import type { Problem } from "../types";

const iso = (t: number) => new Date(t).toISOString();

type MockUser = OpsUser & { mfa: Omit<OpsMFAStatus, "passkeys">; sessions: AuthSession[]; passkeys: Passkey[]; identities: Identity[]; codes: OpsCode[] };

const session = (id: string, created: number, seen: number, ip: string, ua: string, mfa = false): AuthSession => ({
  id,
  created_at: iso(created),
  last_seen_at: iso(seen),
  expires_at: iso(seen + 30 * DAY),
  ip,
  user_agent: ua,
  current: false,
  mfa_verified: mfa,
});

const initialUsers = (): MockUser[] => [
  {
    id: "usr_3frf6yknqvo4wx5ar5ut5pof4a",
    email: "admin@example.com",
    email_verified: true,
    created_at: iso(NOW - 41 * DAY),
    roles: ["platform_admin"],
    has_password: true,
    mfa: { totp: true, recovery_codes: 10 },
    sessions: [session("ses_nbswy3dpeb3w64tmmq", NOW - 3 * HOUR, NOW - 4 * MIN, "127.0.0.1", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15", true)],
    passkeys: [{ id: "pky_nbswy3dpeb3w64tmmq", name: "MacBook", created_at: iso(NOW - 30 * DAY), last_used_at: iso(NOW - 2 * DAY), backed_up: true }],
    identities: [],
    codes: [],
  },
  {
    id: "usr_grace7q2kxw4bmz5ar5ut5pof",
    email: "grace@northwind.dev",
    email_verified: true,
    created_at: iso(NOW - 12 * DAY),
    roles: ["ops_viewer"],
    has_password: true,
    mfa: { totp: false, recovery_codes: 0 },
    sessions: [
      session("ses_grace1webkit2024", NOW - 2 * DAY, NOW - 22 * MIN, "203.0.113.9", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"),
      session("ses_grace2chrome2024", NOW - 6 * HOUR, NOW - 6 * HOUR, "198.51.100.23", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0"),
    ],
    passkeys: [],
    identities: [{ id: "idn_google7q2kxw4bmz5a", provider: "google", email: "grace.hopper@gmail.com", private_email: false, name: "Grace Hopper", created_at: iso(NOW - 12 * DAY), last_used_at: iso(NOW - 2 * DAY) }],
    codes: [{ id: "cod_reset7q2kxw4bmz5a", purpose: "reset_password", attempts: 1, max_attempts: 5, created_at: iso(NOW - 48 * MIN), expires_at: iso(NOW + 12 * MIN) }],
  },
  {
    id: "usr_ada2kxw4bmz5ar5ut5pof4a",
    email: "ada@acme.dev",
    email_verified: false,
    created_at: iso(NOW - 2 * MIN),
    roles: [],
    has_password: true,
    mfa: { totp: false, recovery_codes: 0 },
    sessions: [],
    passkeys: [],
    identities: [],
    codes: [{ id: "cod_verify2kxw4bmz5ar", purpose: "verify_email", attempts: 0, max_attempts: 5, created_at: iso(NOW - 2 * MIN), expires_at: iso(NOW + 58 * MIN) }],
  },
  {
    id: "usr_mallory5ut5pof4a3frf6y",
    email: "mallory@example.net",
    email_verified: true,
    created_at: iso(NOW - 25 * DAY),
    roles: [],
    has_password: true,
    banned_at: iso(NOW - 3 * DAY),
    banned_reason: "credential stuffing from 198.51.100.0/24",
    mfa: { totp: false, recovery_codes: 0 },
    sessions: [],
    passkeys: [],
    identities: [],
    codes: [],
  },
  {
    id: "usr_linus4bmz5ar5ut5pof4a3f",
    email: "linus@example.org",
    email_verified: true,
    created_at: iso(NOW - 60 * DAY),
    roles: [],
    has_password: false,
    mfa: { totp: false, recovery_codes: 0 },
    sessions: [],
    passkeys: [],
    identities: [{ id: "idn_github4bmz5ar5ut5p", provider: "github", email: "linus@example.org", private_email: false, name: "linus", created_at: iso(NOW - 60 * DAY), last_used_at: iso(NOW - 9 * DAY) }],
    codes: [],
  },
];

export const mockSignInMethods: SignInMethod[] = [
  { key: "email_password", name: "Email and password", enabled: true },
  { key: "authenticator_app", name: "Authenticator apps (2FA)", enabled: true },
  { key: "passkeys", name: "Passkeys in browsers", enabled: true, detail: "RP ID localhost; origins http://localhost:8080, http://localhost:3000" },
  { key: "passkeys_ios", name: "Passkeys in iOS apps", enabled: false, missing: ["WEBAUTHN_APPLE_APP_IDS"], guide: "AUTH_PROVIDERS.md#passkeys-in-ios-apps" },
  { key: "passkeys_android", name: "Passkeys in Android apps", enabled: false, missing: ["WEBAUTHN_ANDROID_APPS"], guide: "AUTH_PROVIDERS.md#passkeys-in-android-apps" },
  { key: "google", name: "Google sign-in", enabled: true, detail: "client 1234567890-acme.apps.googleusercontent.com" },
  { key: "google_ios", name: "Google sign-in in iOS apps", enabled: false, missing: ["GOOGLE_IOS_CLIENT_ID"], guide: "AUTH_PROVIDERS.md#4-ios-app-optional" },
  { key: "google_android", name: "Google sign-in in Android apps", enabled: false, missing: ["GOOGLE_ANDROID_CLIENT_ID"], guide: "AUTH_PROVIDERS.md#5-android-app-optional" },
  { key: "apple", name: "Apple sign-in", enabled: false, missing: ["APPLE_TEAM_ID", "APPLE_SERVICES_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_FILE"], guide: "AUTH_PROVIDERS.md#apple-sign-in" },
  { key: "apple_ios", name: "Apple sign-in in iOS apps", enabled: false, missing: ["APPLE_BUNDLE_IDS"], guide: "AUTH_PROVIDERS.md#apple-sign-in" },
  { key: "github", name: "GitHub sign-in", enabled: true, detail: "client Iv1.acme0123456789" },
];

export const mockRateLimiters: RateLimiter[] = [
  { name: "auth_ip", keys: "client IP address", description: "Requests to /v1/auth per address (auth.ip_requests_per_minute)" },
  { name: "auth_login", keys: "normalized email address and client network, joined with a space", description: "Sign-in attempts per address from one network (auth.login_attempts)" },
  { name: "auth_code", keys: "purpose and normalized email address, joined with a space", description: "Verification and reset code checks per address (auth.code_attempts)" },
];

/** Keys with a budget right now, `name key`; a reset answers true once for them. */
const initialBudgets = () => new Set(["auth_login mallory@example.net 198.51.100.0/24", "auth_ip 198.51.100.23", "auth_code reset_password grace@northwind.dev"]);

let users: MockUser[] = initialUsers();
let budgets = initialBudgets();
let seq = 1;

/** Back to the first state; tests call it between cases. */
export function resetMockAuth() {
  users = initialUsers();
  budgets = initialBudgets();
  seq = 1;
}

const newId = (prefix: string) => `${prefix}_${(seq++).toString(36).padStart(4, "0")}mock${Math.random().toString(36).slice(2, 12)}`;

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

const noContent = () => new Response(null, { status: 204 });

const publicUser = ({ mfa: _m, sessions: _s, passkeys: _p, identities: _i, codes: _c, ...u }: MockUser): OpsUser => {
  void _m;
  void _s;
  void _p;
  void _i;
  void _c;
  return u;
};

const detail = (u: MockUser): OpsUserDetail => ({ user: publicUser(u), sessions: u.sessions, passkeys: u.passkeys, identities: u.identities, mfa: { ...u.mfa, passkeys: u.passkeys.length }, codes: u.codes });

const knownRoles = ["platform_admin", "ops_viewer", "viewer", "editor", "admin"];

/**
 * Answers an `/ops/auth/*` path, or `undefined` when the path isn't one of
 * them. `body` is the parsed JSON body (an empty object for GET).
 */
export function mockAuthFetch(path: string, query: URLSearchParams, method: string, body: Record<string, unknown>): Response | undefined {
  if (path === "/ops/auth/providers" && method === "GET") return json({ methods: mockSignInMethods });
  if (path === "/ops/auth/rate-limits" && method === "GET") return json({ limiters: mockRateLimiters });
  if (path === "/ops/auth/rate-limits/reset" && method === "POST") {
    const name = typeof body.name === "string" ? body.name : "";
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!mockRateLimiters.some((l) => l.name === name) || !key) return problem(404, "rate_limiter_not_found", `no rate limiter ${name || "(empty)"}`);
    const reset = budgets.delete(`${name} ${key}`);
    return json({ reset });
  }
  if (!path.startsWith("/ops/auth/users")) return undefined;

  if (path === "/ops/auth/users") {
    if (method === "GET") return listUsers(query);
    if (method === "POST") return createUser(body);
    return problem(405, "method_not_allowed", `${method} not allowed`);
  }
  const m = /^\/ops\/auth\/users\/([^/]+)(?:\/(.*))?$/.exec(path);
  if (!m) return problem(404, "not_found", `no route matches ${method} ${path}`);
  const u = users.find((x) => x.id === decodeURIComponent(m[1]));
  if (!u) return problem(404, "user_not_found", `no account ${m[1]}`);
  const rest = m[2] ?? "";

  if (rest === "") {
    if (method === "GET") return json(detail(u));
    if (method === "DELETE") {
      users = users.filter((x) => x !== u);
      return noContent();
    }
  }
  if (rest === "verify-email" && method === "POST") {
    u.email_verified = true;
    u.codes = u.codes.filter((c) => c.purpose !== "verify_email");
    return noContent();
  }
  if (rest === "ban" && method === "POST") {
    u.banned_at = iso(Date.now());
    u.banned_reason = typeof body.reason === "string" ? body.reason : "";
    u.sessions = [];
    return noContent();
  }
  if (rest === "unban" && method === "POST") {
    delete u.banned_at;
    delete u.banned_reason;
    return noContent();
  }
  if (rest === "roles" && method === "POST") {
    const role = typeof body.role === "string" ? body.role : "";
    if (!knownRoles.includes(role)) return problem(422, "unknown_role", `no role ${role || "(empty)"} in the permission catalog`);
    if (!u.email_verified) return problem(422, "email_unverified", "the address must be verified before it holds a platform role");
    if (!u.roles.includes(role)) u.roles = [...u.roles, role];
    return json(publicUser(u));
  }
  const role = /^roles\/([^/]+)$/.exec(rest);
  if (role && method === "DELETE") {
    u.roles = u.roles.filter((r) => r !== decodeURIComponent(role[1]));
    return json(publicUser(u));
  }
  if (rest === "sessions" && method === "DELETE") {
    const n = u.sessions.length;
    u.sessions = [];
    return json({ revoked: n });
  }
  const ses = /^sessions\/([^/]+)$/.exec(rest);
  if (ses && method === "DELETE") {
    if (!u.sessions.some((s) => s.id === ses[1])) return problem(404, "session_not_found", `no session ${ses[1]}`);
    u.sessions = u.sessions.filter((s) => s.id !== ses[1]);
    return noContent();
  }
  const pky = /^passkeys\/([^/]+)$/.exec(rest);
  if (pky && method === "DELETE") {
    if (!u.passkeys.some((p) => p.id === pky[1])) return problem(404, "passkey_not_found", `no passkey ${pky[1]}`);
    u.passkeys = u.passkeys.filter((p) => p.id !== pky[1]);
    return noContent();
  }
  const idn = /^identities\/([^/]+)$/.exec(rest);
  if (idn && method === "DELETE") {
    if (!u.identities.some((i) => i.id === idn[1])) return problem(404, "identity_not_found", `no linked account ${idn[1]}`);
    u.identities = u.identities.filter((i) => i.id !== idn[1]);
    return noContent();
  }
  if (rest === "mfa/enroll" && method === "POST") {
    if (u.mfa.totp) return problem(409, "totp_already_enrolled", "the account already has an authenticator app");
    u.mfa = { totp: true, recovery_codes: 10 };
    return json({ secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", uri: `otpauth://totp/acme-api:${encodeURIComponent(u.email)}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=acme-api`, recovery_codes: Array.from({ length: 10 }, (_, i) => `${(0x1a2b + i * 0x3c4).toString(16).padStart(4, "0")}-${(0x9f8e - i * 0x21d).toString(16).padStart(4, "0")}`) }, 201);
  }
  if (rest === "mfa/reset" && method === "POST") {
    u.mfa = { totp: false, recovery_codes: 0 };
    u.passkeys = [];
    u.sessions = [];
    return noContent();
  }
  if (rest === "impersonate" && method === "POST") {
    if (u.banned_at) return problem(403, "account_banned", "the account is banned");
    const mfa = body.mfa_verified === true;
    const s = session(newId("ses"), Date.now(), Date.now(), "127.0.0.1", "Dev Portal (impersonation)", mfa);
    u.sessions = [s, ...u.sessions];
    return json({ token: `sk_mock_${u.id.slice(4, 12)}_${Math.random().toString(36).slice(2, 26)}`, session: s, user: publicUser(u), mfa_verified: mfa }, 201);
  }
  return problem(404, "not_found", `no route matches ${method} ${path}`);
}

function listUsers(query: URLSearchParams): Response {
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 50) || 50));
  const cursor = query.get("cursor") ?? "";
  let list = [...users].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1));
  if (q) list = list.filter((u) => u.email.toLowerCase().includes(q) || u.id.toLowerCase() === q);
  if (cursor) {
    const at = list.findIndex((u) => u.id === cursor);
    if (at < 0) return problem(400, "invalid_cursor", "the cursor doesn't point at an account in this listing");
    list = list.slice(at + 1);
  }
  const page = list.slice(0, limit);
  return json({ users: page.map(publicUser), ...(list.length > limit ? { next_cursor: page[page.length - 1].id } : {}) });
}

function createUser(body: Record<string, unknown>): Response {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(422, "invalid_email", "the email address is not valid");
  if (password.length < 12) return problem(422, "weak_password", "the password must be at least 12 characters");
  if (users.some((u) => u.email === email)) return problem(409, "email_taken", "the email address already has an account");
  const verified = body.email_verified === true;
  const u: MockUser = {
    id: newId("usr"),
    email,
    email_verified: verified,
    created_at: iso(Date.now()),
    roles: [],
    has_password: true,
    mfa: { totp: false, recovery_codes: 0 },
    sessions: [],
    passkeys: [],
    identities: [],
    codes: verified ? [] : [{ id: newId("cod"), purpose: "verify_email", attempts: 0, max_attempts: 5, created_at: iso(Date.now()), expires_at: iso(Date.now() + HOUR) }],
  };
  users = [u, ...users];
  return json(publicUser(u), 201);
}
