import { beforeEach, describe, expect, it } from "vitest";
import type { MailDetail, MailList, MailPreviewList, MailPreviewMessage, MailPreviewSent } from "../mail";
import type { Problem } from "../types";
import { deliverMockMail, mockMailFetch, mockMailPreviewFetch, resetMockMail } from "./mail";

const get = async <T>(path: string): Promise<T> => {
  const res = mockMailFetch(new URL(path, "http://127.0.0.1:3100"), "GET");
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

beforeEach(() => resetMockMail());

describe("the mock inbox", () => {
  it("holds a dozen realistic messages, newest first, with the list's shape", async () => {
    const list = await get<MailList>("/_portal/api/mail");
    expect(Object.keys(list).sort()).toEqual(["count", "max", "messages", "smtp_addr", "total"]);
    expect(list.messages).toHaveLength(12);
    expect(list.total).toBe(12);
    expect(list.count).toBe(12);
    expect(list.max).toBe(500);
    expect(list.smtp_addr).toBe("127.0.0.1:1025");
    const times = list.messages.map((m) => Date.parse(m.time));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(list.messages.every((m) => /^\d{12}$/.test(m.id))).toBe(true);
    expect(list.messages.filter((m) => !m.read).length).toBeGreaterThanOrEqual(3);
    expect(list.messages.some((m) => m.codes.length > 0)).toBe(true);
    expect(list.messages.some((m) => m.attachments > 0)).toBe(true);
    expect(list.messages.some((m) => !m.has_html && m.has_text)).toBe(true);
    for (const m of list.messages) expect(m).not.toHaveProperty("text");
  });

  it("searches and limits like the store", async () => {
    const reset = await get<MailList>("/_portal/api/mail?q=reset");
    expect(reset.total).toBeGreaterThanOrEqual(1);
    expect(reset.messages.every((m) => `${m.subject} ${m.snippet}`.toLowerCase().includes("reset"))).toBe(true);
    expect(reset.count).toBe(12);
    const byCode = await get<MailList>("/_portal/api/mail?q=483920");
    expect(byCode.messages.map((m) => m.codes)).toEqual([["483920"]]);
    const two = await get<MailList>("/_portal/api/mail?limit=2");
    expect(two.messages).toHaveLength(2);
    expect(two.total).toBe(12);
  });

  it("answers a detail with bodies, links, codes, headers and the envelope, and marks it read", async () => {
    const list = await get<MailList>("/_portal/api/mail?q=password");
    const unread = list.messages.find((m) => !m.read)!;
    const d = await get<MailDetail>(`/_portal/api/mail/${unread.id}`);
    expect(d.id).toBe(unread.id);
    expect(d.text.length).toBeGreaterThan(20);
    expect(d.html).toContain("<html");
    expect(d.codes).toEqual(["715063"]);
    expect(d.links.map((l) => l.url)).toContain("http://127.0.0.1:8080/v1/auth/password/reset?code=715063&email=grace%40northwind.dev");
    expect(d.links.some((l) => l.text === "Reset the password")).toBe(true);
    expect(d.headers.Subject).toBe(d.subject);
    expect(d.envelope).toEqual({ from: "no-reply@acme.dev", to: ["grace@northwind.dev"] });
    expect(d.attachment_list).toEqual([]);
    expect(d.source_bytes).toBe(d.size);
    const again = await get<MailList>("/_portal/api/mail?q=password");
    expect(again.messages.find((m) => m.id === unread.id)?.read).toBe(true);
  });

  it("lists attachments and CC on the invoice", async () => {
    const list = await get<MailList>("/_portal/api/mail?q=invoice");
    const d = await get<MailDetail>(`/_portal/api/mail/${list.messages[0].id}`);
    expect(d.attachments).toBe(2);
    expect(d.attachment_list.map((a) => a.name)).toEqual(["INV-2026-0912.pdf", "line-items.csv"]);
    expect(d.cc?.map((a) => a.email)).toEqual(["grace@northwind.dev"]);
    expect(d.envelope.to).toContain("grace@northwind.dev");
  });

  it("serves the HTML sandboxed and the source as text, wrapping a text-only message in a pre", async () => {
    const list = await get<MailList>("/_portal/api/mail");
    const textOnly = list.messages.find((m) => !m.has_html)!;
    const html = mockMailFetch(new URL(`/_portal/api/mail/${textOnly.id}/html`, "http://x"), "GET");
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(html.headers.get("content-security-policy")).toContain("sandbox");
    expect(await html.text()).toMatch(/^<pre/);
    const source = mockMailFetch(new URL(`/_portal/api/mail/${list.messages[0].id}/source`, "http://x"), "GET");
    expect(source.headers.get("content-type")).toContain("text/plain");
    const raw = await source.text();
    expect(raw).toMatch(/^From: /);
    expect(raw).toContain("multipart/alternative");
  });

  it("refuses an unknown message with message_not_found", async () => {
    const res = mockMailFetch(new URL("/_portal/api/mail/nope", "http://x"), "GET");
    expect(res.status).toBe(404);
    expect(((await res.json()) as Problem).code).toBe("message_not_found");
  });

  it("deletes one message and clears the inbox", async () => {
    const list = await get<MailList>("/_portal/api/mail");
    const id = list.messages[0].id;
    expect(mockMailFetch(new URL(`/_portal/api/mail/${id}`, "http://x"), "DELETE").status).toBe(204);
    const after = await get<MailList>("/_portal/api/mail");
    expect(after.count).toBe(11);
    expect(after.messages.some((m) => m.id === id)).toBe(false);
    expect(mockMailFetch(new URL("/_portal/api/mail", "http://x"), "DELETE").status).toBe(204);
    expect((await get<MailList>("/_portal/api/mail")).count).toBe(0);
  });

  it("streams a delivered message as a message event", async () => {
    const controller = new AbortController();
    const res = mockMailFetch(new URL("/_portal/api/mail/stream", "http://x"), "GET", { signal: controller.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    expect(text).toContain("retry: 3000");
    const delivered = deliverMockMail({ at: Date.now(), to: "x@example.com", subject: "Hello 555123", text: "Your code is 555123" });
    text = decoder.decode((await reader.read()).value);
    expect(text).toMatch(/^event: message\ndata: /);
    expect(JSON.parse(text.slice(text.indexOf("data: ") + 6)).id).toBe(delivered.id);
    expect(delivered.codes).toEqual(["555123"]);
    expect(delivered.read).toBe(false);
    controller.abort();
    const list = await get<MailList>("/_portal/api/mail");
    expect(list.messages[0].id).toBe(delivered.id);
  });
});

describe("the mock previews", () => {
  const q = (s = "") => new URLSearchParams(s);

  it("lists the previews with their category", async () => {
    const res = mockMailPreviewFetch("/_dev/mail/previews", q(), "GET")!;
    const list = (await res.json()) as MailPreviewList;
    expect(list.previews.length).toBeGreaterThanOrEqual(10);
    expect(list.previews.every((p) => p.name && p.description && p.category)).toBe(true);
    expect(list.previews.find((p) => p.name === "test")?.category).toBe("test");
  });

  it("renders one for the given recipient, and refuses unknown names and bad addresses", async () => {
    const res = mockMailPreviewFetch("/_dev/mail/preview", q("name=auth.verification_code&to=ada%40acme.dev"), "GET")!;
    expect(res.status).toBe(200);
    const p = (await res.json()) as MailPreviewMessage;
    expect(p.to).toBe("ada@acme.dev");
    expect(p.subject).toContain("Verify");
    expect(p.text).toContain("483920");
    expect(p.html).toContain("483920");
    const def = (await mockMailPreviewFetch("/_dev/mail/preview", q("name=test"), "GET")!.json()) as MailPreviewMessage;
    expect(def.to).toBe("preview@example.com");
    expect(def.html).toBe("");
    const missing = mockMailPreviewFetch("/_dev/mail/preview", q("name=nope"), "GET")!;
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as Problem).code).toBe("preview_not_found");
    const bad = mockMailPreviewFetch("/_dev/mail/preview", q("name=test&to=nope"), "GET")!;
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Problem).code).toBe("invalid_address");
    expect(mockMailPreviewFetch("/_dev/routes", q(), "GET")).toBeUndefined();
  });

  it("sends one to the inbox on POST only", async () => {
    expect(mockMailPreviewFetch("/_dev/mail/preview/send", q("name=test"), "GET")!.status).toBe(405);
    const res = mockMailPreviewFetch("/_dev/mail/preview/send", q("name=orgs.invite&to=you%40localhost"), "POST")!;
    expect(res.status).toBe(200);
    expect((await res.json()) as MailPreviewSent).toEqual({ name: "orgs.invite", to: "you@localhost", sent: true });
    const list = await get<MailList>("/_portal/api/mail");
    expect(list.count).toBe(13);
    expect(list.messages[0]).toMatchObject({ to: [{ email: "you@localhost" }], read: false, category: "org_invite" });
  });
});
