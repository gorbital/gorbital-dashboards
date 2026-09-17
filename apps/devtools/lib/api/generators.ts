"use client";

/**
 * The generators hub's data layer (ADR-0077): every generator the status
 * lists, planned and applied through `POST /_portal/api/generators/{name}/plan`
 * and `/apply` with the same envelope the Jobs screen uses
 * (`{"input": {…}, "allow_dirty": bool}`; `planJob`/`applyJob` in queries.ts).
 * The inputs are the CLI's flags with underscores: `resourceInputJSON`,
 * `migrationInputJSON`, `addMailInputJSON`, `addStorageInputJSON` in
 * `cli/internal/cli/dev_portal.go` and `add_plans.go`; `add-rls` and
 * `add-orgs` take `{}`.
 */

import { apiFetch } from "./client";
import type { GeneratorRequest, GeneratorResponse, Plan } from "./types";
import type { AddMailInput, AddStorageInput } from "@/lib/generators/add";
import type { ResourceGeneratorInput } from "@/lib/generators/resource";

export type MigrationGeneratorInput = { name: string };

/** The input each generator takes; `job` has its own sheet on the Jobs page. */
export type GeneratorInputs = {
  resource: ResourceGeneratorInput;
  migration: MigrationGeneratorInput;
  "add-mail": AddMailInput;
  "add-storage": AddStorageInput;
  "add-rls": Record<string, never>;
  "add-orgs": Record<string, never>;
};

export type HubGenerator = keyof GeneratorInputs;

/** A response as the UI wants it: Go's `null` for an empty `changes` or `next` becomes `[]`. */
export type NormalizedResponse = { plan: Plan; applied: boolean };

export function normalizeResponse(res: GeneratorResponse): NormalizedResponse {
  const plan = res.plan as Plan & { changes: Plan["changes"] | null; next: Plan["next"] | null };
  return { applied: res.applied, plan: { ...plan, changes: plan.changes ?? [], next: plan.next ?? [] } };
}

/** `POST generators/{name}/plan`: what the generator would write. 422 `generator_failed` carries the CLI's usage message in `detail`; 409 `plan_conflict` a file that exists. */
export function planGenerator<N extends HubGenerator>(name: N, input: GeneratorInputs[N]): Promise<NormalizedResponse> {
  return apiFetch<GeneratorResponse>(`/_portal/api/generators/${name}/plan`, { method: "POST", json: { input } satisfies GeneratorRequest<GeneratorInputs[N]> }).then(normalizeResponse);
}

/** `POST generators/{name}/apply`: plans again and writes; refused on a dirty git tree unless `allowDirty`. `add-orgs` runs its branch workflow instead. */
export function applyGenerator<N extends HubGenerator>(name: N, input: GeneratorInputs[N], allowDirty: boolean): Promise<NormalizedResponse> {
  return apiFetch<GeneratorResponse>(`/_portal/api/generators/${name}/apply`, { method: "POST", json: { input, allow_dirty: allowDirty || undefined } satisfies GeneratorRequest<GeneratorInputs[N]> }).then(normalizeResponse);
}
