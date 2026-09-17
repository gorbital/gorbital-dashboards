import { describe, expect, it } from "vitest";
import { defaultResourceForm, deriveIDPrefix, fieldSpec, pluralize, resourceNames, toResourceCommand, toResourceInput, validateField, validateResourceForm, type ResourceField } from "./resource";

const field = (over: Partial<ResourceField>): ResourceField => ({ name: "title", type: "string", values: "", unique: false, ...over });

describe("resource names", () => {
  it("derives every name like NewResourceData", () => {
    expect(resourceNames("Project")).toEqual({ ident: "Project", snake: "project", plural: "Projects", pkg: "projects", table: "projects", route: "projects", idPrefix: "prj" });
    expect(resourceNames("OrderItem")).toEqual({ ident: "OrderItem", snake: "order_item", plural: "OrderItems", pkg: "orderitems", table: "order_items", route: "order-items", idPrefix: "ord" });
    expect(resourceNames("order-item").ident).toBe("OrderItem");
    expect(resourceNames("Person", "People")).toMatchObject({ plural: "People", pkg: "people", table: "people", route: "people" });
    expect(resourceNames("Customer", "", "cst").idPrefix).toBe("cst");
  });

  it("pluralises like the recipes", () => {
    expect(pluralize("category")).toBe("categories");
    expect(pluralize("day")).toBe("days");
    expect(pluralize("box")).toBe("boxes");
    expect(pluralize("batch")).toBe("batches");
    expect(pluralize("note")).toBe("notes");
  });

  it("derives the ID prefix from the first letter and the next consonants", () => {
    expect(deriveIDPrefix("project")).toBe("prj");
    expect(deriveIDPrefix("category")).toBe("ctg");
    expect(deriveIDPrefix("note")).toBe("nt");
    expect(deriveIDPrefix("order_item")).toBe("ord");
  });
});

describe("field specs", () => {
  it("renders the CLI's spec", () => {
    expect(fieldSpec(field({ name: "name", unique: true }))).toBe("name:string:unique");
    expect(fieldSpec(field({ name: "notes", type: "text", unique: true }))).toBe("notes:text");
    expect(fieldSpec(field({ name: "status", type: "enum", values: " active, archived " }))).toBe("status:enum(active,archived)");
  });

  it("validates a field like parseField", () => {
    expect(validateField(field({}))).toBeUndefined();
    expect(validateField(field({ name: "" }))).toMatch(/name:type/);
    expect(validateField(field({ name: "Title" }))).toMatch(/snake_case/);
    expect(validateField(field({ name: "a_very_long_field_name_here" }))).toMatch(/max 20/);
    expect(validateField(field({ name: "owner_id" }))).toMatch(/reserved/);
    expect(validateField(field({ name: "order" }))).toMatch(/reserved/);
    expect(validateField(field({ name: "name_sort" }))).toMatch(/reserved/);
    expect(validateField(field({ name: "notes", type: "text", unique: true }))).toMatch(/only string fields can be unique/);
    expect(validateField(field({ name: "status", type: "enum", values: "open" }))).toMatch(/2 to 20 values/);
    expect(validateField(field({ name: "status", type: "enum", values: "open,Done" }))).toMatch(/snake_case/);
    expect(validateField(field({ name: "status", type: "enum", values: "open,open" }))).toMatch(/more than once/);
    expect(validateField(field({ name: "status", type: "enum", values: "open,done" }))).toBeUndefined();
  });
});

describe("validateResourceForm", () => {
  it("passes a sensible form", () => {
    const f = { ...defaultResourceForm(), name: "Note", fields: [field({ name: "title" }), field({ name: "body", type: "text" })] };
    expect(validateResourceForm(f)).toEqual({});
  });

  it("wants a name, a string field, unique names and at most 20 fields", () => {
    expect(validateResourceForm({ ...defaultResourceForm(), name: "" }).name).toMatch(/singular name/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "1Note" }).name).toMatch(/start with a letter/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", fields: [] }).fields).toMatch(/at least one field/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", fields: [field({ name: "body", type: "text" })] }).fields).toMatch(/at least one string field/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", fields: [field({}), field({})] }).fieldRows).toEqual({ 1: "field title appears more than once" });
    const many = Array.from({ length: 21 }, (_, i) => field({ name: `f${i}` }));
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", fields: many }).fields).toMatch(/at most 20/);
  });

  it("checks the derived names the way the CLI does", () => {
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", plural: "Note" }).plural).toMatch(/must differ/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "News" })).toEqual({});
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Reference" }).plural).toMatch(/reserved in PostgreSQL/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", plural: "1x" }).plural).toMatch(/start with a letter/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "AVeryLongResourceNameIndeed", plural: "AVeryLongResourceNameIndeedList" }).plural).toMatch(/too long/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", idPrefix: "N1" }).idPrefix).toMatch(/2 to 8 lowercase/);
    expect(validateResourceForm({ ...defaultResourceForm(), name: "Note", idPrefix: "nte" })).toEqual({});
  });
});

describe("input and command", () => {
  it("sends only the keys resourceInputJSON accepts", () => {
    const f = { ...defaultResourceForm("org"), name: "Note", fields: [field({ name: "title", unique: true }), field({ name: "status", type: "enum", values: "open,done" })] };
    expect(toResourceInput(f)).toEqual({ name: "Note", fields: ["title:string:unique", "status:enum(open,done)"], scope: "org" });
    expect(toResourceInput({ ...f, plural: "Notes", idPrefix: "nt" })).toMatchObject({ plural: "Notes", id_prefix: "nt" });
  });

  it("quotes enum fields in the command, as the guide says", () => {
    const f = { ...defaultResourceForm(), name: "Note", fields: [field({ name: "title", unique: true }), field({ name: "status", type: "enum", values: "open,done" })] };
    expect(toResourceCommand(f)).toBe("orb gen resource Note title:string:unique 'status:enum(open,done)' --scope user");
    expect(toResourceCommand({ ...f, plural: "Notes" }, true)).toBe("orb gen resource Note title:string:unique 'status:enum(open,done)' --plural Notes --scope user --allow-dirty");
  });
});
