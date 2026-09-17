/**
 * The tunnel in mock mode (ADR-0086): a pretend cloudflared behind
 * `/_portal/api/tunnel…` that connects a moment after starting and streams
 * `tunnel` events like orb dev, with the setup built from the mock `.env`
 * by the same rules as `cli/internal/tunnel.BuildSetup`.
 *
 * `localStorage.devtoolsTunnelDemo` shows the other cases: "no-cloudflared"
 * (the install help), "production" (refused), "named" (a token in the
 * environment, so a named tunnel can start).
 */

import { mockEnvValue } from "./project";
import type { InstallStep, Reachability, TunnelCallback, TunnelEnvChange, TunnelInfo, TunnelMode, TunnelSetup, TunnelStatus } from "../tunnel";
import type { Problem } from "../types";

type Publish = (status: TunnelStatus) => void;
type Line = (stream: "orb" | "app", text: string) => void;

const QUICK_URL = "https://quiet-harbor-orbit-demo.trycloudflare.com";

const install: InstallStep[] = [
  { os: "darwin", label: "macOS with Homebrew", command: "brew install cloudflared" },
  { os: "linux", label: "Debian and Ubuntu (Cloudflare's apt repository)", url: "https://pkg.cloudflare.com/index.html" },
  { os: "linux", label: "Fedora, RHEL and CentOS (Cloudflare's rpm repository)", url: "https://pkg.cloudflare.com/index.html" },
  { os: "linux", label: "Any Linux: the release binary", url: "https://github.com/cloudflare/cloudflared/releases/latest" },
  { os: "windows", label: "Windows with winget", command: "winget install --id Cloudflare.cloudflared" },
  { os: "", label: "Every package and platform", url: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" },
];

let status: TunnelStatus = offStatus();
let savedHostname = "";
let timers: ReturnType<typeof setTimeout>[] = [];
let started = false;

function offStatus(): TunnelStatus {
  return { state: "off", stable: false, restarts: 0, log: [] };
}

function demo(): string {
  try {
    return typeof localStorage === "undefined" ? "" : (localStorage.getItem("devtoolsTunnelDemo") ?? "");
  } catch {
    return "";
  }
}

export function resetMockTunnel() {
  for (const t of timers) clearTimeout(t);
  timers = [];
  status = offStatus();
  savedHostname = "";
  started = false;
}

const now = () => new Date().toISOString();

function target(): string {
  const addr = mockEnvValue("APP_ADDR", "127.0.0.1:8080");
  return "http://" + addr.replace(/^(0\.0\.0\.0|):/, "127.0.0.1:");
}

function info(): TunnelInfo {
  const d = demo();
  const envHostname = mockEnvValue("ORB_TUNNEL_HOSTNAME");
  const token = d === "named" ? "CLOUDFLARE_TUNNEL_TOKEN" : mockEnvValue("CLOUDFLARE_TUNNEL_TOKEN") ? "CLOUDFLARE_TUNNEL_TOKEN" : undefined;
  const appEnv = d === "production" ? "production" : mockEnvValue("APP_ENV", "development");
  return {
    status: { ...status, log: [...(status.log ?? [])] },
    cloudflared: d === "no-cloudflared" ? { found: false, from_env: false, problem: "cloudflared isn't installed (not found on PATH)" } : { found: true, path: "/opt/homebrew/bin/cloudflared", from_env: false, version: "cloudflared version 2026.3.0 (built 2026-03-06T12:53:40Z)" },
    install,
    os: "darwin",
    hostname: envHostname || savedHostname || undefined,
    hostname_source: envHostname ? "ORB_TUNNEL_HOSTNAME" : savedHostname ? "settings" : undefined,
    token_source: token,
    app_env: appEnv,
    allowed: appEnv === "development",
    target: target(),
  };
}

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "Content-Type": "application/json" } });
}

