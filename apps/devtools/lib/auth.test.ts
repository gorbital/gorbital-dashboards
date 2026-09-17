import { describe, expect, it } from "vitest";
import { codePurpose, codeState, grantableRoles, lastSeen, limiterKeyExample, mergeUserPages, revocableRoles } from "./auth";
import type { OpsUser } from "./api/auth";

const user = (id: string, extra: Partial<OpsUser> = {}): OpsUser => ({ id, email: `${id}@example.com`, email_verified: true, created_at: "2026-09-15T14:00:00Z", roles: [], has_password: true, ...extra });

describe("mergeUserPages", () => {
  it("flattens pages in order and drops an account seen on an earlier page", () => {
    const pages = [{ users: [user("a"), user("b")], next_cursor: "b" }, { users: [user("b"), user("c")] }];
    expect(mergeUserPages(pages).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });
  it("copes with no pages and with a page without users", () => {
    expect(mergeUserPages(undefined)).toEqual([]);
    expect(mergeUserPages([{ users: undefined as unknown as OpsUser[] }])).toEqual([]);
  });
});

describe("roles", () => {
  const catalogs = [
    { name: "platform", permissions: [], roles: [{ name: "user", description: "Every account", permissions: [] }, { name: "platform_admin", description: "Everything", permissions: [] }, { name: "ops_viewer", description: "Read", permissions: [] }] },
    { name: "org", permissions: [], roles: [{ name: "admin", description: "Org admin", permissions: [] }, { name: "ops_viewer", description: "dup", permissions: [] }] },
  ];
  it("offers every catalog role the account doesn't hold, never the implicit user role, once each", () => {
    expect(grantableRoles(catalogs, ["ops_viewer"]).map((r) => `${r.catalog}:${r.name}`)).toEqual(["platform:platform_admin", "org:admin"]);
    expect(grantableRoles(undefined, [])).toEqual([]);
  });
  it("revokes what is held except the implicit role", () => {
    expect(revocableRoles(["user", "platform_admin"])).toEqual(["platform_admin"]);
  });
});

describe("codeState", () => {
  const now = Date.parse("2026-09-15T14:00:00Z");
  it("says what is left of a usable code, warns near the end, and knows spent and expired ones", () => {
    expect(codeState({ attempts: 0, max_attempts: 5, expires_at: "2026-09-15T14:09:30Z" }, now)).toMatchObject({ state: "usable", label: "expires in 10m", tone: "ok" });
    expect(codeState({ attempts: 0, max_attempts: 5, expires_at: "2026-09-15T14:00:45Z" }, now)).toMatchObject({ state: "usable", label: "expires in 45s", tone: "warn" });
    expect(codeState({ attempts: 5, max_attempts: 5, expires_at: "2026-09-15T14:09:30Z" }, now)).toMatchObject({ state: "spent", tone: "danger" });
    expect(codeState({ attempts: 1, max_attempts: 5, expires_at: "2026-09-15T13:58:00Z" }, now)).toMatchObject({ state: "expired", label: "expired 2m ago", tone: "muted" });
  });
  it("gives a clock-free answer before the client has one", () => {
    expect(codeState({ attempts: 0, max_attempts: 5, expires_at: "2026-09-15T14:09:30Z" }, 0)).toMatchObject({ state: "usable", label: "usable" });
  });
  it("words the purpose", () => {
    expect(codePurpose("verify_email")).toBe("verify email");
    expect(codePurpose("reset_password")).toBe("reset password");
    expect(codePurpose("magic_link")).toBe("magic link");
  });
});

describe("limiterKeyExample", () => {
  it("builds an example from what the app says the keys are", () => {
    expect(limiterKeyExample({ keys: "client IP address" })).toBe("203.0.113.9");
    expect(limiterKeyExample({ keys: "normalized email address" })).toBe("ada@example.com");
    expect(limiterKeyExample({ keys: "normalized email address and client network, joined with a space" })).toBe("ada@example.com 203.0.113.0/24");
    expect(limiterKeyExample({ keys: "purpose and normalized email address, joined with a space" })).toBe("verify_email ada@example.com");
    expect(limiterKeyExample({ keys: "user ID" })).toBe("usr_3frf6yknqvo4wx5ar5ut5pof4a");
    expect(limiterKeyExample({ keys: "actor ID" })).toBe("usr_3frf6yknqvo4wx5ar5ut5pof4a");
    expect(limiterKeyExample({ keys: "something else" })).toBe("the key as the limiter sees it");
  });
});

describe("lastSeen", () => {
  it("picks the most recent session activity", () => {
    expect(lastSeen([{ last_seen_at: "2026-09-15T13:00:00Z" }, { last_seen_at: "2026-09-15T13:30:00Z" }, { last_seen_at: "2026-09-15T12:00:00Z" }])).toBe("2026-09-15T13:30:00Z");
    expect(lastSeen([])).toBeUndefined();
  });
});
