/**
 * `GET /_portal/api/routes` in mock mode (ADR-0082): the sample app's routes
 * with their guards, middleware and source positions. The library's routes
 * (health, auth, orgs, ops) have no module and no source; the app's own
 * modules (projects, and a Shelfie-like books and shelves) do. The dev
 * console's list gains the books and shelves routes too, so the two join;
 * one webhook route is only in the source, as after an edit the running app
 * hasn't picked up yet. The first call waits, as orb builds the app then.
 */

import { devRoutes, portalStatus, routes as sampleRoutes } from "@/lib/mock";
import type { RouteInfo, RouteList } from "../routes";
import type { DevRouteList } from "../types";

const at = (file: string, line: number) => ({ file, line });

const lib = (method: string, path: string, operation_id: string, summary: string, tags: string[], guards: string[]): RouteInfo => ({
  method,
  path,
  operation_id,
  summary,
  tags,
  module: "",
  handler: "",
  source: null,
  handler_source: null,
  guards,
  middleware: [],
  public: guards.includes("public"),
  deprecated: false,
});

/** The acme sample's routes, as the source reader would describe them. */
function sampleInfo(): RouteInfo[] {
  return sampleRoutes.map((x, i) => {
    const pub = x.mw.length === 0 || x.mw.every((m) => m.startsWith("ratelimit"));
    const rate = x.mw.find((m) => m.startsWith("ratelimit"));
    const limit = rate ? [`rate_limit:${/(\d+)/.exec(rate)?.[1] ?? "10"}/1m0s`] : [];
    const summary = x.handler.split(".")[1]?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "";
    if (x.module === "projects") {
      const write = x.method !== "GET";
      const handler = `h.${x.op}`;
      return {
        method: x.method,
        path: x.path,
        operation_id: x.op,
        summary,
        tags: [x.module],
        module: "projects",
        handler,
        source: at("internal/modules/projects/delivery/projects.go", 40 + i * 9),
        handler_source: at("internal/modules/projects/delivery/handlers.go", 22 + i * 17),
        guards: ["authenticated", `permission:projects.project.${write ? "write" : "read"}`],
        middleware: [],
        public: false,
        deprecated: false,
      };
    }
    const guards = pub ? ["public", ...limit] : ["authenticated", ...(x.module === "ops" ? ["role:platform_admin"] : []), ...(x.path.includes("2fa") ? ["recent_reauth"] : []), ...limit];
    return lib(x.method, x.path, x.op, summary, [x.module], guards);
  });
}

type Shelfie = Omit<RouteInfo, "tags" | "public" | "deprecated"> & { deprecated?: boolean };

const BOOKS_ROUTES = "internal/modules/books/routes.go";
const BOOKS_HANDLERS = "internal/modules/books/handlers.go";
const SHELVES_ROUTES = "internal/modules/shelves/delivery/routes.go";
const SHELVES_HANDLERS = "internal/modules/shelves/delivery/handlers.go";