function problem(statusCode: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 409: "Conflict", 422: "Unprocessable Entity" }[statusCode] ?? "Error", status: statusCode, code, detail };
  return new Response(JSON.stringify(p), { status: statusCode, headers: { "Content-Type": "application/problem+json" } });
}

function hostnameError(raw: string): { hostname?: string; detail?: string } {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!h) return { detail: "a named tunnel needs its public hostname, such as dev-api.example.com (or ORB_TUNNEL_HOSTNAME)" };
  if (/[/:@ ]/.test(h) || !h.includes(".") || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith(".trycloudflare.com")) return { detail: `"${raw}" isn't a named tunnel's public hostname` };
  return { hostname: h };
}

function logLine(level: string, text: string) {
  status = { ...status, log: [...(status.log ?? []).slice(-99), { time: now(), level, text: `${now()} ${level} ${text}` }] };
}

function start(mode: TunnelMode, hostname: string, publish: Publish, line: Line): Response {
  const i = info();
  if (mode !== "quick" && mode !== "named") return problem(400, "invalid_tunnel_mode", `unknown tunnel mode "${mode}": use quick or named`);
  if (!i.allowed) return problem(422, "not_development", `APP_ENV is ${i.app_env}: orb dev starts a tunnel only for development, because it puts the app on the internet`);
  if (!i.cloudflared.found) return problem(422, "cloudflared_missing", "cloudflared isn't installed; orb runs your own cloudflared and never downloads it. Install it:\n    macOS with Homebrew: brew install cloudflared");
  let host = "";
  if (mode === "named") {
    const h = hostnameError(hostname || i.hostname || "");
    if (!h.hostname) return problem(422, hostname || i.hostname ? "tunnel_hostname_invalid" : "tunnel_hostname_missing", h.detail!);
    if (!i.token_source) return problem(422, "tunnel_token_missing", "a named tunnel needs its token: set CLOUDFLARE_TUNNEL_TOKEN in .env (Cloudflare dashboard → Zero Trust → Networks → Tunnels → your tunnel → the value after --token in the install command), or CLOUDFLARE_TUNNEL_TOKEN_FILE");
    host = h.hostname;
    if (hostname && !mockEnvValue("ORB_TUNNEL_HOSTNAME")) savedHostname = host;
  }
  for (const t of timers) clearTimeout(t);
  timers = [];
  const restarts = started ? status.restarts + 1 : 0;
  started = true;
  status = { state: "starting", mode, stable: mode === "named", restarts, target: target(), pid: 48213 + restarts, started_at: now(), log: [], hostname: host || undefined, public_url: host ? `https://${host}` : undefined };
  line("orb", mode === "quick" ? `orb: starting a quick tunnel to ${status.target} (cloudflared; the URL follows)` : `orb: starting the named tunnel for https://${host} (cloudflared; its public hostname should point at ${status.target})`);
  logLine("INF", "Starting tunnel " + (mode === "quick" ? "(quick)" : "tunnelID=6ff42ae2-765d-4adf-8112-31c55c1551ef"));
  publish(status);
  timers.push(
    setTimeout(() => {
      if (mode === "quick") {
        status = { ...status, public_url: QUICK_URL, hostname: QUICK_URL.slice("https://".length) };
        logLine("INF", "|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |");
        logLine("INF", `|  ${QUICK_URL}  |`);
        line("orb", `orb: tunnel ${QUICK_URL} → ${status.target} (quick: the URL changes on every start)`);
      }
      publish(status);
    }, 700),
    setTimeout(() => {
      status = { ...status, state: "connected", connected_at: now() };
      logLine("INF", "Registered tunnel connection connIndex=0 connection=8d2c event=0 ip=198.41.200.13 location=ams01 protocol=quic");
      line("orb", `orb: tunnel connected: ${status.public_url} is on the internet while it runs (/_dev and the Dev Portal are not)`);
      publish(status);
    }, 1400),
    setTimeout(() => {
      status = { ...status, check: check() };
      publish(status);
    }, 2400),
  );
  return json(info(), 202);
}

