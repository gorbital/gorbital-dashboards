import { beforeEach, describe, expect, it } from "vitest";
import type { EnvChangeResult, EnvList, EnvReveal } from "../env";
import type { Problem } from "../types";
import { looksSecret, mockEnvFetch, mockEnvText, resetMockEnv } from "./env";

const get = async <T>(path: string): Promise<T> => {
  const res = mockEnvFetch(new URL(path, "http://127.0.0.1:3100"), "GET");
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};
const put = (body: unknown) => mockEnvFetch(new URL("/_portal/api/env", "http://127.0.0.1:3100"), "PUT", { body: JSON.stringify(body) });

beforeEach(() => resetMockEnv());

describe("the mock env editor", () => {
  it("lists the example's keys in order, then the extras, with descriptions and masks", async () => {
    const list = await get<EnvList>("/_portal/api/env");
    expect(list.file).toBe(".env");
    expect(list.example).toBe(".env.example");
    const keys = list.entries.map((e) => e.key);
    expect(keys.slice(0, 3)).toEqual(["APP_ENV", "APP_ADDR", "APP_LOG_LEVEL"]);
    expect(keys[keys.length - 1]).toBe("IMPORT_BATCH_SIZE");
    const byKey = Object.fromEntries(list.entries.map((e) => [e.key, e]));
    expect(byKey.APP_LOG_LEVEL).toMatchObject({ value: "debug", set: true, example: "info", in_example: true, missing: false, secret: false });
    expect(byKey.APP_LOG_LEVEL.description).toBe("debug, info, warn or error.");
    expect(byKey.APP_LOG_LEVEL.line).toBeGreaterThan(0);
    expect(byKey.DATABASE_URL).toMatchObject({ secret: true, value: "po••••••••le" });
    expect(byKey.GOOGLE_CLIENT_SECRET.value).toBe("GO••••••••ba");
    expect(byKey.RESEND_API_KEY).toMatchObject({ secret: true, set: true, value: "" });
    expect(byKey.GITHUB_CLIENT_ID).toMatchObject({ set: false, missing: true, in_example: true, line: 0 });
    expect(byKey.IMPORT_BATCH_SIZE).toMatchObject({ value: "500", in_example: false, missing: false, description: "Local only: a bigger pool while profiling the importer." });
    expect(list.entries.filter((e) => e.missing).map((e) => e.key)).toEqual(["APP_PUBLIC_URL", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);
  });

  it("decides secrets by name like orb dev", () => {
    for (const k of ["DATABASE_URL", "RESEND_API_KEY", "GOOGLE_CLIENT_SECRET", "AUTH_ENCRYPTION_KEYS", "DEV_CONSOLE_TOKEN", "SMTP_PASSWORD", "REDIS_DSN"]) expect(looksSecret(k)).toBe(true);
    for (const k of ["APP_ENV", "APP_ADDR", "POSTGRES_PORT", "MAIL_DELIVERY"]) expect(looksSecret(k)).toBe(false);
  });

  it("reveals a key's value, and 404s for one that isn't in .env", async () => {
    const r = await get<EnvReveal>("/_portal/api/env/DATABASE_URL");
    expect(r).toEqual({ key: "DATABASE_URL", value: "postgres://acme:acme@127.0.0.1:5432/acme_api?sslmode=disable" });
    const missing = mockEnvFetch(new URL("/_portal/api/env/GITHUB_CLIENT_ID", "http://x"), "GET");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as Problem).code).toBe("env_key_not_found");
  });

  it("sets an existing key in place, keeping the comment above it", async () => {
    const res = put({ set: { APP_LOG_LEVEL: "info" } });
    expect(res.status).toBe(200);
    const out = (await res.json()) as EnvChangeResult;
    expect(out.restart_needed).toBe(true);
    expect(out.entries.find((e) => e.key === "APP_LOG_LEVEL")?.value).toBe("info");
    expect(mockEnvText()).toContain("# debug, info, warn or error.\nAPP_LOG_LEVEL=info\n");
  });

  it("adds a missing key after its example comment, and a new key at the end", async () => {
    await put({ set: { GITHUB_CLIENT_ID: "Iv1.abc", P9_TEST: "1", QUOTED: "a b # c" } }).json();
    const text = mockEnvText();
    expect(text).toMatch(/\n# GitHub sign-in: the OAuth app's client\. Empty leaves the provider off\.\nGITHUB_CLIENT_ID=Iv1\.abc\n/);
    expect(text.endsWith('P9_TEST=1\nQUOTED="a b # c"\n')).toBe(true);
    const list = await get<EnvList>("/_portal/api/env");
    expect(list.entries.find((e) => e.key === "GITHUB_CLIENT_ID")).toMatchObject({ set: true, missing: false, value: "Iv1.abc" });
    expect(list.entries.find((e) => e.key === "P9_TEST")).toMatchObject({ set: true, in_example: false, value: "1" });
    expect(list.entries.find((e) => e.key === "QUOTED")?.value).toBe("a b # c");
  });

  it("removes a key's line on unset, leaving an example key flagged missing", async () => {
    const out = (await put({ unset: ["GOOGLE_CLIENT_ID", "IMPORT_BATCH_SIZE"] }).json()) as EnvChangeResult;
    expect(out.entries.find((e) => e.key === "GOOGLE_CLIENT_ID")).toMatchObject({ set: false, missing: true });
    expect(out.entries.some((e) => e.key === "IMPORT_BATCH_SIZE")).toBe(false);
    expect(mockEnvText()).not.toContain("IMPORT_BATCH_SIZE");
  });

  it("refuses bad names and multi-line values with invalid_env_change", async () => {
    for (const body of [{ set: { "9X": "1" } }, { set: { "A-B": "1" } }, { set: { OK: "a\nb" } }, { unset: ["no way"] }]) {
      const res = put(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as Problem).code).toBe("invalid_env_change");
    }
    expect(mockEnvFetch(new URL("/_portal/api/env", "http://x"), "PUT", { body: "{" }).status).toBe(400);
  });
});
