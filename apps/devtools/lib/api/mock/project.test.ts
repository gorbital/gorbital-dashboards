import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { EnvChangeResult, EnvList } from "../env";
import type { ApiKey, CreatedApiKey, ProjectSettings, ServiceAccount } from "../project";
import type { Problem } from "../types";

const H = { "X-Orb-Portal": "1", "Content-Type": "application/json" };
const send = (method: string, path: string, body?: unknown) => mockFetch(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => resetMock());

describe("project settings in mock mode", () => {
  it("describes the app from .env with the key behind each value", async () => {
    const p = (await (await mockFetch("/_portal/api/project")).json()) as ProjectSettings;
    expect(p.name).toBe("acme-api");
    expect(p.git).toBe(true);
    expect(p.app).toEqual({ addr: "127.0.0.1:8080", url: "http://127.0.0.1:8080", key: "APP_ADDR" });
    expect(p.database_settings).toMatchObject({ configured: true, host: "127.0.0.1:55432/acme_api", key: "DATABASE_URL", port_key: "POSTGRES_PORT" });
    expect(p.database_settings.host).not.toContain("secret");
    expect(p.cors.origins).toEqual(["https://app.acme.test", "http://localhost:5173"]);
    expect(p.logging).toEqual({ level: "info", format: "json (orb dev)", keys: ["APP_LOG_LEVEL", "APP_LOG_FORMAT"] });
    expect(p.danger?.map((d) => d.method + " " + d.path)).toEqual(["POST /_portal/api/project/reset-database", "DELETE /_portal/api/logs", "DELETE /_portal/api/mail", "DELETE /_portal/api/db/sql/history"]);
    expect(p.danger?.find((d) => d.path.endsWith("/mail"))?.available).toBe(false);
  });

  it("edits .env through the env editor and reports the restart", async () => {
    let res = await send("PUT", "/_portal/api/env", { set: { APP_LOG_LEVEL: "debug", APP_CORS_ORIGINS: "" }, unset: ["APP_DOCS_ENABLED"] });
    expect(res.status).toBe(200);
    const r = (await res.json()) as EnvChangeResult;
    expect(r.restart_needed).toBe(true);
    expect(r.entries.find((e) => e.key === "APP_DOCS_ENABLED")).toMatchObject({ set: false, missing: true });
    const p = (await (await mockFetch("/_portal/api/project")).json()) as ProjectSettings;
    expect(p.logging.level).toBe("debug");
    expect(p.cors.origins).toEqual([]);
    const env = (await (await mockFetch("/_portal/api/env")).json()) as EnvList;
    expect(env.entries.find((e) => e.key === "DATABASE_URL")).toMatchObject({ secret: true, value: "••••••••" });
    res = await send("PUT", "/_portal/api/env", { set: { "1BAD": "x" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Problem).code).toBe("invalid_env_change");
  });

  it("answers the danger zone", async () => {
    let res = await send("POST", "/_portal/api/project/reset-database");
    expect(res.status).toBe(202);
    expect(((await res.json()) as { detail: string }).detail).toMatch(/schema was dropped/);
    res = await send("DELETE", "/_portal/api/mail");
    expect(res.status).toBe(204);
    res = await send("DELETE", "/_portal/api/db/sql/history");
    expect(res.status).toBeLessThan(300);
    res = await send("DELETE", "/_portal/api/logs");
    expect(res.status).toBeLessThan(300);
  });

  it("manages service accounts and shows a key once", async () => {
    let res = await mockFetch("/_portal/app/ops/service-accounts");
    const list = ((await res.json()) as { service_accounts: ServiceAccount[] }).service_accounts;
    expect(list.map((a) => a.name)).toEqual(["Billing sync", "CI deploys"]);
    res = await send("POST", "/_portal/app/ops/service-accounts", { name: "Billing sync" });
    expect(res.status).toBe(409);
    res = await send("POST", "/_portal/app/ops/service-accounts", { name: "Backups", roles: ["ops_viewer"] });
    expect(res.status).toBe(201);
    const a = (await res.json()) as ServiceAccount;
    res = await send("POST", `/_portal/app/ops/service-accounts/${a.id}/keys`, { name: "nightly", expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    expect(res.status).toBe(201);
    const created = (await res.json()) as CreatedApiKey;
    expect(created.key.startsWith(created.api_key.prefix)).toBe(true);
    res = await send("POST", `/_portal/app/ops/service-accounts/${a.id}/keys`, { name: "soon", expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(res.status).toBe(422);
    res = await send("DELETE", `/_portal/app/ops/service-accounts/${a.id}/keys/${created.api_key.id}`);
    expect(res.status).toBe(204);
    const keys = ((await (await mockFetch(`/_portal/app/ops/service-accounts/${a.id}/keys`)).json()) as { api_keys: ApiKey[] }).api_keys;
    expect(keys[0].status).toBe("revoked");
    res = await send("DELETE", `/_portal/app/ops/service-accounts/${a.id}`);
    expect(res.status).toBe(204);
    res = await mockFetch(`/_portal/app/ops/service-accounts/${a.id}`);
    expect(res.status).toBe(404);
  });
});
