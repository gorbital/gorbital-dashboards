/**
 * What the hub says about each generator `GET /_portal/api/status` lists
 * (ADR-0077): the card's title, what it writes, what it needs, and the CLI
 * command it stands for. An orb that lists a name this catalog doesn't
 * know gets a generic card.
 */

import type { GeneratorName } from "@/lib/api/types";

export type GeneratorNeed = "database" | "multi";

export type GeneratorInfo = {
  name: GeneratorName;
  title: string;
  /** One line under the title. */
  blurb: string;
  /** What apply writes or does. */
  writes: string[];
  /** The command the card stands for. */
  cli: string;
  /** What the app must have: a database (the Full preset), organisations (multi-tenant). */
  needs: GeneratorNeed[];
  /** After apply: the app must restart, migrations wait, or the work is on a branch. */
  after: "restart" | "migrate" | "branch" | "none";
  /** The generator has its own screen; the card links there instead of opening a sheet. */
  href?: string;
};

export const GENERATOR_CATALOG: Record<GeneratorName, GeneratorInfo> = {
  resource: {
    name: "resource",
    title: "Resource",
    blurb: "A module for records that belong to a user or an organisation: domain rules, use cases, SQL, endpoints, tests and a migration.",
    writes: ["internal/modules/<names>/ (domain, usecase, repository, delivery)", "internal/app/module_<names>.go and <names>_test.go", "db/migrations/<version>_<names>.sql", "one line in internal/app/modules.go and permissions.go"],
    cli: "orb gen resource",
    needs: ["database"],
    after: "migrate",
  },
  module: {
    name: "module",
    title: "Module",
    blurb: "A layered module for apps on gorbital.Main: domain, use cases, repository and delivery, one file per operation, with tests and a migration.",
    writes: ["internal/modules/<names>/ (domain, usecase, repository, delivery)", "one file per operation, and their tests", "db/migrations/<version>_<names>.sql", "internal/modules/modules.gen.go"],
    cli: "orb gen module",
    needs: ["database"],
    after: "migrate",
  },
  middleware: {
    name: "middleware",
    title: "Middleware",
    blurb: "Middleware for one module or the whole app, or a guard for single routes, with a test. You add the line that wires it.",
    writes: ["internal/modules/<module>/delivery/<name>.go and its test", "or internal/middleware/<name>.go, for the whole app", "no edits to routes.go, module.go or main.go"],
    cli: "orb gen middleware",
    needs: [],
    after: "restart",
  },
  job: {
    name: "job",
    title: "Job",
    blurb: "A background job by form, CLI or code: a schedule, an interval or on demand; HTTP, SQL, email, dispatch or custom Go.",
    writes: ["internal/jobs/<package>/<package>.go and its test", "internal/app/job_<name>.go", "one line in internal/app/jobs.go"],
    cli: "orb gen job",
    needs: ["database"],
    after: "restart",
    href: "/jobs?new=1",
  },
  migration: {
    name: "migration",
    title: "Migration",
    blurb: "An empty goose migration for a change that isn't a new resource: a column, an index, a data fix.",
    writes: ["db/migrations/<version>_<name>.sql with an empty +goose Up section"],
    cli: "orb gen migration",
    needs: ["database"],
    after: "migrate",
  },
  "add-mail": {
    name: "add-mail",
    title: "Email provider",
    blurb: "Resend or any SMTP server; run it again to switch. Secrets go in .env by hand, never through here.",
    writes: ["internal/app/infra_mail.go and infra_mail_test.go", "the mail block of .env.example, and .env", "gorbital.yaml, gorbital.lock", "go.mod (the provider module), then go mod tidy"],
    cli: "orb add mail",
    needs: [],
    after: "restart",
  },
  "add-storage": {
    name: "add-storage",
    title: "File storage",
    blurb: "Where the app keeps files: the local disk, MinIO in compose.yaml, S3, Spaces or R2.",
    writes: ["the storage block of .env.example, and .env", "compose.yaml (the MinIO service, for minio)"],
    cli: "orb add storage",
    needs: [],
    after: "restart",
  },
  "add-rls": {
    name: "add-rls",
    title: "Row-level security",
    blurb: "A fifth isolation layer in PostgreSQL for multi-tenant apps: forced RLS with the org_isolation policy on every organisation table.",
    writes: ["db/migrations/<version>_row_level_security.sql", "gorbital.yaml (rls: true)", "gorbital.lock"],
    cli: "orb add rls",
    needs: ["database", "multi"],
    after: "migrate",
  },
  "add-orgs": {
    name: "add-orgs",
    title: "Organisations",
    blurb: "Turns a single-tenant Full app into a multi-tenant one on branch orb-add-orgs: members, roles, invitations, personal workspaces.",
    writes: ["the multi-tenant app's files merged into yours, on a branch", "two migrations: orgs, and the conversion of projects", "go.mod, api/openapi.json, api/surface.json, then a commit"],
    cli: "orb add orgs",
    needs: ["database"],
    after: "branch",
  },
};

/** The catalog's entry, or a generic one for a name this UI doesn't know. */
export function generatorInfo(name: string): GeneratorInfo {
  return (
    (GENERATOR_CATALOG as Record<string, GeneratorInfo>)[name] ?? {
      name: name as GeneratorName,
      title: name,
      blurb: "A generator this orb offers that this Dev Portal build doesn't describe yet; it takes no input here.",
      writes: [],
      cli: `orb gen ${name}`,
      needs: [],
      after: "none",
    }
  );
}

/** The catalog's order for the cards: what the status lists, known ones first in this order, the rest after. */
export function orderGenerators(names: string[]): string[] {
  const order: string[] = ["resource", "module", "middleware", "job", "migration", "add-mail", "add-storage", "add-orgs", "add-rls"];
  return [...names].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
  });
}

/** Why the card is gated, given the project; undefined when the generator applies. */
export function gateReason(info: GeneratorInfo, project: { database: boolean; tenancy?: string } | undefined): string | undefined {
  if (!project) return undefined;
  if (info.needs.includes("database") && !project.database) return "needs the Full preset: this app has no database";
  if (info.needs.includes("multi") && project.tenancy !== "multi") return "needs organisations: run orb add orgs first";
  return undefined;
}
