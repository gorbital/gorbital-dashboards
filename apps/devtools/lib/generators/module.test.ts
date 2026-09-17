import { describe, expect, it } from "vitest";
import { defaultModuleForm, isV01LayoutError, moduleNames, titleIndex, toModuleCommand, toModuleInput, validateModuleForm, type ModuleForm } from "./module";
import type { ResourceField } from "./resource";

const field = (over: Partial<ResourceField>): ResourceField => ({ name: "name", type: "string", values: "", unique: false, ...over });

const shelf: ModuleForm = {
  name: "Shelf",
  fields: [field({ unique: true }), field({ name: "description", type: "text" }), field({ name: "visibility", type: "enum", values: "private, shared" }), field({ name: "nickname", optional: true })],
  plural: "",
  idPrefix: "",
};

describe("the module form", () => {
  it("sends every key the generator takes, org always false", () => {
    expect(toModuleInput(shelf)).toEqual({ name: "Shelf", fields: ["name:string:unique", "description:text", "visibility:enum(private,shared)", "nickname:string?"], plural: "", id_prefix: "", org: false });
    expect(toModuleInput({ ...shelf, plural: " Shelves ", idPrefix: "shf" })).toMatchObject({ plural: "Shelves", id_prefix: "shf" });
  });

  it("quotes string? and enum specs in the command", () => {
    expect(toModuleCommand(shelf)).toBe("orb gen module Shelf name:string:unique description:text 'visibility:enum(private,shared)' 'nickname:string?'");
    expect(toModuleCommand({ ...defaultModuleForm(), plural: "People" })).toBe("orb gen module Name name:string --plural People");
  });

  it("derives the module, route, table and permissions", () => {
    expect(moduleNames("BookShelf")).toMatchObject({ plural: "BookShelves", table: "book_shelves", route: "book-shelves" });
    expect(moduleNames("Knife").pkg).toBe("knives");
    expect(moduleNames("Chief").pkg).toBe("chiefs");
    expect(moduleNames("Person", "People").pkg).toBe("people");
    expect(moduleNames("Shelf")).toMatchObject({ pkg: "shelves", table: "shelves", path: "/v1/shelves", dir: "internal/modules/shelves", permissions: ["shelves.shelf.read", "shelves.shelf.write"] });
  });

  it("wants a required string for the title", () => {
    expect(validateModuleForm(shelf)).toEqual({});
    expect(validateModuleForm({ ...shelf, fields: [field({ optional: true })] }).fields).toMatch(/required string field/);
    expect(validateModuleForm({ ...shelf, fields: [field({ name: "nickname", optional: true }), field({ name: "title" })] })).toEqual({});
    expect(titleIndex([field({ name: "nickname", optional: true }), field({ name: "title" })])).toBe(1);
    expect(validateModuleForm({ ...shelf, name: "" }).name).toMatch(/singular name/);
    expect(validateModuleForm({ ...shelf, fields: [field({ optional: true, unique: true })] }).fieldRows).toEqual({ 0: "field name: an optional string can't be unique" });
  });

  it("recognises the v0.1 layout refusal", () => {
    expect(isV01LayoutError("this app uses the v0.1 layout (internal/app/modules.go): use the Resource generator")).toBe(true);
    expect(isV01LayoutError("internal/modules/shelves exists")).toBe(false);
    expect(isV01LayoutError(undefined)).toBe(false);
  });
});
