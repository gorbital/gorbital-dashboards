import { describe, expect, it } from "vitest";
import { gateReason, generatorInfo, orderGenerators } from "./catalog";

describe("generator catalog", () => {
  it("orders what the status lists and keeps unknown names", () => {
    expect(orderGenerators(["add-mail", "add-orgs", "add-rls", "add-storage", "job", "middleware", "migration", "module", "resource"])).toEqual(["resource", "module", "middleware", "job", "migration", "add-mail", "add-storage", "add-orgs", "add-rls"]);
    expect(orderGenerators(["zeta", "job", "alpha"])).toEqual(["job", "alpha", "zeta"]);
  });

  it("describes unknown generators generically", () => {
    expect(generatorInfo("webhook")).toMatchObject({ title: "webhook", cli: "orb gen webhook", needs: [] });
    expect(generatorInfo("module")).toMatchObject({ title: "Module", needs: ["database"], after: "migrate" });
    expect(generatorInfo("middleware")).toMatchObject({ title: "Middleware", needs: [], after: "restart" });
    expect(generatorInfo("resource").needs).toEqual(["database"]);
  });

  it("gates on the preset and the tenancy", () => {
    expect(gateReason(generatorInfo("resource"), { database: false })).toMatch(/Full preset/);
    expect(gateReason(generatorInfo("resource"), { database: true })).toBeUndefined();
    expect(gateReason(generatorInfo("add-rls"), { database: true, tenancy: "single" })).toMatch(/orb add orgs/);
    expect(gateReason(generatorInfo("add-rls"), { database: true, tenancy: "multi" })).toBeUndefined();
    expect(gateReason(generatorInfo("add-mail"), { database: false })).toBeUndefined();
    expect(gateReason(generatorInfo("add-mail"), undefined)).toBeUndefined();
  });
});
