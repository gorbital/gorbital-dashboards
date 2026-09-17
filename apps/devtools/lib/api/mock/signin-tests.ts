/**
 * "Test sign-in" in mock mode: `/_dev/auth/test…` as the app answers it,
 * for an app on http://localhost:8080 with Google configured and working,
 * Apple configured but needing https, GitHub not configured, passkeys on
 * localhost, the authenticator app and devmail delivery.
 *
 * No provider is ever contacted: a round trip (Google, passkeys) stays
 * pending for two seconds and then passes with a made-up identity, and the
 * page opens no popup in mock mode.
 *
 * `localStorage.devtoolsSignInTestDemo = "fail"` makes Google's round trip
 * fail with redirect_uri_mismatch and its credentials check with
 * invalid_client.
 */

import type { SignInCheck, SignInLiveChecks, SignInMethodKey, SignInTestMethod, SignInTestResult, SignInTests, SignInTestStart, TOTPTestResult, TOTPTestStart } from "../signin-tests";
import type { Problem } from "../types";

const PUBLIC_URL = "http://localhost:8080";
const GOOGLE_CLIENT_ID = "812734567890-acme.apps.googleusercontent.com";
const FINISH_MS = 2000;
const TTL_MS = 10 * 60_000;
const TOTP_ATTEMPTS = 5;
const MAX_PENDING = 5;

type RoundTrip = { result: SignInTestResult; finishAt: number; fail: boolean };
type TotpTest = { start: TOTPTestStart; attemptsLeft: number; passed: boolean; expiresAt: number };

let tests = new Map<string, RoundTrip>();
let totps = new Map<string, TotpTest>();
let seq = 0;

export function resetMockSignInTests() {
  tests = new Map();
  totps = new Map();
  seq = 0;
}

function demo(): string {
  try {
    return typeof localStorage === "undefined" ? "" : (localStorage.getItem("devtoolsSignInTestDemo") ?? "");
  } catch {
    return "";
  }
}

const iso = (t: number) => new Date(t).toISOString();