function check(): Reachability {
  return { url: `${status.public_url}/livez`, ok: true, status: 200, detail: "reachable: /livez answered 200 through Cloudflare", checked_at: now(), latency_ms: 184 };
}

function stop(publish: Publish, line: Line) {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (status.state === "off") return;
  status = { ...status, state: "off", pid: undefined, connected_at: undefined, problem: undefined };
  line("orb", "orb: tunnel stopped");
  publish(status);
}

const providerRoutes: (Omit<TunnelCallback, "url" | "configured"> & { keys: string[] })[] = [
  { provider: "google", method: "GET", path: "/v1/auth/google/callback", label: "Authorized redirect URI", where: "Google Cloud Console → Google Auth Platform → Clients → your Web application client → Authorized redirect URIs", keys: ["GOOGLE_CLIENT_ID"] },
  { provider: "apple", method: "POST", path: "/v1/auth/apple/callback", label: "Return URL", where: "Apple Developer → Certificates, Identifiers & Profiles → Identifiers → your Services ID → Sign in with Apple → Configure → Return URLs (and the hostname under Domains and Subdomains)", keys: ["APPLE_SERVICES_ID"] },
  { provider: "apple", method: "POST", path: "/v1/auth/apple/notifications", label: "Server-to-server notification endpoint", where: "Apple Developer → Identifiers → your App ID → Sign in with Apple → Configure → Server-to-Server Notification Endpoint", keys: ["APPLE_SERVICES_ID", "APPLE_BUNDLE_IDS"] },
  { provider: "github", method: "GET", path: "/v1/auth/github/callback", label: "Authorization callback URL", where: "GitHub → Settings → Developer settings → OAuth Apps → an OAuth App for this hostname → Authorization callback URL (one URL per app)", keys: ["GITHUB_CLIENT_ID"] },
  { provider: "resend", method: "POST", path: "/v1/webhooks/resend", label: "Webhook endpoint", where: "Resend → Webhooks → Add endpoint (events email.bounced and email.complained); copy its signing secret to RESEND_WEBHOOK_SECRET (without it the route answers 404)", keys: ["RESEND_WEBHOOK_SECRET", "RESEND_API_KEY"] },
];

