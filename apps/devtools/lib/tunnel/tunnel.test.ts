import { describe, expect, it } from "vitest";
import type { TunnelCallback, TunnelEnvChange, TunnelInfo, TunnelStatus } from "../api/tunnel";
import { defaultTicked, envChangeFor, groupCallbacks, installStepsFor, normalizeHostname, startBlocker, stateLabel, stateTone } from "./tunnel";

const off: TunnelStatus = { state: "off", stable: false, restarts: 0, log: [] };

const info = (patch: Partial<TunnelInfo> = {}): TunnelInfo => ({
  status: off,
  cloudflared: { found: true, path: "/opt/homebrew/bin/cloudflared", from_env: false, version: "cloudflared version 2026.3.0" },
  install: [],
  os: "darwin",
  app_env: "development",
  allowed: true,
  ...patch,
});

describe("tunnel rules", () => {
  it("normalizes a hostname as orb does", () => {
    expect(normalizeHostname(" HTTPS://Dev-API.Example.com/ ")).toEqual({ hostname: "dev-api.example.com" });
    expect(normalizeHostname("tunnel.example.org.")).toEqual({ hostname: "tunnel.example.org" });
    for (const bad of ["", "example", "localhost", "app.localhost", "127.0.0.1", "dev.example.com:8443", "https://dev.example.com/x", "abc.trycloudflare.com", "bad_label.example.com", "-x.example.com", "a..b.com"]) {
      expect(normalizeHostname(bad).error, bad).toBeTruthy();
    }
  });

  it("says why a tunnel can't start", () => {
    expect(startBlocker(info(), "quick", "")).toBeNull();
    expect(startBlocker(info({ cloudflared: { found: false, from_env: false } }), "quick", "")).toMatch(/Install cloudflared/);
    expect(startBlocker(info({ allowed: false, app_env: "production" }), "quick", "")).toMatch(/development only/);
    expect(startBlocker(info({ status: { ...off, state: "starting" } }), "quick", "")).toMatch(/starting/);
    expect(startBlocker(info(), "named", "dev.example.com")).toMatch(/CLOUDFLARE_TUNNEL_TOKEN/);
    expect(startBlocker(info({ token_source: "CLOUDFLARE_TUNNEL_TOKEN", token_problem: "this isn't a Cloudflare tunnel token" }), "named", "dev.example.com")).toMatch(/isn't a Cloudflare/);
    expect(startBlocker(info({ token_source: "CLOUDFLARE_TUNNEL_TOKEN" }), "named", "")).toMatch(/Hostname/);
    expect(startBlocker(info({ token_source: "CLOUDFLARE_TUNNEL_TOKEN", hostname: "saved.example.com" }), "named", "")).toBeNull();
    expect(startBlocker(info({ token_source: "CLOUDFLARE_TUNNEL_TOKEN_FILE" }), "named", "dev.example.com")).toBeNull();
  });

  it("labels states", () => {
    expect(stateTone("connected")).toBe("ok");
    expect(stateTone("failed")).toBe("danger");
    expect(stateLabel({ ...off, state: "starting", mode: "quick" })).toMatch(/URL/);
    expect(stateLabel({ ...off, state: "starting", mode: "named", public_url: "https://dev.example.com" })).toMatch(/connecting/);
    expect(stateLabel({ ...off, state: "connected", check: { url: "", ok: false, detail: "", checked_at: "", latency_ms: 0 } })).toMatch(/not reachable/);
  });

  it("puts this machine's install steps first", () => {
    const steps = [
      { os: "darwin", label: "Homebrew", command: "brew install cloudflared" },
      { os: "linux", label: "apt", url: "https://pkg.cloudflare.com/index.html" },
      { os: "windows", label: "winget", command: "winget install --id Cloudflare.cloudflared" },
      { os: "", label: "Every package", url: "https://developers.cloudflare.com/" },
    ];
    const { mine, other } = installStepsFor("windows", steps);
    expect(mine.map((s) => s.label)).toEqual(["winget", "Every package"]);
    expect(other.map((s) => s.label)).toEqual(["Homebrew", "apt"]);
  });

  it("builds the env editor's change from the ticked proposals", () => {
    const changes: TunnelEnvChange[] = [
      { key: "APP_PUBLIC_URL", current: "", proposed: "https://dev.example.com", reason: "", optional: false },
      { key: "APP_CORS_ORIGINS", current: "http://localhost:5173", proposed: "http://localhost:5173,https://dev.example.com", reason: "", optional: true },
    ];
    const ticked = defaultTicked(changes);
    expect([...ticked]).toEqual(["APP_PUBLIC_URL"]);
    expect(envChangeFor(changes, ticked)).toEqual({ set: { APP_PUBLIC_URL: "https://dev.example.com" } });
    ticked.add("APP_CORS_ORIGINS");
    ticked.delete("APP_PUBLIC_URL");
    expect(envChangeFor(changes, ticked)).toEqual({ set: { APP_CORS_ORIGINS: "http://localhost:5173,https://dev.example.com" } });
  });

  it("groups provider addresses", () => {
    const cb = (provider: string, path: string, configured = false): TunnelCallback => ({ provider, label: path, url: "https://h" + path, method: "GET", path, where: "", configured });
    const groups = groupCallbacks([cb("resend", "/v1/webhooks/resend"), cb("apple", "/a", true), cb("google", "/g"), cb("apple", "/n"), cb("acme", "/x")]);
    expect(groups.map((g) => `${g.name}:${g.items.length}:${g.configured}`)).toEqual(["Google:1:false", "Apple:2:true", "Resend webhooks:1:false", "acme:1:false"]);
  });
});
