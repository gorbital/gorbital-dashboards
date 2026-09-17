import { describe, expect, it } from "vitest";
import { describeOrgsPlan, isFileListPlan, isNoop, nextStepsPreformatted, planChanges, summaryLines } from "./plan";

describe("plan text", () => {
  it("tells pre-formatted next steps from one-per-line steps", () => {
    expect(nextStepsPreformatted(["Write the SQL under -- +goose Up", "go run ./cmd/migrate"])).toBe(false);
    expect(nextStepsPreformatted(["Next steps:", "  1. ✓ The SMTP server is saved in .env", "", "In development every email goes to Mailpit"])).toBe(true);
    expect(nextStepsPreformatted([])).toBe(false);
    expect(nextStepsPreformatted(null)).toBe(false);
  });

  it("strips the CLI's indent from the summary", () => {
    expect(summaryLines("  Resource:  Note (table notes)\n  API:       /v1/notes\n  Fields:\n    title  string\n")).toEqual(["Resource:  Note (table notes)", "API:       /v1/notes", "Fields:", "  title  string"]);
    expect(summaryLines("File storage with minio: .env")).toEqual(["File storage with minio: .env"]);
    expect(summaryLines("")).toEqual([]);
  });
});

describe("add-orgs", () => {
  it("reads the dry run: the branch, the files and the count", () => {
    const plan = {
      generator: "add-orgs",
      summary: "Turns the app multi-tenant on branch orb-add-orgs: organisations with members, roles and invitations; 3 files change. orb add orgs builds the app, regenerates api/, records api/surface.json and commits on that branch; review it there.",
      changes: [
        { path: "internal/app/orgs.go", kind: "modify" as const, content: "" },
        { path: "db/migrations/20260918000001_orgs.sql", kind: "modify" as const, content: "" },
        { path: "go.mod", kind: "modify" as const, content: "" },
      ],
      next: ["Review the branch orb-add-orgs and merge it", "docs/guides/organisations.md"],
    };
    expect(describeOrgsPlan(plan)).toEqual({ already: false, branch: "orb-add-orgs", files: ["internal/app/orgs.go", "db/migrations/20260918000001_orgs.sql", "go.mod"], count: 3 });
    expect(isFileListPlan(plan)).toBe(true);
    expect(isNoop(plan)).toBe(false);
  });

  it("handles null changes and the already-multi-tenant answer", () => {
    const already = { generator: "add-orgs", summary: "The app already has organisations; nothing to change.", changes: null, next: null };
    expect(planChanges(already)).toEqual([]);
    expect(describeOrgsPlan(already)).toEqual({ already: true, branch: "orb-add-orgs", files: [], count: 0 });
    expect(isNoop(already)).toBe(true);
    const empty = { generator: "add-orgs", summary: "Turns the app multi-tenant on branch orb-add-orgs: …; 0 files change.", changes: null, next: ["Review the branch orb-add-orgs and merge it"] };
    expect(describeOrgsPlan(empty)).toMatchObject({ already: false, branch: "orb-add-orgs", count: 0 });
  });

  it("shows plans with content as diffs, not file lists", () => {
    expect(isFileListPlan({ generator: "add-rls", changes: [{ path: "gorbital.yaml", kind: "modify", content: "rls: true\n", before: "" }] })).toBe(false);
    expect(isFileListPlan({ generator: "add-rls", changes: [] })).toBe(false);
  });
});
