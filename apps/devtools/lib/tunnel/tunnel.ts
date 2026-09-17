/**
 * The Tunnel screen's rules, without React: what can start, the hostname
 * as orb normalizes it (cli/internal/tunnel.NormalizeHostname), the install
 * steps for this machine, the .env change the ticked proposals make, and
 * the provider addresses grouped for display.
 */

import type { InstallStep, TunnelCallback, TunnelEnvChange, TunnelInfo, TunnelMode, TunnelState, TunnelStatus } from "../api/tunnel";

export type Tone = "ok" | "warn" | "danger" | "info" | "muted";

export function stateTone(state: TunnelState): Tone {
  switch (state) {
    case "connected":
      return "ok";
    case "starting":
    case "stopping":
      return "info";
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

/** A short phrase for the status line. */
export function stateLabel(s: TunnelStatus): string {
  switch (s.state) {
    case "off":
      return "off";
    case "starting":
      return s.mode === "quick" && !s.public_url ? "starting: waiting for cloudflared's URL" : "starting: connecting to Cloudflare";
    case "connected":
      return s.check ? (s.check.ok ? "connected and reachable" : "connected, not reachable yet") : "connected";
    case "stopping":
      return "stopping";
    case "failed":
      return "failed";
  }
}

const QUICK = /\.trycloudflare\.com$/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** The hostname orb would use for what a developer typed, or why it refuses it. */
export function normalizeHostname(raw: string): { hostname: string; error?: undefined } | { hostname?: undefined; error: string } {
  let h = raw.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\.$/, "");
  if (h === "") return { error: "the tunnel's public hostname, such as dev-api.example.com" };
  if (h.length > 253 || /[/:@?#[\] ]/.test(h)) return { error: "only the hostname, such as dev-api.example.com" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return { error: "an IP address: give the DNS name on your Cloudflare zone" };
  if (h === "localhost" || h.endsWith(".localhost")) return { error: "this machine: give the tunnel's public hostname" };
  if (QUICK.test(h)) return { error: "a quick tunnel's name, which changes on every run" };
  const labels = h.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { error: "not a valid public hostname" };
  return { hostname: h };
}

/** Why Start is disabled for this mode, or null when it can start. */
export function startBlocker(info: TunnelInfo, mode: TunnelMode, hostname: string): string | null {
  if (!info.cloudflared.found) return "Install cloudflared first";
  if (!info.allowed) return `APP_ENV is ${info.app_env}: tunnels are for development only`;
  if (info.status.state === "starting" || info.status.state === "stopping") return `The tunnel is ${info.status.state}`;
  if (mode === "named") {
    if (!info.token_source) return "Set CLOUDFLARE_TUNNEL_TOKEN in .env first";
    if (info.token_problem) return info.token_problem;
    const h = normalizeHostname(hostname || info.hostname || "");
    if (h.error) return `Hostname: ${h.error}`;
  }
  return null;
}

/** Install steps for this machine first (with the steps for every platform), then the others. */
export function installStepsFor(os: string, steps: InstallStep[]): { mine: InstallStep[]; other: InstallStep[] } {
  const mine = steps.filter((s) => s.os === os || s.os === "");
  const other = steps.filter((s) => s.os !== os && s.os !== "");
  return { mine, other };
}

export const OS_NAMES: Record<string, string> = { darwin: "macOS", linux: "Linux", windows: "Windows" };

/** The required proposals, ticked by default; optional ones wait for the developer. */
export function defaultTicked(changes: TunnelEnvChange[]): Set<string> {
  return new Set(changes.filter((c) => !c.optional).map((c) => c.key));
}

/** The env editor's `PUT env` body for the ticked proposals. */
export function envChangeFor(changes: TunnelEnvChange[], ticked: Set<string>): { set: Record<string, string> } {
  const set: Record<string, string> = {};
  for (const c of changes) if (ticked.has(c.key)) set[c.key] = c.proposed;
  return { set };
}

const PROVIDERS: { id: string; name: string }[] = [
  { id: "google", name: "Google" },
  { id: "apple", name: "Apple" },
  { id: "github", name: "GitHub" },
  { id: "resend", name: "Resend webhooks" },
];

/** Provider addresses grouped in a stable order, unknown providers last. */
export function groupCallbacks(callbacks: TunnelCallback[]): { id: string; name: string; configured: boolean; items: TunnelCallback[] }[] {
  const known = PROVIDERS.map((p) => ({ ...p, items: callbacks.filter((c) => c.provider === p.id) }));
  const others = [...new Set(callbacks.map((c) => c.provider).filter((p) => !PROVIDERS.some((k) => k.id === p)))].map((id) => ({ id, name: id, items: callbacks.filter((c) => c.provider === id) }));
  return [...known, ...others].filter((g) => g.items.length > 0).map((g) => ({ ...g, configured: g.items.some((i) => i.configured) }));
}

/** The environment variable's value for display: "(unset)" when empty. */
export function shownValue(v: string): string {
  return v === "" ? "(unset)" : v;
}
