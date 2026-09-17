import { describe, expect, it } from "vitest";
import { ApiError, NotConnectedError } from "./client";
import { describeError, errorMessage, isVersionConflict, needsReason } from "./errors";

const api = (status: number, code: string, detail?: string) => new ApiError({ status, code, detail });

describe("describeError", () => {
  it("names a missing orb dev regardless of scope", () => {
    expect(describeError(new NotConnectedError(), { scope: "ops" }).kind).toBe("not_connected");
    expect(describeError(new NotConnectedError(), { scope: "portal" }).kind).toBe("not_connected");
  });

  it("reads a 401 by where it came from", () => {
    expect(describeError(api(401, "unauthorized"), { scope: "portal" }).kind).toBe("not_signed_in");
    const stale = describeError(api(401, "unauthenticated"), { scope: "ops", console: true });
    expect(stale.kind).toBe("operator_not_accepted");
    expect(stale.hint).toMatch(/rebuild with the current orb/i);
    expect(describeError(api(401, "unauthenticated"), { scope: "ops", console: false }).kind).toBe("no_console");
    expect(describeError(api(401, "unauthorized"), { scope: "dev" }).kind).toBe("no_console");
  });

  it("treats a 404 from /_dev as an app without the console, elsewhere as not found", () => {
    expect(describeError(api(404, "not_found", "no route matches GET /_dev/app"), { scope: "dev" }).kind).toBe("no_console");
    expect(describeError(api(404, "setting_not_found"), { scope: "ops" }).kind).toBe("not_found");
  });

  it("maps the rest by status and code", () => {
    expect(describeError(api(403, "mfa_required"), { scope: "ops" }).title).toMatch(/two-factor/i);
    expect(describeError(api(403, "forbidden"), { scope: "ops" }).kind).toBe("forbidden");
    expect(describeError(api(409, "setting_version_conflict"), { scope: "ops" }).kind).toBe("conflict");
    expect(describeError(api(422, "invalid_setting_value", "too long"), { scope: "ops" })).toMatchObject({ kind: "invalid", hint: "too long" });
    expect(describeError(api(429, "job_run_limited"), { scope: "ops" }).kind).toBe("rate_limited");
    expect(describeError(api(502, "app_unavailable"), { scope: "dev" }).kind).toBe("app_unavailable");
    expect(describeError(api(503, "unavailable"), { scope: "dev" }).title).toMatch(/mailpit/i);
    expect(describeError(api(503, "maintenance"), { scope: "ops" }).title).toMatch(/maintenance/i);
    expect(describeError(api(500, "internal_error", "boom"), { scope: "ops" })).toMatchObject({ kind: "other", detail: "500 internal_error · boom" });
    expect(describeError(new Error("odd"), { scope: "ops" })).toMatchObject({ kind: "other", hint: "odd" });
  });
});

describe("helpers", () => {
  it("errorMessage prefers the problem's detail", () => {
    expect(errorMessage(api(409, "job_not_retryable", "run 3 is completed"))).toBe("run 3 is completed");
    expect(errorMessage(api(500, "internal_error"))).toBe("500 internal_error");
    expect(errorMessage(new Error("x"))).toBe("x");
  });

  it("recognises the reason-required and version-conflict families", () => {
    expect(needsReason(api(422, "setting_reason_required"))).toBe(true);
    expect(needsReason(api(422, "job_reason_required"))).toBe(true);
    expect(needsReason(api(422, "mail_suppression_reason_required"))).toBe(true);
    expect(needsReason(api(422, "invalid_setting_value"))).toBe(false);
    expect(isVersionConflict(api(409, "setting_version_conflict"))).toBe(true);
    expect(isVersionConflict(api(409, "job_definition_version_conflict"))).toBe(true);
    expect(isVersionConflict(api(409, "job_not_retryable"))).toBe(false);
  });
});
