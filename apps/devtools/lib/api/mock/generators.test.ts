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

describe("the module and middleware generators in mock mode", () => {
  it("plans a module with one file per operation and the modules.gen.go diff", async () => {
    const res = await post("/_portal/api/generators/module/plan", { input: { name: "Review", fields: ["title:string:unique", "body:text", "rating:enum(one,two,three)", "nickname:string?"], plural: "", id_prefix: "", org: false } });
    expect(res.status).toBe(200);
    const r = (await res.json()) as GeneratorResponse;
    const paths = r.plan.changes.map((c) => c.path);
    for (const op of ["create_review", "get_review", "list_reviews", "update_review", "delete_review"]) expect(paths).toContain(`internal/modules/reviews/usecase/${op}.go`);
    const gen = r.plan.changes.find((c) => c.path === "internal/modules/modules.gen.go");
    expect(gen).toMatchObject({ kind: "modify" });
    expect(gen?.content).toContain("reviews.Module(),");
    expect(gen?.before).not.toContain("reviews");
    expect(r.plan.result).toMatchObject({ module: "reviews", route: "/v1/reviews", table: "reviews", scope: "user", permissions: ["reviews.review.read", "reviews.review.write"] });
    expect(r.plan.changes.find((c) => c.path.startsWith("db/migrations/"))?.content).toContain("nickname text NOT NULL DEFAULT ''");
  });

  it("refuses what the module generator refuses", async () => {
    const plan = (input: unknown) => post("/_portal/api/generators/module/plan", { input });
    const org = await plan({ name: "Review", fields: ["title:string"], org: true });
    expect(org.status).toBe(200);
    expect(((await org.json()) as { plan: { result: unknown } }).plan.result).toMatchObject({ route: "/v1/orgs/{orgId}/reviews", scope: "org" });
    let res = await plan({ name: "Review", fields: ["nickname:string?"] });
    expect(((await res.json()) as Problem).detail).toMatch(/required string field/);
    res = await plan({ name: "Review", fields: ["nickname:string?:unique", "title:string"] });
    expect(((await res.json()) as Problem).detail).toMatch(/only required string fields can be unique/);
    res = await plan({ name: "Shelf", fields: ["name:string"] });
    expect(res.status).toBe(409);
    res = await post("/_portal/api/generators/module/apply", { input: { name: "Review", fields: ["title:string"] }, allow_dirty: true });
    expect(res.status).toBe(200);
    expect(mockGeneratorState().modules).toContain("reviews");
  });

  it("plans middleware of each kind with the line that wires it", async () => {
    const plan = async (input: unknown) => (await (await post("/_portal/api/generators/middleware/plan", { input })).json()) as GeneratorResponse;
    let r = await plan({ name: "RequireClientVersion", module: "books", global: false, guard: false });
    expect(r.plan.result).toMatchObject({ kind: "module", package: "delivery", file: "internal/modules/books/delivery/require_client_version.go", wire: "gorbital.Use(delivery.RequireClientVersion)" });
    expect(r.plan.changes.map((c) => c.kind)).toEqual(["create", "create"]);
    r = await plan({ name: "RequestTimer", module: "", global: true, guard: false });
    expect(r.plan.result).toMatchObject({ kind: "global", file: "internal/middleware/request_timer.go", wire: "gorbital.WithMiddleware(middleware.RequestTimer)" });
    expect(r.plan.next.join("\n")).toMatch(/main\.go/);
    r = await plan({ name: "OwnsShelf", module: "shelves", global: false, guard: true });
    expect(r.plan.result).toMatchObject({ kind: "guard" });
    expect(r.plan.changes[0].content).toContain("guard.New");
  });

  it("refuses middleware without exactly one of module and global", async () => {
    const plan = (input: unknown) => post("/_portal/api/generators/middleware/plan", { input });
    expect((await plan({ name: "X", module: "books", global: true })).status).toBe(422);
    expect((await plan({ name: "X", module: "", global: false })).status).toBe(422);
    expect((await plan({ name: "X", module: "", global: true, guard: true })).status).toBe(422);
    const res = await plan({ name: "X", module: "loans", global: false });
    expect(((await res.json()) as Problem).detail).toMatch(/module loans not found/);
  });
});
