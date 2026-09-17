"use client";

/**
 * The Tunnel screen's data layer (ADR-0086): `/_portal/api/tunnel…` as
 * `cli/internal/portal/tunnel.go` and `cli/internal/tunnel` shape it, and
 * the `tunnel` events of `/_portal/api/events`. The token is never part of
 * any answer: only the variable it comes from.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { retry } from "./queries";

export type TunnelMode = "quick" | "named";
export type TunnelState = "off" | "starting" | "connected" | "stopping" | "failed";

/** One line of cloudflared's output, secrets redacted. */
export type TunnelLogLine = { time: string; level?: string; text: string };

/** `POST tunnel/check` and the check after connecting. */
export type Reachability = { url: string; ok: boolean; status?: number; detail: string; checked_at: string; latency_ms: number };

/** `tunnel.Status`. */
export type TunnelStatus = {
  state: TunnelState;
  mode?: TunnelMode;
  public_url?: string;
  hostname?: string;
  /** A named tunnel's URL stays across runs; only such a URL suits sign-in callbacks and passkeys. */
  stable: boolean;
  target?: string;
  pid?: number;
  started_at?: string;
  connected_at?: string;
  problem?: string;
  restarts: number;
  check?: Reachability;
  log: TunnelLogLine[] | null;
};

export type InstallStep = { os: string; label: string; command?: string; url?: string };

/** `GET /_portal/api/tunnel`. */
export type TunnelInfo = {
  status: TunnelStatus;
  cloudflared: { found: boolean; path?: string; from_env: boolean; version?: string; problem?: string };
  install: InstallStep[];
  os: string;
  hostname?: string;
  /** ORB_TUNNEL_HOSTNAME or "settings" (saved from this screen). */
  hostname_source?: string;
  /** CLOUDFLARE_TUNNEL_TOKEN or CLOUDFLARE_TUNNEL_TOKEN_FILE when set; never the token. */
  token_source?: string;
  token_problem?: string;
  app_env: string;
  allowed: boolean;
  target?: string;
};

export type TunnelEnvChange = { key: string; current: string; proposed: string; reason: string; optional: boolean };

export type TunnelCallback = { provider: "google" | "apple" | "github" | "resend" | string; label: string; url: string; method: string; path: string; where: string; configured: boolean };

/** `GET tunnel/setup`. */
export type TunnelSetup = {
  public_url: string;
  hostname: string;
  stable: boolean;
  changes: TunnelEnvChange[] | null;
  set: Record<string, string> | null;
  callbacks: TunnelCallback[] | null;
  routes_known: boolean;
  warnings: string[] | null;
};

export const tunnelKeys = {
  info: ["portal", "tunnel"] as const,
  setup: (url: string) => ["portal", "tunnel", "setup", url] as const,
};

/** True when this orb dev runs no tunnels (404 `no_tunnel`: an orb from before ADR-0086). */
export function isNoTunnel(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "no_tunnel";
}

/** `GET /_portal/api/tunnel`: polled while the tunnel changes state; events patch it in between. */
export function useTunnel() {
  return useQuery({
    queryKey: tunnelKeys.info,
    queryFn: () => apiFetch<TunnelInfo>("/_portal/api/tunnel"),
    refetchInterval: (q) => {
      const state = q.state.data?.status.state;
      return state === "starting" || state === "stopping" ? 2_000 : 15_000;
    },
    retry,
  });
}

/** Puts a `tunnel` event's status into the cached info, so every view updates at once. */
export function applyTunnelEvent(client: QueryClient, status: TunnelStatus) {
  client.setQueryData<TunnelInfo>(tunnelKeys.info, (old) => (old ? { ...old, status } : old));
}

/** `GET tunnel/setup` for the connected tunnel's URL. */
export function useTunnelSetup(publicURL: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: tunnelKeys.setup(publicURL ?? ""),
    queryFn: () => apiFetch<TunnelSetup>("/_portal/api/tunnel/setup"),
    enabled: enabled && Boolean(publicURL),
    staleTime: 5_000,
    retry,
  });
}

function useTunnelAction<V>(path: string, body: (v: V) => unknown, what: string, success?: (info: TunnelInfo, v: V) => string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => apiFetch<TunnelInfo>(path, { method: "POST", json: body(v) }),
    onSuccess: (info, v) => {
      qc.setQueryData(tunnelKeys.info, info);
      const message = success?.(info, v);
      if (message) toast.success(message);
    },
    onError: (err) => toast.error(`Couldn't ${what}`, { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: tunnelKeys.info }),
  });
}

/** `POST tunnel/start`: 422 names what's missing (`cloudflared_missing`, `tunnel_token_missing`, `tunnel_hostname_invalid`, `not_development`). */
export function useStartTunnel() {
  return useTunnelAction<{ mode: TunnelMode; hostname?: string }>("/_portal/api/tunnel/start", (v) => v, "start the tunnel", (_i, v) => (v.mode === "quick" ? "Starting a quick tunnel" : "Starting the named tunnel"));
}

export function useStopTunnel() {
  return useTunnelAction<void>("/_portal/api/tunnel/stop", () => undefined, "stop the tunnel", () => "Tunnel stopped");
}

export function useRestartTunnel() {
  return useTunnelAction<void>("/_portal/api/tunnel/restart", () => undefined, "restart the tunnel", () => "Restarting the tunnel");
}

/** `POST tunnel/check`: requests the public URL's /livez now. */
export function useCheckTunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Reachability>("/_portal/api/tunnel/check", { method: "POST" }),
    onSuccess: (check) => {
      qc.setQueryData<TunnelInfo>(tunnelKeys.info, (old) => (old ? { ...old, status: { ...old.status, check } } : old));
      (check.ok ? toast.success : toast.warning)(check.ok ? "Reachable" : "Not reachable", { description: check.detail });
    },
    onError: (err) => toast.error("Couldn't check the tunnel", { description: errorMessage(err) }),
  });
}

/** `PUT tunnel/settings`: saves a named tunnel's hostname for later starts. */
export function useSaveTunnelHostname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostname: string) => apiFetch<{ hostname: string }>("/_portal/api/tunnel/settings", { method: "PUT", json: { hostname } }),
    onSuccess: (r) => toast.success("Hostname saved", { description: r.hostname }),
    onError: (err) => toast.error("Couldn't save the hostname", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: tunnelKeys.info }),
  });
}
