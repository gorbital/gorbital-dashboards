import { describe, expect, it } from "vitest";
import { migrationSlug, snippetNameError, suggestSnippetName } from "./snippets";

describe("snippetNameError", () => {
  it("accepts letters, digits, hyphens and underscores up to 80", () => {
    expect(snippetNameError("active-projects")).toBeUndefined();
    expect(snippetNameError("Q1_report_2026")).toBeUndefined();
    expect(snippetNameError("a".repeat(80))).toBeUndefined();
  });

  it("explains what's wrong", () => {
    expect(snippetNameError("")).toMatch(/needed/);
    expect(snippetNameError("a".repeat(81))).toMatch(/80/);
    expect(snippetNameError("-lead")).toMatch(/Start with/);
    expect(snippetNameError("_lead")).toMatch(/Start with/);
    expect(snippetNameError("has space")).toMatch(/Letters, digits/);
    expect(snippetNameError("dots.sql")).toMatch(/Letters, digits/);
    expect(snippetNameError("../escape")).toBeDefined();
  });
});

describe("suggestSnippetName", () => {
  it("slugifies the first non-comment line", () => {
    expect(suggestSnippetName("-- busiest owners\nSELECT owner_id, count(*) FROM projects")).toBe("select-owner_id-count-from");
  });
  it("falls back to query", () => {
    expect(suggestSnippetName("")).toBe("query");
    expect(suggestSnippetName("-- only a comment")).toBe("query");
  });
});

describe("migrationSlug", () => {
  it("matches the server's derivation", () => {
    expect(migrationSlug("Add index on projects(status)")).toBe("add_index_on_projects_status");
    expect(migrationSlug("  ---  ")).toBe("");
    expect(migrationSlug("x".repeat(70))).toHaveLength(60);
  });
});
