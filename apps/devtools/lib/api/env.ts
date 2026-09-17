"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { retry } from "./queries";
import type { DevConfigList } from "./types";

/*
 * The env editor (ADR-0074): orb dev reads and rewrites the app's .env
 * against .env.example at /_portal/api/env. The shapes match
 * cli/internal/portal/env.go field for field.
 */

/** One key as the editor shows it (`portal.EnvEntry`). */
export type EnvEntry = {
  key: string;
  /** The value in .env, masked when `secret`; empty when the key isn't set. */
  value: string;
  /** The key is in .env at all (an empty value is set). */
  set: boolean;
  /** The value in .env.example. */
  example: string;
  in_example: boolean;
  /** In .env.example but not in .env. */
  missing: boolean;
  /** The comment block above the key in .env.example (or .env when only there). */
  description?: string;
  /** Masked until revealed; decided by the name. */
  secret: boolean;
  /** The key's line in .env, 0 when absent. */
  line: number;
};

export type EnvList = { entries: EnvEntry[]; file: string; example: string };

export type EnvReveal = { key: string; value: string };

/** What `PUT env` carries. */
export type EnvChange = { set?: Record<string, string>; unset?: string[] };

export type EnvChangeResult = { entries: EnvEntry[]; restart_needed: boolean };

export const envKeys = {
  list: ["portal", "env"] as const,
  config: ["dev", "config"] as const,
};

/** True when this orb dev edits no .env (404 `no_env_editor`). */
export function isNoEnvEditor(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "no_env_editor";
}

/** `GET /_portal/api/env`: every key of .env and .env.example, secrets masked. */
export function useEnv(enabled = true) {
  return useQuery({
    queryKey: envKeys.list,
    queryFn: () => apiFetch<EnvList>("/_portal/api/env"),
    enabled,
    staleTime: 10_000,
    retry,
  });
}

/** `GET env/{key}`: the value revealed; 404 `env_key_not_found` when the key isn't in .env. Never cached. */
export function revealEnv(key: string): Promise<EnvReveal> {
  return apiFetch<EnvReveal>(`/_portal/api/env/${encodeURIComponent(key)}`, { cache: "no-store" });
}

/** `PUT env` with `set` and `unset`; the answer carries the new entries and `restart_needed`. 400 `invalid_env_change` names the key. */
export function useUpdateEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: EnvChange) => apiFetch<EnvChangeResult>("/_portal/api/env", { method: "PUT", json: change }),
    onSuccess: (result, change) => {
      qc.setQueryData<EnvList>(envKeys.list, (old) => (old ? { ...old, entries: result.entries } : { entries: result.entries, file: ".env", example: ".env.example" }));
      const set = Object.keys(change.set ?? {});
      const unset = change.unset ?? [];
      const what = [...set.map((k) => `set ${k}`), ...unset.map((k) => `removed ${k}`)].join(", ");
      toast.success(`Saved .env: ${what}`, { description: result.restart_needed ? "The app reads .env when it starts; restart it to apply." : undefined });
    },
    onError: (err) => toast.error("Couldn't change .env", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: envKeys.list }),
  });
}

/** `GET /_dev/config`: the variables the running app read, secrets as set/unset only. Needs the console. */
export function useDevConfig(enabled: boolean) {
  return useQuery({
    queryKey: envKeys.config,
    queryFn: () => apiFetch<DevConfigList>("/_portal/app/_dev/config"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** The entry for one key, for Project Settings' fields. */
export function envEntry(list: EnvList | undefined, key: string): EnvEntry | undefined {
  return list?.entries.find((e) => e.key === key);
}

/** `useUpdateEnv`, also refreshing Project Settings, which reads the same file. */
export function useSetEnv() {
  const qc = useQueryClient();
  const update = useUpdateEnv();
  return {
    ...update,
    mutate: (change: EnvChange, options?: Parameters<typeof update.mutate>[1]) =>
      update.mutate(change, {
        ...options,
        onSettled: (...args) => {
          void qc.invalidateQueries({ queryKey: ["portal", "project"] });
          options?.onSettled?.(...args);
        },
      }),
    mutateAsync: async (change: EnvChange, options?: Parameters<typeof update.mutateAsync>[1]) => {
      try {
        return await update.mutateAsync(change, options);
      } finally {
        void qc.invalidateQueries({ queryKey: ["portal", "project"] });
      }
    },
  };
}
