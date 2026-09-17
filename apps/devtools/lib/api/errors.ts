import { ApiError, NotConnectedError } from "./client";

/** Where a request went, which decides what an error means. */
export type ErrorScope = "portal" | "dev" | "ops";

export type ErrorKind =
  | "not_connected"
  | "not_signed_in"
  | "operator_not_accepted"
  | "no_console"
  | "forbidden"
  | "app_unavailable"
  | "service_unavailable"
  | "rate_limited"
  | "conflict"
  | "invalid"
  | "not_found"
  | "other";

export type ErrorDescription = {
  kind: ErrorKind;
  /** One line, in the tone of the page headers. */
  title: string;
  /** What to do about it. */
  hint: string;
  /** `status code · detail`, for the mono line under the hint. */
  detail?: string;
};

export type ErrorContext = {
  scope: ErrorScope;
  /** `status.app.console`: the app serves the dev console, so orb dev has a token to add. */
  console?: boolean;
};

/**
 * Turns an error from `apiFetch` into what the page should say. The same
 * status means different things by scope: a 401 from `/ops` while the app
 * serves the console is a running orb or app that predates the development
 * operator, a 404 from `/_dev` is an app without the console.
 */
export function describeError(err: unknown, ctx: ErrorContext): ErrorDescription {
  if (err instanceof NotConnectedError) {
    return { kind: "not_connected", title: "orb dev isn't running", hint: "Start it in the app's directory and open the link it prints." };
  }
  if (!(err instanceof ApiError)) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "other", title: "Something went wrong", hint: message, detail: message };
  }
  const detail = `${err.status} ${err.code}${err.detail ? ` · ${err.detail}` : ""}`;
  if (err.status === 401) {
    if (ctx.scope === "portal") return { kind: "not_signed_in", title: "Not signed in", hint: "Open the Dev Portal link orb dev printed; it sets the cookie for this browser.", detail };
    if (ctx.scope === "ops") {
      if (ctx.console !== false) {
        return {
          kind: "operator_not_accepted",
          title: "The app doesn't accept the dev operator yet",
          hint: "orb dev sends its console token to /ops as the development operator; this app or this orb predates that. Rebuild with the current orb and restart the app.",
          detail,
        };
      }
      return { kind: "no_console", title: "No dev console token", hint: "The app runs without DEV_CONSOLE_TOKEN, so orb dev has nothing to send to /ops. Run it through orb dev with the token set.", detail };
    }
    return { kind: "no_console", title: "The dev console refused the token", hint: "orb dev's console token doesn't match the app's DEV_CONSOLE_TOKEN; restart the app through orb dev.", detail };
  }
  if (err.status === 403) {
    if (err.code === "mfa_required") return { kind: "forbidden", title: "Two-factor sign-in required", hint: "The app asks for a second factor on this route; the dev operator has none. Use a bearer token of a signed-in operator.", detail };
    return { kind: "forbidden", title: "Refused", hint: ctx.scope === "ops" ? "The dev operator lacks a permission this route needs; that shouldn't happen with platform_admin, so check the app's /ops wiring." : err.detail || "The request was refused.", detail };
  }
  if (err.status === 404 && ctx.scope === "dev") {
    return { kind: "no_console", title: "This app has no dev console", hint: "Apps created before v1.1, or run without DEV_CONSOLE_TOKEN, don't serve /_dev/. Follow the upgrade notes and run it through orb dev.", detail };
  }
  if (err.status === 404) return { kind: "not_found", title: "Not found", hint: err.detail || "The app has no such endpoint.", detail };
  if (err.status === 409) return { kind: "conflict", title: "Changed underneath you", hint: err.detail || "Read it again and retry.", detail };
  if (err.status === 422) return { kind: "invalid", title: "Not accepted", hint: err.detail || "The value doesn't fit.", detail };
  if (err.status === 429) return { kind: "rate_limited", title: "Slow down", hint: err.detail || "Too many of these in a short time; try again in a minute.", detail };
  if (err.status === 502) return { kind: "app_unavailable", title: "The app isn't answering", hint: "It may be building or stopped; the Overview shows its state.", detail };
  if (err.status === 503) {
    if (err.code === "maintenance") return { kind: "service_unavailable", title: "Maintenance mode is on", hint: "Turn off maintenance.enabled in Settings to serve requests again.", detail };
    if (err.code === "unavailable" && ctx.scope === "dev") return { kind: "service_unavailable", title: "Mailpit isn't running", hint: "orb dev starts Mailpit with the app; check its output for why it stopped.", detail };
    return { kind: "service_unavailable", title: "Temporarily unavailable", hint: err.detail || "Try again shortly.", detail };
  }
  return { kind: "other", title: err.title || "The request failed", hint: err.detail || err.message, detail };
}

/** One line for toasts: the problem's detail, or the error's message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || `${err.status} ${err.code}`;
  return err instanceof Error ? err.message : String(err);
}

/** True for the problem codes that mean "send a reason with this change". */
export function needsReason(err: unknown): boolean {
  return err instanceof ApiError && err.status === 422 && /_reason_required$/.test(err.code);
}

/** True when the change lost a race: read the current version and retry. */
export function isVersionConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /_version_conflict$/.test(err.code);
}