const shelfie: Shelfie[] = [
  { method: "GET", path: "/v1/books", operation_id: "books-list-books", summary: "List your books", module: "books", handler: "h.listBooks", source: at(BOOKS_ROUTES, 21), handler_source: at(BOOKS_HANDLERS, 34), guards: ["authenticated", "permission:books.book.read"], middleware: [] },
  { method: "POST", path: "/v1/books", operation_id: "books-create-book", summary: "Add a book", module: "books", handler: "h.createBook", source: at(BOOKS_ROUTES, 22), handler_source: at(BOOKS_HANDLERS, 58), guards: ["authenticated", "permission:books.book.write", "rate_limit:30/1m0s", "idempotent"], middleware: [] },
  { method: "GET", path: "/v1/books/{id}", operation_id: "books-get-book", summary: "Read a book", module: "books", handler: "h.getBook", source: at(BOOKS_ROUTES, 23), handler_source: at(BOOKS_HANDLERS, 81), guards: ["authenticated", "permission:books.book.read"], middleware: [] },
  { method: "PATCH", path: "/v1/books/{id}", operation_id: "books-update-book", summary: "Change a book", module: "books", handler: "h.updateBook", source: at(BOOKS_ROUTES, 24), handler_source: at(BOOKS_HANDLERS, 97), guards: ["authenticated", "permission:books.book.write"], middleware: [] },
  { method: "DELETE", path: "/v1/books/{id}", operation_id: "books-delete-book", summary: "Delete a book", module: "books", handler: "h.deleteBook", source: at(BOOKS_ROUTES, 25), handler_source: at(BOOKS_HANDLERS, 122), guards: ["authenticated", "permission:books.book.write", "recent_reauth"], middleware: [] },
  { method: "GET", path: "/v1/books/{id}/cover", operation_id: "books-get-cover", summary: "The cover image (old clients)", module: "books", handler: "h.getCover", source: at(BOOKS_ROUTES, 26), handler_source: at(BOOKS_HANDLERS, 140), guards: ["authenticated", "permission:books.book.read"], middleware: [], deprecated: true },
  { method: "GET", path: "/v1/catalog/{id}", operation_id: "books-get-catalog-entry", summary: "A book's public catalogue page", module: "books", handler: "h.getCatalogEntry", source: at(BOOKS_ROUTES, 31), handler_source: at("internal/modules/books/catalog.go", 14), guards: ["public", "rate_limit:120/1m0s"], middleware: ['requireClientVersion("2.4.0")'] },
  { method: "GET", path: "/v1/shelves", operation_id: "shelves-list-shelves", summary: "List your shelves", module: "shelves", handler: "h.listShelves", source: at(SHELVES_ROUTES, 17), handler_source: at(SHELVES_HANDLERS, 29), guards: ["authenticated", "permission:shelves.shelf.read"], middleware: ["delivery.AuditTrail"] },
  { method: "POST", path: "/v1/shelves", operation_id: "shelves-create-shelf", summary: "Make a shelf", module: "shelves", handler: "h.createShelf", source: at(SHELVES_ROUTES, 18), handler_source: at(SHELVES_HANDLERS, 47), guards: ["authenticated", "permission:shelves.shelf.write"], middleware: ["delivery.AuditTrail"] },
  { method: "PUT", path: "/v1/shelves/{id}/books/{bookId}", operation_id: "shelves-add-book", summary: "Put a book on a shelf", module: "shelves", handler: "h.addBook", source: at(SHELVES_ROUTES, 21), handler_source: at(SHELVES_HANDLERS, 88), guards: ["authenticated", "permission:shelves.shelf.write", "rate_limit:60/1m0s"], middleware: ["delivery.AuditTrail", "delivery.LoadShelf"] },
];

/** Only in the source: the running app was built before it was added. */
const webhook: Shelfie = { method: "POST", path: "/v1/webhooks/bookshop", operation_id: "billing-bookshop-webhook", summary: "Orders from the bookshop", module: "billing", handler: "h.bookshopWebhook", source: at("internal/modules/billing/routes.go", 12), handler_source: at("internal/modules/billing/webhook.go", 20), guards: ["public", "webhook:bookshop"], middleware: [] };

const toInfo = (s: Shelfie): RouteInfo => ({ ...s, tags: [s.module], public: s.guards.includes("public"), deprecated: s.deprecated ?? false });

export function mockRouteList(): RouteList {
  const list = [...sampleInfo(), ...shelfie.map(toInfo), toInfo(webhook)];
  return {
    app: portalStatus.project.name,
    source: "app",
    guards_known: true,
    total: list.length,
    public: list.filter((r) => r.public).length,
    routes: list,
    warnings: [`${list.filter((r) => !r.source).length} routes come from libraries (health, auth, orgs, ops): no module or source to show`, "internal/modules/shelves/delivery/routes.go:34: a route registered in a loop; orb couldn't read its path"],
  };
}

/** The dev console's list with the books and shelves routes the running app serves (not the webhook: the app predates it). */
export const mockDevRoutes: DevRouteList = {
  routes: [...devRoutes.routes, ...shelfie.map((s) => ({ method: s.method, path: s.path, operation_id: s.operation_id, summary: s.summary, tags: [s.module], secured: !s.guards.includes("public"), source: "openapi" as const }))],
};

let calls = 0;

/** Resets the "first call builds the app" wait; `resetMock` calls it. */
export function resetMockRoutes() {
  calls = 0;
}

/** `GET /_portal/api/routes`; undefined for other paths. */
export async function mockRoutesFetch(path: string, method: string): Promise<Response | undefined> {
  if (path !== "/_portal/api/routes") return undefined;
  if (method !== "GET") return new Response(JSON.stringify({ title: "Method Not Allowed", status: 405, code: "method_not_allowed", detail: "GET only" }), { status: 405, headers: { "Content-Type": "application/problem+json" } });
  if (calls++ === 0 && process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, 1800));
  return new Response(JSON.stringify(mockRouteList()), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
