import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import { mockStorageProfile, setMockStorageProfile } from "./storage";
import type { SignedURL, StorageObject, StoragePage, StorageStatus } from "../storage";
import type { Problem } from "../types";

const H = { "X-Orb-Portal": "1" };
const get = (path: string) => mockFetch(`/_portal/app${path}`);
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  mockFetch(`/_portal/app${path}`, { method, headers: { ...H, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const upload = (key: string, body: BodyInit, type: string) => mockFetch(`/_portal/app/ops/storage/object?key=${encodeURIComponent(key)}`, { method: "PUT", headers: { ...H, "Content-Type": type }, body });
const page = async (q: string) => (await (await get(`/ops/storage/objects${q}`)).json()) as StoragePage;

beforeEach(() => {
  resetMock();
  setMockStorageProfile("local");
});

describe("mock /ops/storage", () => {
  it("describes the local store, and the spaces bucket when switched", async () => {
    const local = (await (await get("/ops/storage")).json()) as StorageStatus;
    expect(local).toMatchObject({ driver: "local", bucket: "storage", local: true, status: "ok" });
    expect(local.endpoint).toMatch(/\.orb\/storage$/);
    expect(local.ping_ms).toBeGreaterThan(0);
    setMockStorageProfile("spaces");
    expect(mockStorageProfile()).toBe("spaces");
    const spaces = (await (await get("/ops/storage")).json()) as StorageStatus;
    expect(spaces).toMatchObject({ driver: "spaces", bucket: "acme-files", region: "fra1", local: false, status: "ok" });
    expect(spaces.public_url).toMatch(/^https:/);
    setMockStorageProfile("off");
    const off = await get("/ops/storage");
    expect(off.status).toBe(404);
    expect(((await off.json()) as Problem).code).toBe("storage_off");
    expect((await get("/ops/storage/objects")).status).toBe(404);
  });

  it("lists one level with folded prefixes, hides the marker, and pages by cursor", async () => {
    const root = await page("?prefix=");
    expect(root.prefixes).toEqual(["drafts/", "exports/", "images/", "invoices/"]);
    expect(root.objects!.map((o) => o.key)).toEqual(["notes.txt"]);
    expect(root.next_cursor).toBeUndefined();

    const drafts = await page("?prefix=drafts/");
    expect(drafts).toEqual({ prefix: "drafts/", objects: [], prefixes: [] });

    const images = await page("?prefix=images/");
    expect(images.objects!.map((o) => o.key)).toEqual(["images/avatar.svg", "images/hero.svg", "images/logo.svg", "images/pixel.png"]);
    expect(images.objects![2]).toMatchObject({ content_type: "image/svg+xml", metadata: { source: "brand kit", version: "3" } });
    expect(images.objects![2].etag).toMatch(/^[0-9a-f]{32}$/);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const p = await page(`?prefix=&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      seen.push(...(p.prefixes ?? []), ...(p.objects ?? []).map((o) => o.key));
      expect((p.prefixes?.length ?? 0) + (p.objects?.length ?? 0)).toBeLessThanOrEqual(2);
      cursor = p.next_cursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["drafts/", "exports/", "images/", "invoices/", "notes.txt"]);

    const all = await page("?prefix=&recursive=true");
    expect(all.prefixes).toEqual([]);
    expect(all.objects!.length).toBe(10); // the marker stays hidden
    expect((await get("/ops/storage/objects?prefix=/x")).status).toBe(422);
    expect((await get("/ops/storage/objects?limit=0")).status).toBe(422);
  });

  it("stats, downloads, and refuses bad or missing keys", async () => {
    const o = (await (await get("/ops/storage/object?key=exports/report.json")).json()) as StorageObject;
    expect(o).toMatchObject({ key: "exports/report.json", content_type: "application/json" });
    expect(o.size).toBeGreaterThan(100);
    const res = await get("/ops/storage/object/content?key=exports/report.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="report.json"');
    expect(JSON.parse(await res.text())).toMatchObject({ period: "2026-09" });
    const pdf = await get("/ops/storage/object/content?key=invoices/2026/inv_42.pdf");
    expect((await pdf.text()).startsWith("%PDF-1.4")).toBe(true);
    expect(((await (await get("/ops/storage/object?key=nope.txt")).json()) as Problem).code).toBe("storage_object_not_found");
    expect(((await (await get("/ops/storage/object?key=../etc")).json()) as Problem).code).toBe("invalid_storage_key");
    expect((await get("/ops/storage/object/content?key=nope.txt")).status).toBe(404);
  });

  it("uploads a body with its content type, then deletes it", async () => {
    let res = await upload("exports/hello.txt", "hello storage", "text/plain");
    expect(res.status).toBe(201);
    const o = (await res.json()) as StorageObject;
    expect(o).toMatchObject({ key: "exports/hello.txt", size: 13, content_type: "text/plain" });
    expect(o.etag).toMatch(/^[0-9a-f]{32}$/);
    expect(await (await get("/ops/storage/object/content?key=exports/hello.txt")).text()).toBe("hello storage");

    res = await upload("images/blob.png", new Blob([new Uint8Array([137, 80, 78, 71])]), "");
    expect(((await res.json()) as StorageObject).content_type).toBe("image/png"); // by extension when the header says nothing
    expect((await upload("/bad", "x", "text/plain")).status).toBe(422);
    expect((await mockFetch("/_portal/app/ops/storage/object?key=x", { method: "PUT", body: "x" })).status).toBe(403); // no mutation header

    res = await send("DELETE", "/ops/storage/object?key=exports/hello.txt");
    expect(res.status).toBe(204);
    expect((await get("/ops/storage/object?key=exports/hello.txt")).status).toBe(404);
    expect((await send("DELETE", "/ops/storage/object?key=exports/hello.txt")).status).toBe(204); // a missing key is fine
  });

  it("moves and renames", async () => {
    const res = await send("POST", "/ops/storage/object/move", { from: "notes.txt", to: "exports/notes.txt" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as StorageObject).key).toBe("exports/notes.txt");
    expect((await page("?prefix=")).objects).toEqual([]);
    expect((await page("?prefix=exports/")).objects!.map((o) => o.key)).toContain("exports/notes.txt");
    expect((await send("POST", "/ops/storage/object/move", { from: "nope", to: "x" })).status).toBe(404);
    expect((await send("POST", "/ops/storage/object/move", { from: "exports/notes.txt", to: "a//b" })).status).toBe(422);
  });

  it("creates a directory through a hidden marker", async () => {
    const res = await send("POST", "/ops/storage/directories", { prefix: "exports/2027" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ prefix: "exports/2027/" });
    const p = await page("?prefix=exports/");
    expect(p.prefixes).toEqual(["exports/2027/"]);
    expect((await page("?prefix=exports/2027/")).objects).toEqual([]);
    expect(((await (await get("/ops/storage/object?key=exports/2027/.keep")).json()) as StorageObject).size).toBe(0);
    expect((await send("POST", "/ops/storage/directories", { prefix: "/x" })).status).toBe(422);
    expect((await send("POST", "/ops/storage/directories", { prefix: "" })).status).toBe(422);
  });

  it("signs URLs per driver with the expiry clamped to the contract", async () => {
    let res = await send("POST", "/ops/storage/signed-url", { key: "images/logo.svg" });
    expect(res.status).toBe(201);
    const local = (await res.json()) as SignedURL;
    expect(local.method).toBe("GET");
    expect(local.url).toMatch(/^http:\/\/127\.0\.0\.1:8080\/storage\/images\/logo\.svg\?exp=\d+&method=GET&sig=[0-9a-f]+$/);
    expect(Date.parse(local.expires_at) - Date.now()).toBeGreaterThan(3500 * 1000);

    res = await send("POST", "/ops/storage/signed-url", { key: "images/logo.svg", method: "PUT", expiry_seconds: 900 });
    const put = (await res.json()) as SignedURL;
    expect(put.method).toBe("PUT");
    expect(Date.parse(put.expires_at) - Date.now()).toBeLessThanOrEqual(900 * 1000);

    setMockStorageProfile("spaces");
    const spaces = (await (await send("POST", "/ops/storage/signed-url", { key: "invoices/2026/inv_42.pdf", expiry_seconds: 86400 })).json()) as SignedURL;
    expect(spaces.url).toMatch(/^https:\/\/acme-files\.fra1\.digitaloceanspaces\.com\/invoices\/2026\/inv_42\.pdf\?X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    expect(spaces.url).toContain("X-Amz-Expires=86400");

    expect((await send("POST", "/ops/storage/signed-url", { key: "x", method: "POST" })).status).toBe(422);
    expect((await send("POST", "/ops/storage/signed-url", { key: "x", expiry_seconds: 0 })).status).toBe(422);
    expect((await send("POST", "/ops/storage/signed-url", { key: "x", expiry_seconds: 604801 })).status).toBe(422);
  });

  it("resets with the mock", async () => {
    await send("DELETE", "/ops/storage/object?key=notes.txt");
    resetMock();
    expect((await get("/ops/storage/object?key=notes.txt")).status).toBe(200);
  });
});
