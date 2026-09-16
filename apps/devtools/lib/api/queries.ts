"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch, portalInit, transportFetch } from "./client";
import type { Accepted, AppAction, DevApp, DevRouteList, OutputList, Readiness, Status } from "./types";

export const keys = {
  status: ["portal", "status"] as const,
  output: (limit: number) => ["portal", "output", limit] as const,
  devApp: ["dev", "app"] as const,
  devRoutes: ["dev", "routes"] as const,
  readiness: ["app", "readyz"] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, or refused. */
function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

/** The portal's status, every 5 s; state events patch `app` in between (see the provider). */
export function useStatus() {
  return useQuery({
    queryKey: keys.status,
    queryFn: () => apiFetch<Status>("/_portal/api/status"),
    refetchInterval: 5000,
    staleTime: 2000,
    retry,
  });
}

/** The most recent output lines, oldest first. The live tail lives in the console store; this is for backfill. */
export function useOutput(limit = 200, enabled = true) {
  return useQuery({
    queryKey: keys.output(limit),
    queryFn: () => apiFetch<OutputList>(`/_portal/api/output?limit=${limit}`),
    enabled,
    retry,
  });
}

/** `/_dev/app` through the proxy; only when the app runs and serves the console. */
export function useDevApp(enabled: boolean) {
  return useQuery({
    queryKey: keys.devApp,
    queryFn: () => apiFetch<DevApp>("/_portal/app/_dev/app"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

export function useDevRoutes(enabled: boolean) {
  return useQuery({
    queryKey: keys.devRoutes,
    queryFn: () => apiFetch<DevRouteList>("/_portal/app/_dev/routes"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** The app's `/readyz`, every 10 s while it runs. A 503 is a result, not an error. */
export function useReadiness(enabled: boolean) {
  return useQuery({
    queryKey: keys.readiness,
    queryFn: async (): Promise<Readiness> => {
      let res: Response;
      try {
        res = await transportFetch("/_portal/app/readyz", portalInit({ cache: "no-store" }));
      } catch (err) {
        throw new NotConnectedError(err);
      }
      if (res.status === 401) throw new ApiError({ status: 401, code: "unauthorized" });
      const body = (await res.text()).trim();
      return { ok: res.ok, status: res.status, body: body.length <= 200 ? body : undefined };
    },
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

const actionLabel: Record<AppAction, string> = { restart: "Restarting", stop: "Stopping", start: "Starting" };

/** Restart, stop or start the app. The portal answers 202 at once; the outcome arrives as state events. */
export function useAppAction(action: AppAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Accepted>(`/_portal/api/app/${action}`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData<Status>(keys.status, (old) => (old ? { ...old, app: data.app } : old));
      toast.success(`${actionLabel[action]} the app`, { description: `state: ${data.app.state}` });
    },
    onError: (err) => {
      toast.error(`Couldn't ${action} the app`, { description: err instanceof Error ? err.message : String(err) });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.status }),
  });
}