/** The setup as BuildSetup makes it, from the mock .env. */
export function mockTunnelSetup(s: TunnelStatus): TunnelSetup | undefined {
  const origin = s.public_url;
  if (!origin) return undefined;
  const host = origin.slice("https://".length);
  const changes: TunnelEnvChange[] = [];
  const set: Record<string, string> = {};
  const propose = (key: string, proposed: string, reason: string, optional = false) => {
    const current = mockEnvValue(key);
    if (current === proposed) return;
    changes.push({ key, current, proposed, reason, optional });
    if (!optional) set[key] = proposed;
  };
  propose("APP_PUBLIC_URL", origin, "Google, Apple and GitHub send people back to APP_PUBLIC_URL/v1/auth/<provider>/callback, and emails link to it");
  propose("WEBAUTHN_RP_ID", host, "passkeys belong to a domain (the relying party): the tunnel's hostname, served over HTTPS");
  propose("WEBAUTHN_ORIGINS", origin, "the browser origin that registers and uses passkeys must match WEBAUTHN_RP_ID; localhost origins can't be listed with it");
  const returnTo = mockEnvValue("AUTH_DEFAULT_RETURN_TO");
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(returnTo)) {
    const u = new URL(returnTo);
    const appPort = mockEnvValue("APP_ADDR", "127.0.0.1:8080").split(":").pop();
    if (u.port === appPort) propose("AUTH_DEFAULT_RETURN_TO", origin + u.pathname + u.search, "it points at the app on this machine; the same page through the tunnel works from anywhere");
    else propose("AUTH_DEFAULT_RETURN_TO", origin + "/docs", "it points at this machine, which a phone or a provider's redirect can't reach; the tunnel's API docs work instead (a local frontend isn't tunnelled)");
  }
  const cors = mockEnvValue("APP_CORS_ORIGINS")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (cors.length > 0 && !cors.includes(origin)) propose("APP_CORS_ORIGINS", [...cors, origin].join(","), "the app checks browser origins; list the tunnel's when a page served through it calls the API or is a sign-in return address", true);
  const proxies = mockEnvValue("APP_TRUSTED_PROXIES")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!(proxies.some((p) => p.startsWith("127.")) && proxies.some((p) => p.startsWith("::1")))) {
    const list = [...proxies];
    for (const p of ["127.0.0.1/32", "::1/128"]) if (!list.includes(p)) list.push(p);
    propose("APP_TRUSTED_PROXIES", list.join(","), "cloudflared connects from this machine and passes the visitor's address in X-Forwarded-For: trusting loopback gives rate limits, logs and audit events the visitor's address (the dev console still refuses forwarded requests)");
  }
  const callbacks: TunnelCallback[] = providerRoutes.map(({ keys, ...r }) => ({ ...r, url: origin + r.path, configured: keys.some((k) => mockEnvValue(k) !== "") }));
  const warnings: string[] = [];
  if (!s.stable) warnings.push("A quick tunnel's URL changes every time it starts: callbacks registered with Google, Apple or GitHub and passkeys created on it stop working next run. Use it for webhooks and trying the API from a phone; use a named tunnel for sign-in and passkeys.");
  warnings.push("While the tunnel runs, the app is on the internet: sign-in, public routes and anything a signed-in account can do. The dev console (/_dev) and the Dev Portal are not reachable through it.");
  return { public_url: origin, hostname: host, stable: s.stable, changes, set, callbacks, routes_known: true, warnings };
}

/** Answers `/_portal/api/tunnel…`, or undefined for other paths. */
export function mockTunnelFetch(p: string, method: string, body: BodyInit | null | undefined, publish: Publish, line: Line): Response | undefined {
  if (!p.startsWith("/_portal/api/tunnel")) return undefined;
  let input: Record<string, unknown> = {};
  if (typeof body === "string" && body !== "") {
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid_json", "the body must be JSON");
    }
  }
  if (p === "/_portal/api/tunnel" && method === "GET") return json(info());
  if (p === "/_portal/api/tunnel/start" && method === "POST") return start(String(input.mode ?? "") as TunnelMode, String(input.hostname ?? ""), publish, line);
  if (p === "/_portal/api/tunnel/stop" && method === "POST") {
    stop(publish, line);
    return json(info(), 202);
  }
  if (p === "/_portal/api/tunnel/restart" && method === "POST") {
    if (!started) return problem(409, "tunnel_not_connected", "no tunnel was started in this orb dev run");
    return start(status.mode ?? "quick", status.mode === "named" ? (status.hostname ?? "") : "", publish, line);
  }
  if (p === "/_portal/api/tunnel/check" && method === "POST") {
    if (status.state !== "connected") return problem(409, "tunnel_not_connected", "no tunnel is connected");
    status = { ...status, check: check() };
    publish(status);
    return json(status.check);
  }
  if (p === "/_portal/api/tunnel/setup" && method === "GET") {
    const setup = status.state === "connected" || status.state === "starting" ? mockTunnelSetup(status) : undefined;
    return setup ? json(setup) : problem(409, "tunnel_not_connected", "start a tunnel first: the configuration depends on its public URL");
  }
  if (p === "/_portal/api/tunnel/settings" && method === "PUT") {
    const h = hostnameError(String(input.hostname ?? ""));
    if (!h.hostname) return problem(422, "tunnel_hostname_invalid", h.detail!);
    savedHostname = h.hostname;
    return json({ hostname: h.hostname });
  }
  return problem(404, "not_found", `no portal endpoint ${method} ${p}`);
}
