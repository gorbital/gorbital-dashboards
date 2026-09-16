import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTATION_HEADER } from "./client";
import { buildQuery, buildRequest, fillPath, pathParams, prettyBody, proxyAddsAuth, sendRequest, type RequestSpec } from "./request-builder";

const spec = (over: Partial<RequestSpec> = {}): RequestSpec => ({ method: "GET", path: "/v1/orgs/{org}/projects/{id}", pathParams: { org: "acme", id: "prj 1" }, query: [], headers: [], body: "", auth: "operator", ...over });

describe("paths", () => {
  it("lists placeholders once, in order", () => {
    expect(pathParams("/v1/orgs/{org}/projects/{id}/members/{org}")).toEqual(["org", "id"]);
    expect(pathParams("/healthz")).toEqual([]);
  });

  it("fills what it has, encodes it, and leaves the rest visible", () => {
    expect(fillPath("/v1/orgs/{org}/projects/{id}", { org: "acme", id: "prj 1" })).toBe("/v1/orgs/acme/projects/prj%201");
    expect(fillPath("/v1/orgs/{org}/projects/{id}", { org: "acme" })).toBe("/v1/orgs/acme/projects/{id}");
    expect(fillPath("/v1/orgs/{org}", { org: "" })).toBe("/v1/orgs/{org}");
  });

  it("appends only the query rows with a key, encoded, after an existing query", () => {
    expect(buildQuery("/v1/x", [])).toBe("/v1/x");
    expect(buildQuery("/v1/x", [{ key: "limit", value: "20" }, { key: "", value: "ignored" }, { key: "q", value: "a b&c" }])).toBe("/v1/x?limit=20&q=a%20b%26c");
    expect(buildQuery("/v1/x?a=1", [{ key: "b", value: "2" }])).toBe("/v1/x?a=1&b=2");
  });

  it("knows where the proxy adds the operator", () => {
    expect(proxyAddsAuth("/ops/settings")).toBe(true);
    expect(proxyAddsAuth("/_dev/app")).toBe(true);
    expect(proxyAddsAuth("/v1/me")).toBe(false);
  });
});

describe("buildRequest", () => {
  it("builds a GET through the proxy with no mutation header and no body", () => {
    const { url, init } = buildRequest(spec({ query: [{ key: "limit", value: "5" }] }));
    expect(url).toBe("/_portal/app/v1/orgs/acme/projects/prj%201?limit=5");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Headers).get(MUTATION_HEADER)).toBeNull();
    expect((init.headers as Headers).get("Authorization")).toBeNull();
    expect(init.body).toBeUndefined();
  });

  it("adds the mutation header, the JSON body and its content type to a POST", () => {
    const { init } = buildRequest(spec({ method: "post", path: "/v1/orgs", pathParams: {}, body: '{"name":"x"}' }));
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get(MUTATION_HEADER)).toBe("1");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe('{"name":"x"}');
  });

  it("keeps the caller's content type and skips an empty body", () => {
    const { init } = buildRequest(spec({ method: "PUT", headers: [{ key: "Content-Type", value: "text/plain" }], body: "hello" }));
    expect((init.headers as Headers).get("Content-Type")).toBe("text/plain");
    expect(buildRequest(spec({ method: "DELETE", body: "   " })).init.body).toBeUndefined();
  });

  it("sends a pasted bearer token and nothing for the other modes", () => {
    expect((buildRequest(spec({ auth: "bearer", token: " tok " })).init.headers as Headers).get("Authorization")).toBe("Bearer tok");
    expect((buildRequest(spec({ auth: "bearer" })).init.headers as Headers).get("Authorization")).toBeNull();
    expect((buildRequest(spec({ auth: "none" })).init.headers as Headers).get("Authorization")).toBeNull();
  });
});

describe("prettyBody", () => {
  it("pretty-prints JSON and leaves text alone", () => {
    expect(prettyBody('{"a":1}', "application/json")).toEqual({ body: '{\n  "a": 1\n}', json: true });
    expect(prettyBody('[1,2]', "text/plain")).toEqual({ body: "[\n  1,\n  2\n]", json: true });
    expect(prettyBody("ok", "text/plain")).toEqual({ body: "ok", json: false });
    expect(prettyBody("{not json", "application/json")).toEqual({ body: "{not json", json: false });
  });
});

describe("sendRequest", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("measures the answer and picks the headers worth showing", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 201, statusText: "Created", headers: { "Content-Type": "application/json", "X-Request-ID": "req_1", "X-Secret": "no" } }));
    const res = await sendRequest(spec({ method: "POST", path: "/v1/orgs", pathParams: {}, body: "{}" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/_portal/app/v1/orgs");
    expect(res.status).toBe(201);
    expect(res.json).toBe(true);
    expect(res.body).toBe('{\n  "ok": true\n}');
    expect(res.requestId).toBe("req_1");
    expect(res.headers.map((h) => h.key.toLowerCase())).toEqual(["content-type", "x-request-id"]);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(res.bytes).toBe(11);
  });
});
