import { describe, expect, it } from "vitest";
import type { MailSummary } from "@/lib/api/mail";
import { categoryLabel, displayAddress, displayAddresses, formatCode, formatSize, groupPreviews, linkHost, matchesQuery, mergeMessage, previewTitle, subjectOf } from "./format";

const msg = (over: Partial<MailSummary> = {}): MailSummary => ({
  id: "000000000001",
  time: "2026-09-16T10:00:00Z",
  from: { name: "acme", email: "no-reply@acme.dev" },
  to: [{ email: "ada@acme.dev" }],
  subject: "Verify your email",
  snippet: "Your code is 483920",
  size: 1200,
  has_html: true,
  has_text: true,
  codes: ["483920"],
  category: "auth_verification",
  attachments: 0,
  read: false,
  ...over,
});

describe("addresses", () => {
  it("shows the name with the address, or the address alone", () => {
    expect(displayAddress({ name: "Ada", email: "ada@acme.dev" })).toBe("Ada <ada@acme.dev>");
    expect(displayAddress({ email: "ada@acme.dev" })).toBe("ada@acme.dev");
    expect(displayAddress(undefined)).toBe("");
  });
  it("joins several without names and counts the rest", () => {
    expect(displayAddresses([{ name: "Ada", email: "a@x.dev" }])).toBe("Ada <a@x.dev>");
    expect(displayAddresses([{ name: "Ada", email: "a@x.dev" }, { email: "b@x.dev" }])).toBe("a@x.dev, b@x.dev");
    expect(displayAddresses([{ email: "a@x.dev" }, { email: "b@x.dev" }, { email: "c@x.dev" }, { email: "d@x.dev" }])).toBe("a@x.dev, b@x.dev, c@x.dev +1");
    expect(displayAddresses([])).toBe("");
  });
});

describe("formatCode", () => {
  it("groups digits and leaves alphanumeric codes alone", () => {
    expect(formatCode("483920")).toBe("483 920");
    expect(formatCode("12345678")).toBe("1234 5678");
    expect(formatCode("1234567")).toBe("123 4567");
    expect(formatCode("AB12-CD34")).toBe("AB12-CD34");
  });
});

describe("formatSize", () => {
  it("reads like the list column", () => {
    expect(formatSize(812)).toBe("812 B");
    expect(formatSize(1229)).toBe("1.2 KB");
    expect(formatSize(48_000)).toBe("47 KB");
    expect(formatSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatSize(-1)).toBe("—");
  });
});

describe("subjectOf", () => {
  it("fills in an empty subject", () => {
    expect(subjectOf({ subject: "  " })).toBe("(no subject)");
    expect(subjectOf({ subject: "Hi" })).toBe("Hi");
  });
});

describe("matchesQuery", () => {
  it("matches every word against subject, snippet, addresses and codes", () => {
    const m = msg();
    expect(matchesQuery(m, "")).toBe(true);
    expect(matchesQuery(m, "verify")).toBe(true);
    expect(matchesQuery(m, "ADA verify")).toBe(true);
    expect(matchesQuery(m, "483920")).toBe(true);
    expect(matchesQuery(m, "acme reset")).toBe(false);
  });
});

describe("mergeMessage", () => {
  it("puts a new message first, replaces a repeated one and caps the list", () => {
    const a = msg({ id: "1", time: "2026-09-16T10:00:00Z" });
    const b = msg({ id: "2", time: "2026-09-16T10:01:00Z" });
    const c = msg({ id: "3", time: "2026-09-16T10:02:00Z" });
    expect(mergeMessage([b, a], c).map((m) => m.id)).toEqual(["3", "2", "1"]);
    expect(mergeMessage([b, a], { ...b, read: true }).map((m) => m.read)).toEqual([true, false]);
    expect(mergeMessage([b, a], c, 2).map((m) => m.id)).toEqual(["3", "2"]);
  });
});

describe("previews", () => {
  it("groups by category in order with readable labels", () => {
    const groups = groupPreviews([
      { name: "auth.verification_code", description: "", category: "auth_verification" },
      { name: "auth.password_reset_code", description: "", category: "auth_password_reset" },
      { name: "auth.account_exists", description: "", category: "auth_verification" },
      { name: "test", description: "", category: "" },
    ]);
    expect(groups.map((g) => g.category)).toEqual(["auth_verification", "auth_password_reset", "other"]);
    expect(groups[0].previews.map((p) => p.name)).toEqual(["auth.verification_code", "auth.account_exists"]);
    expect(groups[0].label).toBe("Auth · verification");
    expect(categoryLabel("auth_password_reset")).toBe("Auth · password reset");
    expect(categoryLabel("test")).toBe("Test");
    expect(categoryLabel("")).toBe("Other");
  });
  it("titles a preview without its module", () => {
    expect(previewTitle("auth.verification_code")).toBe("verification code");
    expect(previewTitle("test")).toBe("test");
  });
});

describe("linkHost", () => {
  it("tells the bench's links from the outside", () => {
    expect(linkHost("http://127.0.0.1:8080/v1/auth/verify?code=1")).toEqual({ host: "127.0.0.1:8080", local: true });
    expect(linkHost("https://acme.dev/docs")).toEqual({ host: "acme.dev", local: false });
    expect(linkHost("not a url")).toEqual({ host: "not a url", local: false });
  });
});
