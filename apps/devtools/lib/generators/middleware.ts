/**
 * The middleware generator's form as pure logic (ADR-0082, Phase 8): module
 * middleware (added with `gorbital.Use` or `Module.Middleware`), global
 * middleware (added to main.go with `gorbital.WithMiddleware`; the generator
 * never edits main.go) or a guard (a route option built with `guard.New`).
 */

import { splitWords } from "@/lib/jobs/form";

export type MiddlewareKind = "module" | "global" | "guard";

export type MiddlewareForm = {
  name: string;
  kind: MiddlewareKind;
  /** The module's name, for module middleware and guards. */
  module: string;
};

/** What `generators/middleware` takes: exactly one of `module` and `global`; `guard` needs `module`. */
export type MiddlewareGeneratorInput = {
  name: string;
  module: string;
  global: boolean;
  guard: boolean;
};

/** `plan.result` of the middleware generator. */
export type MiddlewareGeneratorResult = {
  name: string;
  kind: MiddlewareKind;
  module: string;
  package: string;
  file: string;
  test: string;
  files: string[];
  /** The line to add where it's wired: `gorbital.Use(delivery.RequireClientVersion)`. */
  wire: string;
  dry_run: boolean;
};

export type MiddlewareErrors = Partial<Record<"name" | "module" | "kind", string>>;

export const MIDDLEWARE_KINDS: { value: MiddlewareKind; label: string }[] = [
  { value: "module", label: "Module middleware" },
  { value: "global", label: "Global middleware" },
  { value: "guard", label: "Guard" },
];

const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const modulePattern = /^[a-z][a-z0-9_]*$/;

export function defaultMiddlewareForm(module = ""): MiddlewareForm {
  return { name: "", kind: "module", module };
}

export function toMiddlewareInput(form: MiddlewareForm): MiddlewareGeneratorInput {
  const global = form.kind === "global";
  return { name: form.name.trim(), module: global ? "" : form.module.trim(), global, guard: form.kind === "guard" };
}

/** Checks the input the way the generator does; empty when it would plan. */
export function validateMiddlewareInput(input: MiddlewareGeneratorInput): MiddlewareErrors {
  const errors: MiddlewareErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "give the middleware a name, such as RequireClientVersion";
  else if (name.length > 60 || !namePattern.test(name)) errors.name = "the name must start with a letter and use letters, digits, hyphens or underscores (max 60), such as RequireClientVersion";
  const module = input.module.trim();
  if (module && input.global) errors.kind = "choose a module or global, not both";
  else if (input.guard && input.global) errors.kind = "a guard is a route option, so it can't be global";
  else if (input.guard && !module) errors.module = "a guard belongs to a module: choose the module whose routes use it";
  else if (!module && !input.global) errors.module = "choose a module, or make it global middleware";
  if (module && !errors.module && !modulePattern.test(module)) errors.module = `module "${module}" must be a lowercase identifier, such as books`;
  return errors;
}

export function validateMiddlewareForm(form: MiddlewareForm): MiddlewareErrors {
  return validateMiddlewareInput(toMiddlewareInput(form));
}

/** The Go name and the files the generator is expected to write, for the form's hints; the plan is the truth. */
export function middlewareNames(form: MiddlewareForm) {
  const words = splitWords(form.name.trim() || "Middleware");
  const ident = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  const snake = words.join("_");
  const module = form.module.trim() || "<module>";
  const dir = form.kind === "global" ? "internal/middleware" : `internal/modules/${module}/delivery`;
  return { ident, snake, file: `${dir}/${snake}.go`, test: `${dir}/${snake}_test.go` };
}

/** The equivalent `orb gen middleware …` command. */
export function toMiddlewareCommand(form: MiddlewareForm): string {
  const input = toMiddlewareInput(form);
  const parts = ["orb gen middleware", input.name || "Name"];
  if (input.global) parts.push("--global");
  else parts.push("--module", input.module || "<module>");
  if (input.guard) parts.push("--guard");
  return parts.join(" ");
}

/** Distinct module names from the routes endpoint, sorted; library routes (no module) are left out. */
export function moduleOptions(routes: { module: string }[] | undefined): string[] {
  return [...new Set((routes ?? []).map((r) => r.module).filter(Boolean))].sort();
}
