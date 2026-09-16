"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { apiFetch } from "./client";
import { retry } from "./queries";

/*
 * Feature flags through the ops API (ADR-0057): `/ops/flags`, one flag,
 * its history, set and reset. The shapes match
 * examples/full-single/api/openapi.json (FlagResponse, FlagState,
 * FlagTargets, FlagChange) field for field.
 */

export type FlagTargets = {
  /** IDs that get true. */
  allow?: string[] | null;
  /** IDs that get false; deny wins over allow in the same rule. */
  deny?: string[] | null;
};

export type FlagState = {
  /** false turns the flag off for everyone, keeping the rules for later. */
  enabled: boolean;
  /** The answer when no other rule applies. */
  default: boolean;
  /** Share of subjects that get true; null for no rollout. Anonymous callers only follow 0 and 100. */
  percentage?: number | null;
  /** Organisations, for callers acting in one. */
  orgs?: FlagTargets;
  /** Users and other authenticated callers, by ID. */
  users?: FlagTargets;
};

export type OpsFlag = {
  key: string;
  group: string;
  description: string;
  /** Signed-in clients read it from GET /v1/flags. */
  client: boolean;
  /** State in effect. */
  state: FlagState;
  /** State declared in code, restored by DELETE. */
  declared_state: FlagState;
  /** A stored state replaces the declared one. */
  modified: boolean;
  /** The stored state fails validation, so the declared state applies. */
  invalid_stored_value: boolean;
  /** Send back when changing the flag. */
  version: number;
  updated_at?: string;
  updated_by?: string;
};

export type FlagList = { flags: OpsFlag[] | null };

export type FlagChange = {
  id: number;
  key: string;
  /** null means the declared state. */
  old_state: FlagState | null;
  new_state: FlagState | null;
  version: number;
  reason: string;
  actor_kind: string;
  actor_id: string;
  request_id?: string;
  changed_at: string;
};

export type FlagHistory = { changes: FlagChange[] | null };

export type SetFlagBody = { state: FlagState; version: number; reason: string };
export type ResetFlagBody = { version: number; reason: string };

export const flagKeys = {
  all: ["ops", "flags"] as const,
  history: (key: string) => ["ops", "flags", key, "history"] as const,
};

/** `GET /ops/flags`: every flag with its state in effect and the declared one. */
export function useFlags(enabled: boolean) {
  return useQuery({
    queryKey: flagKeys.all,
    queryFn: async () => (await apiFetch<FlagList>("/_portal/app/ops/flags")).flags ?? [],
    enabled,
    retry,
  });
}

/** `GET /ops/flags/{key}/history`, newest first. */
export function useFlagHistory(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: flagKeys.history(key ?? ""),
    queryFn: async () => (await apiFetch<FlagHistory>(`/_portal/app/ops/flags/${encodeURIComponent(key ?? "")}/history?limit=20`)).changes ?? [],
    enabled: enabled && Boolean(key),
    retry,
  });
}

/** `PUT /ops/flags/{key}`: the whole state, with the version read and a reason. The form handles 422 `flag_reason_required`, `invalid_flag_state` and 409 `flag_version_conflict`. */
export function useSetFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: SetFlagBody }) => apiFetch<OpsFlag>(`/_portal/app/ops/flags/${encodeURIComponent(key)}`, { method: "PUT", json: body }),
    onSuccess: (flag) => {
      qc.setQueryData<OpsFlag[]>(flagKeys.all, (old) => old?.map((f) => (f.key === flag.key ? flag : f)));
      void qc.invalidateQueries({ queryKey: flagKeys.history(flag.key) });
      toast.success(`Saved ${flag.key}`, { description: `now v${flag.version} · ${flag.state.enabled ? "enabled" : "disabled"}; applies on every instance within moments` });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: flagKeys.all });
      void qc.invalidateQueries({ queryKey: ["dev", "app"] });
    },
  });
}

/** `DELETE /ops/flags/{key}`: back to the state declared in code. */
export function useResetFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: ResetFlagBody }) => apiFetch<OpsFlag>(`/_portal/app/ops/flags/${encodeURIComponent(key)}`, { method: "DELETE", json: body }),
    onSuccess: (flag) => {
      qc.setQueryData<OpsFlag[]>(flagKeys.all, (old) => old?.map((f) => (f.key === flag.key ? flag : f)));
      void qc.invalidateQueries({ queryKey: flagKeys.history(flag.key) });
      toast.success(`Reset ${flag.key}`, { description: "back to the state declared in code" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: flagKeys.all });
      void qc.invalidateQueries({ queryKey: ["dev", "app"] });
    },
  });
}
