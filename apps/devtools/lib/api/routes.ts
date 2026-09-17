"use client";

/**
 * The Routes page's second source (ADR-0082): `GET /_portal/api/routes`,
 * read by orb from the app's OpenAPI document (`x-gorbital-guards`) and its
 * source (where each route is registered, its handler, `gorbital.Use` and
 * `Module.Middleware`). The first call may build the app, so it can take a
 * few seconds. The dev console's `/_dev/routes` stays the base list;
 * `lib/routes/join.ts` joins the two by method and path.
 */

import { useQuery } from "@tanstack/react-query";
import { ApiError, NotConnectedError, apiFetch } from "./client";

/** A position in the app's source; `file` is relative to the app directory, slash-separated. */
export type RouteSourcePos = { file: string; line: number };

export type RouteInfo = {
  method: string;
  path: string;
  operation_id: string;
  summary: string;
  tags: string[];
  /** Empty when the route isn't in the app's source (a library's routes). */
  module: string;
  /** `h.getBook`, or empty. */
  handler: string;
  /** Where the route is registered: `gorbital.Get(…)`, or `huma.Register` in a v0.1 app. */
  source: RouteSourcePos | null;
  /** The handler's declaration. */
  handler_source: RouteSourcePos | null;
  /** From `x-gorbital-guards`: `authenticated`, `permission:books.book.read`, `rate_limit:30/1m0s`, `public`; empty for v0.1 apps. */
  guards: string[];
  /** `gorbital.Use` and `Module.Middleware` expressions, outermost first. */
  middleware: string[];
  /** No sign-in required. */
  public: boolean;
  deprecated: boolean;
};

export type RouteList = {
  app: string;
  /** Where the OpenAPI document came from: the running app, `go run ./cmd/api openapi`, or a file. */
  source: "app" | "export" | "file";
  /** False for v0.1 apps, whose OpenAPI has no `x-gorbital-guards`. */
  guards_known: boolean;
  total: number;
  public: number;
  routes: RouteInfo[];
  warnings: string[];
};

export const routeKeys = { all: ["portal", "routes"] as const };

const retry = (count: number, err: unknown) => !(err instanceof NotConnectedError) && !(err instanceof ApiError && err.status < 500) && count < 1;

/** Fills what Go may send as `null`, so the UI never reads `undefined.length`. */
export function normaliseRouteList(list: RouteList): RouteList {
  return {
    ...list,
    routes: (list.routes ?? []).map((r) => ({ ...r, tags: r.tags ?? [], guards: r.guards ?? [], middleware: r.middleware ?? [], module: r.module ?? "", handler: r.handler ?? "", source: r.source ?? null, handler_source: r.handler_source ?? null })),
    warnings: list.warnings ?? [],
  };
}

/** `GET /_portal/api/routes`; 422 `routes_failed` when the app doesn't build. */
export function useRouteInfo(enabled = true) {
  return useQuery({
    queryKey: routeKeys.all,
    queryFn: () => apiFetch<RouteList>("/_portal/api/routes").then(normaliseRouteList),
    enabled,
    staleTime: 30_000,
    retry,
  });
}