function nextId(prefix: string): string {
  seq++;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(4, "0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function problem(status: number, code: string, detail: string): Response {
  const titles: Record<number, string> = { 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests" };
  const p: Problem = { title: titles[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json" } });
}

const ok = (code: string, message: string, extra: Partial<SignInCheck> = {}): SignInCheck => ({ code, status: "ok", message, ...extra });

function methods(): SignInTestMethod[] {
  return [
    {
      key: "google",
      name: "Google",
      configured: true,
      checks: [
        ok("google_client_id_format", "GOOGLE_CLIENT_ID looks like a Web application client ID", { variables: ["GOOGLE_CLIENT_ID"] }),
        ok("google_client_secret", "GOOGLE_CLIENT_SECRET is set", { variables: ["GOOGLE_CLIENT_SECRET"] }),
        ok("public_url", `APP_PUBLIC_URL is ${PUBLIC_URL}`, { variables: ["APP_PUBLIC_URL"] }),
        ok("callback_url", `Google sends people back to ${PUBLIC_URL}/v1/auth/google/callback`),
        ok("callback_port", "the callback's port 8080 is the app's (APP_ADDR 127.0.0.1:8080)", { variables: ["APP_ADDR"] }),
        ok("auth_encryption_keys", "AUTH_ENCRYPTION_KEYS is set: provider state is encrypted", { variables: ["AUTH_ENCRYPTION_KEYS"] }),
      ],
      live: { kind: "redirect", available: true },
      callback_url: `${PUBLIC_URL}/v1/auth/google/callback`,
      id_token: true,
    },
    {
      key: "apple",
      name: "Apple",
      configured: true,
      checks: [
        ok("apple_team_id", "APPLE_TEAM_ID is 10 characters", { variables: ["APPLE_TEAM_ID"] }),
        ok("apple_key_id", "APPLE_KEY_ID is 10 characters", { variables: ["APPLE_KEY_ID"] }),
        ok("apple_private_key", "APPLE_PRIVATE_KEY_FILE holds a P-256 private key", { variables: ["APPLE_PRIVATE_KEY_FILE"] }),
        ok("apple_services_id", "APPLE_SERVICES_ID is com.acme.web", { variables: ["APPLE_SERVICES_ID"] }),
        {
          code: "apple_public_url_https",
          status: "fail",
          message: `Apple returns only to https addresses, and APP_PUBLIC_URL is ${PUBLIC_URL}`,
          fix: "Start a named tunnel and apply its .env proposal, then register its callback URL as a Return URL of the Services ID.",
          variables: ["APP_PUBLIC_URL"],
          link: "tunnel",
        },
      ],
      live: { kind: "redirect", available: false, reason: "Apple needs an https APP_PUBLIC_URL: run the app through a named tunnel to test the round trip.", link: "tunnel" },
      callback_url: `${PUBLIC_URL}/v1/auth/apple/callback`,
      id_token: true,
    },
    {
      key: "github",
      name: "GitHub",
      configured: false,
      checks: [
        { code: "github_client_id_format", status: "fail", message: "GITHUB_CLIENT_ID isn't set", fix: "Create an OAuth App in GitHub → Settings → Developer settings and copy its Client ID.", variables: ["GITHUB_CLIENT_ID"], link: "environment" },
        { code: "github_client_secret_format", status: "fail", message: "GITHUB_CLIENT_SECRET isn't set", fix: "Generate a client secret in the same OAuth App.", variables: ["GITHUB_CLIENT_SECRET"], link: "environment" },
        { code: "callback_url", status: "skip", message: "GitHub isn't configured", link: "guide" },
      ],
      live: { kind: "redirect", available: false, reason: "GitHub sign-in isn't configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.", link: "environment" },
      callback_url: `${PUBLIC_URL}/v1/auth/github/callback`,
    },
    {
      key: "passkeys",
      name: "Passkeys",
      configured: true,
      checks: [
        ok("webauthn_rp_id", "WEBAUTHN_RP_ID is localhost", { variables: ["WEBAUTHN_RP_ID"] }),
        ok("webauthn_origins", `WEBAUTHN_ORIGINS lists ${PUBLIC_URL}`, { variables: ["WEBAUTHN_ORIGINS"] }),
        ok("webauthn_live_origin", `the test ceremony runs on ${PUBLIC_URL}, which matches the RP ID`),
      ],
      live: { kind: "ceremony", available: true },
      origin: PUBLIC_URL,
      rp_id: "localhost",
    },
    {
      key: "authenticator_app",
      name: "Authenticator app",
      configured: true,
      checks: [ok("auth_encryption_keys", "AUTH_ENCRYPTION_KEYS is set: TOTP secrets are encrypted at rest", { variables: ["AUTH_ENCRYPTION_KEYS"] })],
      live: { kind: "code", available: true },
    },
    {
      key: "email",
      name: "Email codes",
      configured: true,
      checks: [ok("mail_delivery", "MAIL_DELIVERY is devmail: messages land on the Mail page", { variables: ["MAIL_DELIVERY"], link: "mail" })],
      live: { kind: "email", available: true },
    },
  ];
}

function liveChecks(provider: "google" | "apple"): SignInLiveChecks {
  const host = provider === "google" ? "oauth2.googleapis.com" : "appleid.apple.com";
  const failing = provider === "google" && demo() === "fail";
  return {
    method: provider,
    checks: [
      ok("provider_reachable", `${host} answered in 142 ms`),
      ok("clock_skew", "this machine's clock is within 1 s of the provider's"),
      failing
        ? { code: "client_credentials", status: "fail", message: "Google refused the client: invalid_client (The OAuth client was not found.)", fix: "Copy the Client ID and secret of the Web application client again from Google Cloud Console → Google Auth Platform → Clients.", variables: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], link: "environment" }
        : ok("client_credentials", provider === "google" ? "Google accepts the client ID and secret" : "Apple accepts the client secret signed with APPLE_KEY_ID"),
    ],
  };
}

function finish(t: RoundTrip, now: number): SignInTestResult {
  const r = t.result;
  if (r.state !== "pending") return r;
  if (now >= Date.parse(r.expires_at)) {
    t.result = { ...r, state: "expired", code: "expired", message: "Nothing came back before the test expired.", finished_at: iso(now) };
    return t.result;
  }
  if (now < t.finishAt) return r;
  const at = iso(t.finishAt);
  if (r.method === "passkeys") {
    t.result = { ...r, state: "passed", finished_at: at, passkey: { rp_id: "localhost", origin: PUBLIC_URL, credential_id: "mT3k9QpZ2vYb7xR1cN4sLw", backup_eligible: true, backup_state: true, user_verified: true } };
  } else if (t.fail) {
    t.result = {
      ...r,
      state: "failed",
      finished_at: at,
      code: "redirect_uri_mismatch",
      message: `Google refused the redirect: ${PUBLIC_URL}/v1/auth/google/callback isn't one of the client's Authorized redirect URIs.`,
      fix: "Add the callback URL under Google Cloud Console → Google Auth Platform → Clients → your Web application client → Authorized redirect URIs, wait a minute, and test again.",
      link: "guide",
    };
  } else {
    t.result = { ...r, state: "passed", finished_at: at, identity: { subject: "109876543210987654321", email: "ada@example.com", email_verified: true, name: "Ada Lovelace", audience: GOOGLE_CLIENT_ID } };
  }
  return t.result;
}

function start(method: SignInMethodKey, input: Record<string, unknown>, now: number): Response {
  const m = methods().find((x) => x.key === method);
  if (!m) return problem(404, "not_found", `no route matches POST /_dev/auth/test/${method}/start`);
  if (!m.configured) return problem(404, "not_configured", `${m.name} sign-in isn't configured`);
  if (!m.live.available) return problem(409, "live_test_unavailable", m.live.reason ?? `${m.name} can't be tested live here`);
  const raw = typeof input.result_url === "string" ? input.result_url : "";
  let resultUrl: URL;
  try {
    resultUrl = new URL(raw);
    if (resultUrl.protocol !== "http:" && resultUrl.protocol !== "https:") throw new Error("scheme");
  } catch {
    return problem(422, "invalid_result_url", "result_url must be an absolute http or https URL on the portal");
  }
  let pending = 0;
  for (const t of tests.values()) if (finish(t, now).state === "pending") pending++;
  if (pending >= MAX_PENDING) return problem(429, "too_many_tests", `${pending} tests are still waiting; finish one or wait for them to expire`);
  const id = nextId("sit");
  const expires = now + TTL_MS;
  tests.set(id, {
    finishAt: now + FINISH_MS,
    fail: method === "google" && demo() === "fail",
    result: { id, method, kind: method === "passkeys" ? "ceremony" : "redirect", state: "pending", started_at: iso(now), expires_at: iso(expires) },
  });
  const url =
    method === "passkeys"
      ? `${PUBLIC_URL}/_dev/auth/test/passkeys/ceremony?id=${id}`
      : `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(`${PUBLIC_URL}/v1/auth/google/callback`)}&response_type=code&scope=openid%20email%20profile&state=${id}`;
  return json({ id, url, expires_at: iso(expires) } satisfies SignInTestStart, 201);
}

function verifyIdToken(provider: "google" | "apple", input: Record<string, unknown>, now: number): Response {
  const token = typeof input.id_token === "string" ? input.id_token.trim() : "";
  const nonce = typeof input.nonce === "string" ? input.nonce : "";
  if (!token) return problem(422, "invalid_request", "id_token is required");
  const id = nextId("sit");
  const base: SignInTestResult = { id, method: provider, kind: "id_token", state: "passed", started_at: iso(now), finished_at: iso(now), expires_at: iso(now + TTL_MS) };
  let result: SignInTestResult;
  if (token.split(".").length !== 3) {
    result = { ...base, state: "failed", code: "id_token_signature", message: "That isn't a signed JWT: an ID token has three dot-separated parts.", fix: "Paste the idToken (Google) or identityToken (Apple) exactly as the SDK returns it." };
  } else if (nonce === "wrong") {
    result = { ...base, state: "failed", code: "nonce_mismatch", message: "The token's nonce isn't the one you entered.", fix: provider === "apple" ? "Enter the nonce before hashing: the app hashes it with SHA-256 before handing it to Apple." : "Enter the nonce the app passed to Google Sign-In." };
  } else {
    result =
      provider === "google"
        ? { ...base, identity: { subject: "109876543210987654321", email: "ada@example.com", email_verified: true, name: "Ada Lovelace", audience: GOOGLE_CLIENT_ID, hosted_domain: "example.com" } }
        : { ...base, identity: { subject: "001234.8f2c4e9b7a6d4c3b.1234", email: "x7k2m9q4p1@privaterelay.appleid.com", email_verified: true, private_email: true, audience: "com.acme.ios" } };
  }
  tests.set(id, { result, finishAt: now, fail: false });
  return json(result);
}

/** A stand-in QR code: a deterministic grid with the three finder squares, as an SVG data URL. */
function fakeQr(seed: string): string {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rects: string[] = [];
  const finder = (x: number, y: number) => x < 7 && y < 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y)) {
        const fx = x < 7 ? x : n - 1 - x;
        const fy = y < 7 ? y : n - 1 - y;
        const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3));
        if (ring !== 2) rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
        continue;
      }
      h = Math.imul(h ^ (x * 31 + y), 16777619);
      if ((h >>> 7) % 2 === 0) rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function totpStart(now: number): Response {
  const id = nextId("tot");
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const issuer = "acme-api (test)";
  const account = "sign-in-test@example.com";
  const start: TOTPTestStart = {
    id,
    secret,
    uri: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
    qr_code: fakeQr(id),
    issuer,
    account,
    expires_at: iso(now + TTL_MS),
    checks: [ok("auth_encryption_keys", "AUTH_ENCRYPTION_KEYS is set: real TOTP secrets are encrypted at rest", { variables: ["AUTH_ENCRYPTION_KEYS"] })],
  };
  totps.set(id, { start, attemptsLeft: TOTP_ATTEMPTS, passed: false, expiresAt: now + TTL_MS });
  return json(start, 201);
}

