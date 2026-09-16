import { beforeEach, describe, expect, it } from "vitest";
import type { FlagHistory, FlagList, OpsFlag } from "../flags";
import type { Problem } from "../types";
import { mockFlagsFetch, resetMockFlags } from "./flags";

const q = new URLSearchParams();
const call = (path: string, method = "GET", body: Record<string, unknown> = {}) => mockFlagsFetch(path, q, method, body)!;

beforeEach(() => resetMockFlags());

describe("the mock flags", () => {
  it("lists the sample flags with the ops API's shape", async () => {
    const res = call("/ops/flags");
    expect(res.status).toBe(200);
    const list = (await res.json()) as FlagList;
    expect(list.flags?.map((f) => f.key)).toEqual(["projects.search", "orgs.sso", "mail.digest", "example.ping_time"]);
    const sso = list.flags!.find((f) => f.key === "orgs.sso")!;
    expect(Object.keys(sso).sort()).toEqual(["client", "declared_state", "description", "group", "invalid_stored_value", "key", "modified", "state", "updated_at", "updated_by", "version"]);
    expect(sso).toMatchObject({ modified: true, version: 3, state: { enabled: true, percentage: 25, orgs: { allow: ["org_acme", "org_northwind"] } }, declared_state: { enabled: false } });
    expect(mockFlagsFetch("/ops/settings", q, "GET", {})).toBeUndefined();
    expect(call("/ops/flags/nope").status).toBe(404);
  });

  it("wants the version read and a reason, then bumps the version and records the change", async () => {
    const stale = call("/ops/flags/projects.search", "PUT", { state: { enabled: true, default: true }, version: 5, reason: "x" });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Problem).code).toBe("flag_version_conflict");
    const noReason = call("/ops/flags/projects.search", "PUT", { state: { enabled: true, default: true }, version: 0 });
    expect(noReason.status).toBe(422);
    expect(((await noReason.json()) as Problem).code).toBe("flag_reason_required");
    const ok = call("/ops/flags/projects.search", "PUT", { state: { enabled: true, default: false, percentage: 50, users: { allow: ["u1"] } }, version: 0, reason: "half of users" });
    expect(ok.status).toBe(200);
    const f = (await ok.json()) as OpsFlag;
    expect(f).toMatchObject({ modified: true, version: 1, state: { enabled: true, default: false, percentage: 50, users: { allow: ["u1"], deny: [] }, orgs: { allow: [], deny: [] } }, updated_by: "dev console (orb dev)" });
    const h = (await call("/ops/flags/projects.search/history").json()) as FlagHistory;
    expect(h.changes).toHaveLength(1);
    expect(h.changes![0]).toMatchObject({ key: "projects.search", old_state: null, version: 0, reason: "half of users", actor_kind: "system" });
    expect(h.changes![0].new_state?.percentage).toBe(50);
  });

  it("refuses an invalid state with the library's reason", async () => {
    for (const [state, needle] of [
      [{ enabled: true, default: false, percentage: 101 }, "percentage"],
      [{ enabled: true, default: false, users: { allow: ["u1"], deny: ["u1"] } }, "both"],
      [{ enabled: true, default: false, orgs: { allow: ["has space"] } }, "visible ASCII"],
      [{ enabled: "yes", default: false }, "enabled"],
    ] as const) {
      const res = call("/ops/flags/mail.digest", "PUT", { state, version: 0, reason: "try" });
      expect(res.status).toBe(422);
      const p = (await res.json()) as Problem;
      expect(p.code).toBe("invalid_flag_state");
      expect(p.detail).toContain(needle);
    }
  });

  it("resets to the declared state on DELETE with a reason", async () => {
    const noReason = call("/ops/flags/orgs.sso", "DELETE", { version: 3 });
    expect(noReason.status).toBe(422);
    const res = call("/ops/flags/orgs.sso", "DELETE", { version: 3, reason: "end the pilot" });
    expect(res.status).toBe(200);
    const f = (await res.json()) as OpsFlag;
    expect(f).toMatchObject({ modified: false, version: 4, state: { enabled: false, default: false, percentage: null } });
    const h = (await call("/ops/flags/orgs.sso/history").json()) as FlagHistory;
    expect(h.changes).toHaveLength(4);
    expect(h.changes![0]).toMatchObject({ new_state: null, reason: "end the pilot", version: 3 });
  });
});
