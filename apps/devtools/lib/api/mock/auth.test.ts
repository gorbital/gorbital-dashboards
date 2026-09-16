import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { OpsImpersonation, OpsTOTPEnrollment, OpsUser, OpsUserDetail, OpsUserList, RateLimiter, SignInMethod } from "../auth";
import type { Problem } from "../types";

const H = { "X-Orb-Portal": "1", "Content-Type": "application/json" };
const get = (path: string) => mockFetch(`/_portal/app${path}`);
const send = (method: string, path: string, body?: unknown) => mockFetch(`/_portal/app${path}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => resetMock());

describe("mock /ops/auth", () => {
  it("lists accounts newest first, searches, and pages with a cursor", async () => {
    const all = (await (await get("/ops/auth/users")).json()) as OpsUserList;
    expect(all.users.length).toBe(5);
    expect(all.next_cursor).toBeUndefined();
    expect(all.users[0].email).toBe("ada@acme.dev");
    expect(all.users.find((u) => u.banned_at)?.banned_reason).toMatch(/credential stuffing/);

    const q = (await (await get("/ops/auth/users?q=GRACE")).json()) as OpsUserList;
    expect(q.users.map((u) => u.email)).toEqual(["grace@northwind.dev"]);

    const p1 = (await (await get("/ops/auth/users?limit=2")).json()) as OpsUserList;
    expect(p1.users.length).toBe(2);
    expect(p1.next_cursor).toBe(p1.users[1].id);
    const p2 = (await (await get(`/ops/auth/users?limit=2&cursor=${p1.next_cursor}`)).json()) as OpsUserList;
    expect(p2.users[0].id).not.toBe(p1.users[1].id);
    expect(p2.users.length).toBe(2);
    const bad = await get("/ops/auth/users?cursor=nope");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Problem).code).toBe("invalid_cursor");
  });

  it("creates an account with the app's refusals, and deletes it", async () => {
    expect((await send("POST", "/ops/auth/users", { email: "bad", password: "correct horse battery staple" })).status).toBe(422);
    expect((await send("POST", "/ops/auth/users", { email: "new@example.com", password: "short" })).status).toBe(422);
    expect(((await (await send("POST", "/ops/auth/users", { email: "admin@example.com", password: "correct horse battery staple" })).json()) as Problem).code).toBe("email_taken");
    const res = await send("POST", "/ops/auth/users", { email: "New@Example.com", password: "correct horse battery staple" });
    expect(res.status).toBe(201);
    const u = (await res.json()) as OpsUser;
    expect(u).toMatchObject({ email: "new@example.com", email_verified: false, roles: [], has_password: true });
    const d = (await (await get(`/ops/auth/users/${u.id}`)).json()) as OpsUserDetail;
    expect(d.codes.map((c) => c.purpose)).toEqual(["verify_email"]);
    expect(d.mfa).toEqual({ totp: false, recovery_codes: 0, passkeys: 0 });
    expect((await send("DELETE", `/ops/auth/users/${u.id}`)).status).toBe(204);
    expect((await get(`/ops/auth/users/${u.id}`)).status).toBe(404);
  });

  it("verifies, bans and unbans, and refuses impersonating a banned account", async () => {
    const ada = "usr_ada2kxw4bmz5ar5ut5pof4a";
    expect((await send("POST", `/ops/auth/users/${ada}/verify-email`)).status).toBe(204);
    let d = (await (await get(`/ops/auth/users/${ada}`)).json()) as OpsUserDetail;
    expect(d.user.email_verified).toBe(true);
    expect(d.codes).toEqual([]);

    const grace = "usr_grace7q2kxw4bmz5ar5ut5pof";
    expect((await send("POST", `/ops/auth/users/${grace}/ban`, { reason: "spam" })).status).toBe(204);
    d = (await (await get(`/ops/auth/users/${grace}`)).json()) as OpsUserDetail;
    expect(d.user.banned_reason).toBe("spam");
    expect(d.sessions).toEqual([]);
    const imp = await send("POST", `/ops/auth/users/${grace}/impersonate`, {});
    expect(imp.status).toBe(403);
    expect(((await imp.json()) as Problem).code).toBe("account_banned");
    expect((await send("POST", `/ops/auth/users/${grace}/unban`)).status).toBe(204);
    d = (await (await get(`/ops/auth/users/${grace}`)).json()) as OpsUserDetail;
    expect(d.user.banned_at).toBeUndefined();
  });

  it("grants and revokes roles with the app's rules", async () => {
    const ada = "usr_ada2kxw4bmz5ar5ut5pof4a";
    expect((await send("POST", `/ops/auth/users/${ada}/roles`, { role: "ops_viewer" })).status).toBe(422);
    await send("POST", `/ops/auth/users/${ada}/verify-email`);
    expect((await send("POST", `/ops/auth/users/${ada}/roles`, { role: "nope" })).status).toBe(422);
    const granted = (await (await send("POST", `/ops/auth/users/${ada}/roles`, { role: "ops_viewer" })).json()) as OpsUser;
    expect(granted.roles).toEqual(["ops_viewer"]);
    const revoked = (await (await send("DELETE", `/ops/auth/users/${ada}/roles/ops_viewer`)).json()) as OpsUser;
    expect(revoked.roles).toEqual([]);
  });

  it("ends sessions, removes passkeys and identities", async () => {
    const grace = "usr_grace7q2kxw4bmz5ar5ut5pof";
    expect((await send("DELETE", `/ops/auth/users/${grace}/sessions/ses_grace1webkit2024`)).status).toBe(204);
    expect((await send("DELETE", `/ops/auth/users/${grace}/sessions/ses_grace1webkit2024`)).status).toBe(404);
    expect(await (await send("DELETE", `/ops/auth/users/${grace}/sessions`)).json()).toEqual({ revoked: 1 });
    expect((await send("DELETE", `/ops/auth/users/${grace}/identities/idn_google7q2kxw4bmz5a`)).status).toBe(204);
    const admin = "usr_3frf6yknqvo4wx5ar5ut5pof4a";
    expect((await send("DELETE", `/ops/auth/users/${admin}/passkeys/pky_nbswy3dpeb3w64tmmq`)).status).toBe(204);
    const d = (await (await get(`/ops/auth/users/${admin}`)).json()) as OpsUserDetail;
    expect(d.passkeys).toEqual([]);
    expect(d.mfa.passkeys).toBe(0);
  });

  it("turns on an authenticator app once, and resets every second factor", async () => {
    const grace = "usr_grace7q2kxw4bmz5ar5ut5pof";
    const res = await send("POST", `/ops/auth/users/${grace}/mfa/enroll`);
    expect(res.status).toBe(201);
    const e = (await res.json()) as OpsTOTPEnrollment;
    expect(e.secret).toMatch(/^[A-Z2-7]+$/);
    expect(e.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(e.recovery_codes.length).toBe(10);
    expect((await send("POST", `/ops/auth/users/${grace}/mfa/enroll`)).status).toBe(409);
    let d = (await (await get(`/ops/auth/users/${grace}`)).json()) as OpsUserDetail;
    expect(d.mfa.totp).toBe(true);
    expect((await send("POST", `/ops/auth/users/${grace}/mfa/reset`)).status).toBe(204);
    d = (await (await get(`/ops/auth/users/${grace}`)).json()) as OpsUserDetail;
    expect(d.mfa).toEqual({ totp: false, recovery_codes: 0, passkeys: 0 });
    expect(d.sessions).toEqual([]);
  });

  it("impersonates with a token shown once and a session that then exists", async () => {
    const grace = "usr_grace7q2kxw4bmz5ar5ut5pof";
    const res = await send("POST", `/ops/auth/users/${grace}/impersonate`, { mfa_verified: true });
    expect(res.status).toBe(201);
    const r = (await res.json()) as OpsImpersonation;
    expect(r.token).toMatch(/^sk_mock_/);
    expect(r.mfa_verified).toBe(true);
    expect(r.session.mfa_verified).toBe(true);
    expect(r.user.id).toBe(grace);
    const d = (await (await get(`/ops/auth/users/${grace}`)).json()) as OpsUserDetail;
    expect(d.sessions[0].id).toBe(r.session.id);
  });

  it("lists the sign-in methods and the rate limiters, and resets a budget once", async () => {
    const methods = ((await (await get("/ops/auth/providers")).json()) as { methods: SignInMethod[] }).methods;
    expect(methods.find((m) => m.key === "apple")).toMatchObject({ enabled: false, missing: ["APPLE_TEAM_ID", "APPLE_SERVICES_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_FILE"] });
    const limiters = ((await (await get("/ops/auth/rate-limits")).json()) as { limiters: RateLimiter[] }).limiters;
    expect(limiters.map((l) => l.name)).toEqual(["auth_ip", "auth_login", "auth_code"]);
    expect(await (await send("POST", "/ops/auth/rate-limits/reset", { name: "auth_ip", key: "198.51.100.23" })).json()).toEqual({ reset: true });
    expect(await (await send("POST", "/ops/auth/rate-limits/reset", { name: "auth_ip", key: "198.51.100.23" })).json()).toEqual({ reset: false });
    const bad = await send("POST", "/ops/auth/rate-limits/reset", { name: "nope", key: "x" });
    expect(bad.status).toBe(404);
    expect(((await bad.json()) as Problem).code).toBe("rate_limiter_not_found");
  });

  it("answers 404 user_not_found for an unknown account and 404 for the rest", async () => {
    const res = await get("/ops/auth/users/usr_nobody");
    expect(res.status).toBe(404);
    expect(((await res.json()) as Problem).code).toBe("user_not_found");
    expect((await get("/ops/auth/nothing")).status).toBe(404);
  });
});