function totpVerify(input: Record<string, unknown>, now: number): Response {
  const id = typeof input.id === "string" ? input.id : "";
  const t = totps.get(id);
  if (!t) return problem(404, "test_not_found", `no authenticator test ${id || "(empty)"}; start a new one`);
  const code = typeof input.code === "string" ? input.code.replace(/\s+/g, "") : "";
  const answer = (r: Omit<TOTPTestResult, "attempts_left">) => json({ ...r, attempts_left: t.attemptsLeft } satisfies TOTPTestResult);
  if (now >= t.expiresAt) return answer({ passed: false, code: "expired", message: "This test expired.", fix: "Start a new test and scan the new code." });
  if (t.passed) return answer({ passed: true, code: "ok", message: "The code matched." });
  if (t.attemptsLeft <= 0) return answer({ passed: false, code: "too_many_attempts", message: "Five codes were wrong.", fix: "Start a new test." });
  if (!/^\d{6}$/.test(code)) return problem(422, "invalid_request", "code must be six digits");
  t.attemptsLeft--;
  if (code === "000000") {
    if (t.attemptsLeft <= 0) return answer({ passed: false, code: "too_many_attempts", message: "Five codes were wrong.", fix: "Start a new test." });
    return answer({ passed: false, code: "invalid_code", message: "The code doesn't match this secret at any nearby time.", fix: "Check that the authenticator added the account from this QR code, and type the code it shows now." });
  }
  if (code === "111111") {
    return answer({ passed: false, code: "clock_drift", message: "The code matches 90 s ahead of this machine's clock (3 steps): the app accepts one step either way.", fix: "Set the phone's and this machine's time automatically (network time).", drift_steps: 3, drift_seconds: 90 });
  }
  t.passed = true;
  return answer({ passed: true, code: "ok", message: "The code matches the current 30 s step." });
}

