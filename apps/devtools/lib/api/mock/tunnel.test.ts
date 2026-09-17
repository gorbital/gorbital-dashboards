import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, resetMock } from "./index";
import { parseEvent } from "../client";
import type { TunnelInfo, TunnelSetup } from "../tunnel";
import type { Problem } from "../types";

const H = { "X-Orb-Portal": "1", "Content-Type": "application/json" };

/** Awaits a mock request under fake timers: the mock adds latency with setTimeout. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  void p.finally(() => (done = true)).catch(() => {});
  while (!done) await vi.advanceTimersByTimeAsync(20);
  return p;
}
const get = (path: string) => settle(mockFetch(path));
const send = (method: string, path: string, body?: unknown) => settle(mockFetch(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) }));

const store = new Map<string, string>();
beforeEach(() => {
  resetMock();
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the tunnel in mock mode", () => {
  it("starts a quick tunnel, connects, proposes .env and stops", async () => {
    let info = (await (await get("/_portal/api/tunnel")).json()) as TunnelInfo;
    expect(info.cloudflared.found).toBe(true);
    expect(info.status.state).toBe("off");
    expect(info.allowed).toBe(true);

    let res = await send("GET", "/_portal/api/tunnel/setup");
    expect(res.status).toBe(409);

    res = await send("POST", "/_portal/api/tunnel/start", { mode: "quick" });
    expect(res.status).toBe(202);
    expect(((await res.json()) as TunnelInfo).status.state).toBe("starting");
    await vi.advanceTimersByTimeAsync(3000);
    info = (await (await get("/_portal/api/tunnel")).json()) as TunnelInfo;
    expect(info.status).toMatchObject({ state: "connected", mode: "quick", stable: false, public_url: "https://quiet-harbor-orbit-demo.trycloudflare.com" });
    expect(info.status.check?.ok).toBe(true);

    const setup = (await (await get("/_portal/api/tunnel/setup")).json()) as TunnelSetup;
    expect(setup.set).toMatchObject({ APP_PUBLIC_URL: setup.public_url, WEBAUTHN_RP_ID: setup.hostname, WEBAUTHN_ORIGINS: setup.public_url, APP_TRUSTED_PROXIES: "127.0.0.1/32,::1/128" });
    expect(setup.changes?.find((c) => c.key === "APP_CORS_ORIGINS")).toMatchObject({ optional: true, proposed: "https://app.acme.test,http://localhost:5173,https://quiet-harbor-orbit-demo.trycloudflare.com" });
    expect(setup.callbacks?.map((c) => c.url)).toContain("https://quiet-harbor-orbit-demo.trycloudflare.com/v1/auth/google/callback");
    expect(setup.warnings?.[0]).toMatch(/changes every time/);

    // Applying through the env editor makes the proposal disappear.
    res = await send("PUT", "/_portal/api/env", { set: setup.set });
    expect(res.status).toBe(200);
    const again = (await (await get("/_portal/api/tunnel/setup")).json()) as TunnelSetup;
    expect(again.changes?.map((c) => c.key)).toEqual(["APP_CORS_ORIGINS"]);

    res = await send("POST", "/_portal/api/tunnel/stop");
    expect(((await res.json()) as TunnelInfo).status.state).toBe("off");
  });

  it("streams tunnel events", async () => {
    const res = await get("/_portal/api/events");
    const reader = res.body!.getReader();
    await send("POST", "/_portal/api/tunnel/start", { mode: "quick" });
    await vi.advanceTimersByTimeAsync(1500);
    let text = "";
    for (let i = 0; i < 20 && !text.includes('"state":"connected"'); i++) {
      const { value } = await reader.read();
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    const block = text.split("\n\n").find((b) => b.startsWith("event: tunnel") && b.includes('"state":"connected"'));
    expect(block).toBeDefined();
    const data = block!.split("\n").find((l) => l.startsWith("data: "))!.slice(6);
    const e = parseEvent("tunnel", data);
    expect(e).toMatchObject({ type: "tunnel", tunnel: { state: "connected" } });
  });

  it("refuses what orb refuses", async () => {
    let res = await send("POST", "/_portal/api/tunnel/start", { mode: "named", hostname: "dev.example.com" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).code).toBe("tunnel_token_missing");
    res = await send("POST", "/_portal/api/tunnel/start", { mode: "public" });
    expect(res.status).toBe(400);
    res = await send("PUT", "/_portal/api/tunnel/settings", { hostname: "localhost" });
    expect(res.status).toBe(422);

    store.set("devtoolsTunnelDemo", "no-cloudflared");
    res = await send("POST", "/_portal/api/tunnel/start", { mode: "quick" });
    expect(((await res.json()) as Problem).code).toBe("cloudflared_missing");
    const info = (await (await get("/_portal/api/tunnel")).json()) as TunnelInfo;
    expect(info.cloudflared.found).toBe(false);
    expect(info.install.some((s) => s.command === "brew install cloudflared")).toBe(true);

    store.set("devtoolsTunnelDemo", "production");
    res = await send("POST", "/_portal/api/tunnel/start", { mode: "quick" });
    expect(((await res.json()) as Problem).code).toBe("not_development");
  });

  it("starts a named tunnel with a saved hostname and never shows a token", async () => {
    store.set("devtoolsTunnelDemo", "named");
    let res = await send("PUT", "/_portal/api/tunnel/settings", { hostname: "HTTPS://Dev.Example.com/" });
    expect(await res.json()).toEqual({ hostname: "dev.example.com" });
    res = await send("POST", "/_portal/api/tunnel/start", { mode: "named" });
    expect(res.status).toBe(202);
    await vi.advanceTimersByTimeAsync(3000);
    const info = (await (await get("/_portal/api/tunnel")).json()) as TunnelInfo;
    expect(info.status).toMatchObject({ state: "connected", stable: true, public_url: "https://dev.example.com" });
    expect(info.token_source).toBe("CLOUDFLARE_TUNNEL_TOKEN");
    expect(JSON.stringify(info)).not.toMatch(/eyJ/);
    const setup = (await (await get("/_portal/api/tunnel/setup")).json()) as TunnelSetup;
    expect(setup.warnings?.some((w) => /changes every time/.test(w))).toBe(false);
    res = await send("POST", "/_portal/api/tunnel/restart");
    expect(((await res.json()) as TunnelInfo).status.restarts).toBe(1);
  });
});
