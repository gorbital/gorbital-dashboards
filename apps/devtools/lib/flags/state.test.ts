import { describe, expect, it } from "vitest";
import type { FlagState } from "@/lib/api/flags";
import { describeFlagState, formFromState, parseTargets, sameState, stateFromForm, targetCount } from "./state";

const off: FlagState = { enabled: false, default: false, percentage: null, orgs: { allow: [], deny: [] }, users: { allow: [], deny: [] } };

describe("describeFlagState", () => {
  it("reads like the table column", () => {
    expect(describeFlagState(off)).toBe("off");
    expect(describeFlagState({ ...off, enabled: true, default: true })).toBe("on for everyone");
    expect(describeFlagState({ ...off, enabled: true })).toBe("off by default");
    expect(describeFlagState({ ...off, enabled: true, percentage: 25 })).toBe("25% rollout");
    expect(describeFlagState({ ...off, enabled: true, percentage: 0, users: { allow: ["u1", "u2"], deny: ["u3"] } })).toBe("0% rollout · 3 targets");
    expect(describeFlagState({ enabled: true, default: false, orgs: { allow: ["o1"] } })).toBe("off by default · 1 target");
    expect(targetCount({ enabled: true, default: false })).toBe(0);
  });
});

describe("the form", () => {
  it("round-trips a state", () => {
    const state: FlagState = { enabled: true, default: false, percentage: 25, users: { allow: ["u1", "u2"], deny: [] }, orgs: { allow: [], deny: ["o9"] } };
    const form = formFromState(state);
    expect(form).toEqual({ enabled: true, default: false, percentage: "25", usersAllow: "u1\nu2", usersDeny: "", orgsAllow: "", orgsDeny: "o9" });
    const back = stateFromForm(form);
    expect(back.ok && sameState(back.state, state)).toBe(true);
    expect(formFromState({ enabled: false, default: true }).percentage).toBe("");
  });
  it("parses IDs one per line or comma-separated, without duplicates", () => {
    expect(parseTargets(" u1 \nu2,u3\n\nu1")).toEqual(["u1", "u2", "u3"]);
    expect(parseTargets("")).toEqual([]);
  });
  it("refuses what the app would", () => {
    const base = formFromState(off);
    expect(stateFromForm({ ...base, percentage: "101" })).toMatchObject({ ok: false, field: "percentage" });
    expect(stateFromForm({ ...base, percentage: "2.5" })).toMatchObject({ ok: false, field: "percentage" });
    expect(stateFromForm({ ...base, percentage: "" })).toMatchObject({ ok: true, state: { percentage: null } });
    expect(stateFromForm({ ...base, usersAllow: "u1", usersDeny: "u1" })).toMatchObject({ ok: false, error: expect.stringContaining("both"), field: "usersAllow" });
    expect(stateFromForm({ ...base, orgsAllow: "has space" })).toMatchObject({ ok: false, field: "orgsAllow" });
    expect(stateFromForm({ ...base, orgsDeny: "x".repeat(101) })).toMatchObject({ ok: false, field: "orgsAllow" });
    expect(stateFromForm({ ...base, usersAllow: Array.from({ length: 1001 }, (_, i) => `u${i}`).join("\n") })).toMatchObject({ ok: false, error: expect.stringContaining("1000") });
  });
  it("compares states as sets", () => {
    expect(sameState({ enabled: true, default: false, users: { allow: ["b", "a"] } }, { enabled: true, default: false, percentage: null, users: { allow: ["a", "b"], deny: [] }, orgs: {} })).toBe(true);
    expect(sameState({ enabled: true, default: false }, { enabled: true, default: true })).toBe(false);
  });
});
