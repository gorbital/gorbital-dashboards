/**
 * The module generator's form as pure logic (ADR-0083, Phase 8): a layered
 * module for apps on gorbital.Main. The field editor is the resource
 * generator's, with `string?` for optional strings; the names come from the
 * same derivation. With `org`, records belong to an organisation (`--org`,
 * Phase 7): routes under `/v1/orgs/{orgId}/` guarded by `guard.OrgMember`.
 * Apps on the v0.1 layout use the resource generator.
 */

import { splitWords } from "@/lib/jobs/form";
import { fieldSpec, resourceNames, validateResourceForm, type ResourceErrors, type ResourceField } from "./resource";

export type ModuleForm = {
  name: string;
  fields: ResourceField[];
  plural: string;
  idPrefix: string;
  /** Records belong to an organisation rather than the signed-in user. */
  org: boolean;
};

/** What `generators/module` takes as `{"input": …}`. */
export type ModuleGeneratorInput = {
  name: string;
  /** Specs as on the command line: `name:string:unique`, `nickname:string?`. */
  fields: string[];
  plural: string;
  id_prefix: string;
  /** `--org`: records belong to an organisation; the app needs orgshttp. */
  org: boolean;
};

/** `plan.result` of the module generator. */
export type ModuleGeneratorResult = {
  name: string;
  module: string;
  route: string;
  table: string;
  scope: string;
  permissions: string[];
  migration: string;
  files: string[];
  dry_run: boolean;
};

/** What `--org` does, for the form's hint. */
export const ORG_HINT = "Routes under /v1/orgs/{orgId}/, guarded by guard.OrgMember: members reach the records through their role, anyone else gets 404. The app needs the organisations module (orgshttp.Module in main.go).";

export function defaultModuleForm(): ModuleForm {
  return { name: "", fields: [{ name: "name", type: "string", values: "", unique: false }], plural: "", idPrefix: "", org: false };
}

/** The index of the title: the first required string field, or -1. */
export function titleIndex(fields: ResourceField[]): number {
  return fields.findIndex((f) => f.type === "string" && !f.optional);
}

/** The module generator's plural of the last word: -lf, -eaf and -ife become -ves (Shelf → Shelves); the rest as the resource generator. */
export function modulePlural(name: string): string {
  const words = splitWords(name.trim());
  const last = words[words.length - 1] ?? "";
  const m = /^(.*(?:l|ea|i))(fe?)$/.exec(last);
  if (!m) return "";
  return [...words.slice(0, -1), `${m[1]}ves`].join("_");
}

/** The names the module generator derives: the package and directory, the route, the table, the permissions. The plan's result is the truth. */
export function moduleNames(name: string, plural = "", idPrefix = "", org = false) {
  const n = resourceNames(name, plural.trim() || modulePlural(name), idPrefix);
  const path = org ? `/v1/orgs/{orgId}/${n.route}` : `/v1/${n.route}`;
  return { ...n, dir: `internal/modules/${n.pkg}`, path, permissions: [`${n.pkg}.${n.snake}.read`, `${n.pkg}.${n.snake}.write`] };
}

/** The resource form's checks, plus the module's: a required string field for the title. */
export function validateModuleForm(form: ModuleForm): ResourceErrors {
  const errors = validateResourceForm({ ...form, plural: form.plural.trim() || modulePlural(form.name), scope: form.org ? "org" : "user" });
  if (!errors.fields && !errors.fieldRows && titleIndex(form.fields) < 0) errors.fields = "add at least one required string field, such as name:string; the first one is the title lists sort by";
  return errors;
}

export function toModuleInput(form: ModuleForm): ModuleGeneratorInput {
  return { name: form.name.trim(), fields: form.fields.map(fieldSpec), plural: form.plural.trim(), id_prefix: form.idPrefix.trim(), org: form.org };
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The equivalent `orb gen module …` command; `string?` and enum specs are quoted for the shell. */
export function toModuleCommand(form: ModuleForm): string {
  const parts = ["orb gen module", shellQuote(form.name.trim() || "Name"), ...form.fields.map((f) => shellQuote(fieldSpec(f)))];
  if (form.plural.trim()) parts.push("--plural", shellQuote(form.plural.trim()));
  if (form.idPrefix.trim()) parts.push("--id-prefix", shellQuote(form.idPrefix.trim()));
  if (form.org) parts.push("--org");
  return parts.join(" ");
}

/** The generator refused because the app is on the v0.1 layout, where the resource generator applies. */
export function isV01LayoutError(detail: string | undefined): boolean {
  return Boolean(detail && (/v0\.1 layout/i.test(detail) || /use the Resource generator/i.test(detail) || /internal\/app\/modules\.go/.test(detail)));
}
