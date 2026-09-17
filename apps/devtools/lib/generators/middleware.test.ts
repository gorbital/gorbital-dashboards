import { describe, expect, it } from "vitest";
import { defaultMiddlewareForm, middlewareNames, moduleOptions, toMiddlewareCommand, toMiddlewareInput, validateMiddlewareForm, validateMiddlewareInput } from "./middleware";

describe("middleware input", () => {
  it("turns each kind into exactly one of module and global", () => {
    expect(toMiddlewareInput({ name: "RequireClientVersion", kind: "module", module: "books" })).toEqual({ name: "RequireClientVersion", module: "books", global: false, guard: false });
    expect(toMiddlewareInput({ name: "RequestTimer", kind: "global", module: "books" })).toEqual({ name: "RequestTimer", module: "", global: true, guard: false });
    expect(toMiddlewareInput({ name: "OwnsShelf", kind: "guard", module: " shelves " })).toEqual({ name: "OwnsShelf", module: "shelves", global: false, guard: true });
  });

  it("wants exactly one of module and global, and a module for a guard", () => {
    const ok = { name: "RequireClientVersion", module: "books", global: false, guard: false };
    expect(validateMiddlewareInput(ok)).toEqual({});
    expect(validateMiddlewareInput({ ...ok, module: "", global: true })).toEqual({});
    expect(validateMiddlewareInput({ ...ok, global: true }).kind).toMatch(/not both/);
    expect(validateMiddlewareInput({ ...ok, module: "" }).module).toMatch(/choose a module, or make it global/);
    expect(validateMiddlewareInput({ ...ok, module: "", guard: true }).module).toMatch(/a guard belongs to a module/);
    expect(validateMiddlewareInput({ ...ok, module: "", global: true, guard: true }).kind).toMatch(/can't be global/);
    expect(validateMiddlewareInput({ ...ok, guard: true })).toEqual({});
  });

  it("checks the name and the module's shape", () => {
    const ok = { name: "RequireClientVersion", module: "books", global: false, guard: false };
    expect(validateMiddlewareInput({ ...ok, name: "" }).name).toMatch(/give the middleware a name/);
    expect(validateMiddlewareInput({ ...ok, name: "1Bad" }).name).toMatch(/start with a letter/);
    expect(validateMiddlewareInput({ ...ok, module: "Books" }).module).toMatch(/lowercase identifier/);
    expect(validateMiddlewareInput({ ...ok, module: "../books" }).module).toMatch(/lowercase identifier/);
    expect(validateMiddlewareForm({ ...defaultMiddlewareForm(), name: "X" }).module).toMatch(/choose a module/);
  });

  it("hints at the files and the command", () => {
    expect(middlewareNames({ name: "RequireClientVersion", kind: "module", module: "books" })).toMatchObject({ ident: "RequireClientVersion", file: "internal/modules/books/delivery/require_client_version.go" });
    expect(middlewareNames({ name: "request-timer", kind: "global", module: "" })).toMatchObject({ ident: "RequestTimer", file: "internal/middleware/request_timer.go" });
    expect(toMiddlewareCommand({ name: "RequireClientVersion", kind: "module", module: "books" })).toBe("orb gen middleware RequireClientVersion --module books");
    expect(toMiddlewareCommand({ name: "OwnsShelf", kind: "guard", module: "shelves" })).toBe("orb gen middleware OwnsShelf --module shelves --guard");
    expect(toMiddlewareCommand({ name: "RequestTimer", kind: "global", module: "books" })).toBe("orb gen middleware RequestTimer --global");
  });

  it("lists the modules the routes name", () => {
    expect(moduleOptions([{ module: "shelves" }, { module: "" }, { module: "books" }, { module: "books" }])).toEqual(["books", "shelves"]);
    expect(moduleOptions(undefined)).toEqual([]);
  });
});
