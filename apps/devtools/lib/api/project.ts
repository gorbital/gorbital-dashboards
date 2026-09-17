"use client";

/**
 * Project Settings' data layer (ADR-0077): `GET /_portal/api/project` as
 * `cli/internal/portal/project.go` shapes it, the danger zone's endpoints,
 * and the ops API's service accounts and their keys
 * (`/ops/service-accounts…`, `examples/full-single/api/openapi.json`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { keys } from "./queries";
import type { Project } from "./types";

/** A destructive action the screen offers, confirmed with `loses`. */
export type DangerAction = {
  name: string;
  method: "POST" | "DELETE" | string;
  path: string;
  loses: string;
  available: boolean;
};

/** The app as the manifest, go.mod and .env describe it, with the env key behind each value; never a secret. `mail` shadows the project's provider field, as Go's embedding does. */
export type ProjectSettings = Omit<Project, "mail"> & {
  /** The app directory is a git repository. */
  git: boolean;
  app: { addr: string; url: string; key: string };
  portal: { port: string; key: string };
  database_settings: { configured: boolean; host?: string; key: string; port_key: string };
  mail: { delivery: string; catcher_addr?: string; key: string };
  storage: { driver: string; bucket?: string; local_dir?: string; key: string };
  cors: { origins: string[] | null; key: string };
  logging: { level: string; format: string; keys: string[] };
  docs: { enabled: boolean; key: string };
  danger: DangerAction[] | null;
};

/** `POST /_portal/api/project/reset-database` answers 202 with what happens next. */
export type ResetDatabaseResult = { status: "accepted"; detail: string };

export const projectKeys = {
  all: ["portal", "project"] as const,
  serviceAccounts: ["ops", "service-accounts"] as const,
  serviceAccountKeys: (id: string) => ["ops", "service-accounts", id, "keys"] as const,
};

const retry = (count: number, err: unknown) => !(err instanceof NotConnectedError) && !(err instanceof ApiError && err.status < 500) && count < 2;

/** `GET /_portal/api/project`, every 30 s; 404 `no_project_settings` on an orb dev from before ADR-0077. */
export function useProject() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiFetch<ProjectSettings>("/_portal/api/project"),
    refetchInterval: 30_000,
    retry,
  });
}

export function isNoProjectSettings(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "no_project_settings";
}

/**
 * Runs one danger action as the settings describe it (`method` + `path`):
 * reset the database (202 with a detail), clear the log store, the inbox
 * or the SQL history (204). Invalidates what each clears.
 */
export function useDangerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: DangerAction) => {
      const res = await apiFetch<ResetDatabaseResult | undefined>(action.path, { method: action.method });
      return { action, result: res };
    },
    onSuccess: ({ action, result }) => {
      toast.success(action.name, { description: result?.detail ?? "done" });
      if (action.path.includes("/logs")) void qc.invalidateQueries({ queryKey: ["logs"] });
      if (action.path.includes("/mail")) {
        void qc.invalidateQueries({ queryKey: ["mail"] });
        void qc.invalidateQueries({ queryKey: keys.devMail });
      }
      if (action.path.includes("/sql/history")) void qc.invalidateQueries({ queryKey: ["sql"] });
      if (action.path.includes("reset-database")) {
        void qc.invalidateQueries({ queryKey: ["db"] });
        void qc.invalidateQueries({ queryKey: keys.status });
        void qc.invalidateQueries({ queryKey: keys.devMigrations });
      }
    },
    onError: (err, action) => {
      toast.error(`Couldn't ${action.name.toLowerCase()}`, { description: errorMessage(err) });
    },
  });
}

/* ---------- Service accounts and their keys (/ops/service-accounts) ---------- */

export type ServiceAccount = {
  id: string;
  name: string;
  description: string;
  roles: string[] | null;
  disabled: boolean;
  disabled_at?: string;
  created_at: string;
  updated_at: string;
};

export type ServiceAccountList = { service_accounts: ServiceAccount[] | null };

export type ApiKeyStatus = "active" | "expired" | "revoked";

export type ApiKey = {
  id: string;
  name: string;
  /** The start of the key, up to its secret: recognise a key by it. */
  prefix: string;
  scopes: string[] | null;
  status: ApiKeyStatus;
  service_account_id?: string;
  created_at: string;
  expires_at: string;
  last_used_at?: string;
  revoked_at?: string;
};

export type ApiKeyList = { api_keys: ApiKey[] | null };

/** `POST …/keys` answers the key once. */
export type CreatedApiKey = { api_key: ApiKey; key: string };

export type ServiceAccountBody = { name: string; description?: string; roles?: string[] };
export type ApiKeyBody = { name: string; expires_at: string; scopes?: string[] };

/** `GET /ops/service-accounts`: the platform's non-human principals. */
export function useServiceAccounts(enabled: boolean) {
  return useQuery({
    queryKey: projectKeys.serviceAccounts,
    queryFn: () => apiFetch<ServiceAccountList>("/_portal/app/ops/service-accounts").then((r) => r.service_accounts ?? []),
    enabled,
    staleTime: 15_000,
    retry,
  });
}

/** `GET /ops/service-accounts/{id}/keys`. */
export function useServiceAccountKeys(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: projectKeys.serviceAccountKeys(id ?? ""),
    queryFn: () => apiFetch<ApiKeyList>(`/_portal/app/ops/service-accounts/${encodeURIComponent(id!)}/keys`).then((r) => r.api_keys ?? []),
    enabled: enabled && Boolean(id),
    retry,
  });
}

export function useCreateServiceAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ServiceAccountBody) => apiFetch<ServiceAccount>("/_portal/app/ops/service-accounts", { method: "POST", json: body }),
    onSuccess: (a) => toast.success(`Created ${a.name}`, { description: a.id }),
    onError: (err) => toast.error("Couldn't create the service account", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: projectKeys.serviceAccounts }),
  });
}

export function useDeleteServiceAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/_portal/app/ops/service-accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => toast.success("Service account deleted", { description: "its keys stopped working" }),
    onError: (err) => toast.error("Couldn't delete the service account", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: projectKeys.serviceAccounts }),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ApiKeyBody }) => apiFetch<CreatedApiKey>(`/_portal/app/ops/service-accounts/${encodeURIComponent(id)}/keys`, { method: "POST", json: body }),
    onError: (err) => toast.error("Couldn't create the key", { description: errorMessage(err) }),
    onSettled: (_r, _e, { id }) => void qc.invalidateQueries({ queryKey: projectKeys.serviceAccountKeys(id) }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keyId }: { id: string; keyId: string }) => apiFetch<void>(`/_portal/app/ops/service-accounts/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" }),
    onSuccess: () => toast.success("Key revoked", { description: "it stopped working at once" }),
    onError: (err) => toast.error("Couldn't revoke the key", { description: errorMessage(err) }),
    onSettled: (_r, _e, { id }) => void qc.invalidateQueries({ queryKey: projectKeys.serviceAccountKeys(id) }),
  });
}

/** Whether the app refused the dev operator on `/ops/service-accounts` (401): the auth module wants a signed-in principal there. */
export function isOperatorRefused(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
