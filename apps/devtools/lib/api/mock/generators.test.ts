import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import { mockGeneratorState } from "./generators";
import type { GeneratorResponse, Problem } from "../types";

const post = (path: string, body: unknown) => mockFetch(path, { method: "POST", headers: { "X-Orb-Portal": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => resetMock());

describe("the generators hub in mock mode", () => {
  it("plans a resource with the CLI's files and refuses what the CLI refuses", async () => {
    let res = await post("/_portal/api/generators/resource/plan", { input: { name: "Note", fields: ["title:string:unique", "body:text", "status:enum(open,done)"] } });
    expect(res.status).toBe(200);
    const r = (await res.json()) as GeneratorResponse;
    expect(r.applied).toBe(false);
    expect(r.plan.generator).toBe("resource");
    expect(r.plan.changes.map((c) => c.path)).toContain("internal/modules/notes/module.go");
    expect(r.plan.changes.find((c) => c.path === "internal/app/modules.go")).toMatchObject({ kind: "modify" });
    expect(r.plan.changes.find((c) => c.path.startsWith("db/migrations/"))?.content).toContain("CREATE TABLE notes");
    expect(r.plan.summary).toContain("Resource:  Note");
    res = await post("/_portal/api/generators/resource/plan", { input: { name: "Note", fields: ["body:text"] } });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).detail).toMatch(/at least one string field/);
    res = await post("/_portal/api/generators/resource/plan", { input: { name: "Project", fields: ["name:string"] } });
    expect(res.status).toBe(409);
  });

  it("applies only with allow_dirty and remembers it", async () => {
    const input = { name: "Note", fields: ["title:string"] };
    let res = await post("/_portal/api/generators/resource/apply", { input });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).detail).toMatch(/allow-dirty/);
    res = await post("/_portal/api/generators/resource/apply", { input, allow_dirty: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as GeneratorResponse).applied).toBe(true);
    expect(mockGeneratorState().modules).toContain("notes");
    res = await post("/_portal/api/generators/resource/plan", { input });
    expect(res.status).toBe(409);
  });

  it("plans add-mail as a diff and says when nothing changes", async () => {
    let res = await post("/_portal/api/generators/add-mail/plan", { input: { provider: "smtp", smtp_host: "smtp.postmarkapp.com", smtp_username: "token" } });
    let r = (await res.json()) as GeneratorResponse;
    expect(r.plan.changes.map((c) => c.path)).toEqual(["internal/app/infra_mail.go", "internal/app/infra_mail_test.go", ".env.example", ".env", "gorbital.yaml", "gorbital.lock"]);
    expect(r.plan.changes[0]).toMatchObject({ kind: "modify" });
    expect(r.plan.changes.find((c) => c.path === ".env")?.content).toContain("SMTP_HOST=smtp.postmarkapp.com");
    expect(r.plan.next[1]).toBe("Next steps:");
    res = await post("/_portal/api/generators/add-mail/plan", { input: { provider: "resend" } });
    r = (await res.json()) as GeneratorResponse;
    expect(r.plan.changes).toEqual([]);
    expect(r.plan.summary).toMatch(/nothing to change/);
    res = await post("/_portal/api/generators/add-mail/plan", { input: { provider: "ses" } });
    expect(res.status).toBe(422);
    res = await post("/_portal/api/generators/add-mail/apply", { input: { provider: "smtp" }, allow_dirty: true });
    expect(res.status).toBe(200);
    expect(mockGeneratorState().mail).toBe("smtp");
  });

  it("plans add-storage per driver and writes .env on apply", async () => {
    let res = await post("/_portal/api/generators/add-storage/plan", { input: { driver: "minio" } });
    let r = (await res.json()) as GeneratorResponse;
    expect(r.plan.changes.map((c) => c.path)).toEqual([".env.example", ".env", "compose.yaml"]);
    expect(r.plan.changes[2].content).toContain("minio:");
    res = await post("/_portal/api/generators/add-storage/plan", { input: { driver: "s3" } });
    expect(res.status).toBe(422);
    res = await post("/_portal/api/generators/add-storage/apply", { input: { driver: "minio" }, allow_dirty: true });
    expect(res.status).toBe(200);
    r = (await res.json()) as GeneratorResponse;
    expect(r.applied).toBe(true);
    const project = (await (await mockFetch("/_portal/api/project")).json()) as { storage: { driver: string; bucket?: string } };
    expect(project.storage).toMatchObject({ driver: "minio", bucket: "acme-api" });
  });

  it("plans add-rls once, and add-orgs says the app already has organisations", async () => {
    let res = await post("/_portal/api/generators/add-rls/plan", { input: {} });
    let r = (await res.json()) as GeneratorResponse;
    expect(r.plan.changes.map((c) => c.kind)).toEqual(["create", "modify", "modify"]);
    expect(r.plan.changes[1].content).toContain("rls: true");
    res = await post("/_portal/api/generators/add-rls/apply", { input: {}, allow_dirty: true });
    expect(res.status).toBe(200);
    res = await post("/_portal/api/generators/add-rls/plan", { input: {} });
    r = (await res.json()) as GeneratorResponse;
    expect(r.plan.changes).toEqual([]);
    res = await post("/_portal/api/generators/add-orgs/plan", { input: {} });
    r = (await res.json()) as GeneratorResponse;
    expect(r.plan.summary).toMatch(/already has organisations/);
  });
});