/** Answers `/_dev/auth/test…` (the path after `/_portal/app`), or undefined for other paths. */
export function mockSignInTestsFetch(path: string, method: string, body: BodyInit | null | undefined, now = Date.now()): Response | undefined {
  if (path !== "/_dev/auth/test" && !path.startsWith("/_dev/auth/test/")) return undefined;
  let input: Record<string, unknown> = {};
  if (typeof body === "string" && body !== "") {
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid_json", "the body must be JSON");
    }
  }
  const rest = path.replace(/^\/_dev\/auth\/test\/?/, "");
  if (rest === "") return method === "GET" ? json({ public_url: PUBLIC_URL, methods: methods() } satisfies SignInTests) : problem(405, "method_not_allowed", "GET only");
  const result = /^results\/([^/]+)$/.exec(rest);
  if (result) {
    if (method !== "GET") return problem(405, "method_not_allowed", "GET only");
    const t = tests.get(decodeURIComponent(result[1]));
    return t ? json(finish(t, now)) : problem(404, "test_not_found", `no sign-in test ${result[1]}`);
  }
  if (method !== "POST") return problem(405, "method_not_allowed", "POST only");
  if (rest === "totp/start") return totpStart(now);
  if (rest === "totp/verify") return totpVerify(input, now);
  const action = /^(google|apple|github|passkeys)\/(check|start|id-token)$/.exec(rest);
  if (!action) return problem(404, "not_found", `no route matches ${method} ${path}`);
  const [, provider, what] = action;
  if (what === "start") return start(provider as SignInMethodKey, input, now);
  if (provider === "passkeys") return problem(404, "not_found", `no route matches ${method} ${path}`);
  if (provider === "github") return what === "check" ? problem(404, "not_configured", "GitHub sign-in isn't configured") : problem(404, "not_found", `no route matches ${method} ${path}`);
  if (what === "check") return json(liveChecks(provider as "google" | "apple"));
  return verifyIdToken(provider as "google" | "apple", input, now);
}
