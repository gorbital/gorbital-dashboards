/**
 * The mock mail catcher: the inbox behind `/_portal/api/mail*` and the
 * previews behind `/_dev/mail/preview*` in mock mode. It holds a dozen
 * messages the sample app would have sent (codes, links, an attachment,
 * HTML with text, one text-only), answers the store's endpoints with its
 * problem codes, and streams new arrivals as `message` events like
 * cli/internal/portal/mail.go.
 */
import { NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";
import type { MailAttachment, MailDetail, MailLink, MailPreview, MailPreviewMessage, MailSummary } from "../mail";
import type { Problem } from "../types";

export const MOCK_SMTP_ADDR = "127.0.0.1:1025";
const MAX = 500;
const APP = "acme-api";
const SENDER = { name: "acme-api (dev)", email: "no-reply@acme.dev" };
const APP_URL = "http://127.0.0.1:8080";

/* ---------- Building messages the way the parser would ---------- */

const codePattern = /\b(\d{6,8}|[A-Z0-9]{4,6}-[A-Z0-9]{4,6})\b/g;
const linkPattern = /https?:\/\/[^\s"'<>)\]]+/g;

type Draft = {
  id: string;
  at: number;
  to: string;
  toName?: string;
  subject: string;
  text: string;
  /** Rendered from `text` when absent and `textOnly` isn't set. */
  html?: string;
  textOnly?: boolean;
  category?: string;
  attachments?: MailAttachment[];
  read?: boolean;
  cc?: string[];
  replyTo?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(linkPattern, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("\n");
}

function htmlDocument(body: string, subject: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(subject)}</title>
<style>body{margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1e21}.card{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 16px}p{font-size:14px;line-height:1.6;margin:0 0 12px}a{color:#2563eb}.code{display:inline-block;font:600 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;background:#f1f5f9;border-radius:8px;padding:10px 14px;margin:8px 0 16px}.muted{color:#6b7280;font-size:12px}</style></head>
<body><div class="card"><h1>${esc(subject)}</h1>
${body}
<p class="muted">${APP} · sent from the bench, nobody real gets this</p></div></body></html>`;
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

function stripTags(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/(style|script)>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function findLinks(text: string, html: string): MailLink[] {
  const out = new Map<string, MailLink>();
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = m[1];
    const label = stripTags(m[2]).trim();
    if (!out.has(url)) out.set(url, { url, text: label && label !== url ? label : undefined });
  }
  for (const m of text.matchAll(linkPattern)) if (!out.has(m[0])) out.set(m[0], { url: m[0] });
  return [...out.values()];
}

function build(d: Draft): MailDetail {
  const html = d.textOnly ? "" : (d.html ?? htmlDocument(paragraphs(d.text), d.subject));
  const text = d.text.trim() + "\n";
  const codes = unique([...(d.subject + "\n" + text).matchAll(codePattern)].map((m) => m[1])).filter((c) => !/^\d{4}-\d{2}$/.test(c));
  const links = findLinks(text, html);
  const attachments = d.attachments ?? [];
  const bodyBytes = text.length + html.length + attachments.reduce((n, a) => n + Math.round(a.size * 1.37), 0);
  const size = 620 + bodyBytes;
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
  const time = new Date(d.at).toISOString();
  const headers: Record<string, string> = {
    From: `${SENDER.name} <${SENDER.email}>`,
    To: d.toName ? `${d.toName} <${d.to}>` : d.to,
    Subject: d.subject,
    Date: new Date(d.at).toUTCString(),
    "Message-ID": `<${d.id}.${d.at.toString(36)}@acme.dev>`,
    "MIME-Version": "1.0",
    "Content-Type": html ? `multipart/alternative; boundary="b_${d.id}"` : 'text/plain; charset="utf-8"',
    "X-Mailer": "gorbital mail/smtp",
    "X-Mail-Template": d.category ?? "custom",
  };
  if (d.cc?.length) headers.Cc = d.cc.join(", ");
  if (d.replyTo) headers["Reply-To"] = d.replyTo;
  return {
    id: d.id,
    time,
    from: SENDER,
    to: [{ name: d.toName, email: d.to }],
    subject: d.subject,
    snippet,
    size,
    has_html: Boolean(html),
    has_text: true,
    codes,
    category: d.category,
    attachments: attachments.length,
    read: d.read ?? true,
    cc: d.cc?.map((email) => ({ email })),
    reply_to: d.replyTo ? [{ email: d.replyTo }] : undefined,
    headers,
    text,
    html,
    links,
    attachment_list: attachments,
    message_id: headers["Message-ID"],
    envelope: { from: SENDER.email, to: [d.to, ...(d.cc ?? [])] },
    source_bytes: size,
  };
}

/** The source as the catcher received it, reconstructed from the parts. */
function renderSource(d: MailDetail): string {
  const head = Object.entries(d.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  if (!d.html) return `${head}\r\n\r\n${d.text.replace(/\n/g, "\r\n")}`;
  const b = `b_${d.id}`;
  const parts = [`--${b}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${d.text.replace(/\n/g, "\r\n")}`, `--${b}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${d.html.replace(/\n/g, "\r\n")}`];
  for (const a of d.attachment_list) parts.push(`--${b}\r\nContent-Type: ${a.content_type}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(Math.max(1, Math.min(40, Math.ceil(a.size / 26))))}`);
  return `${head}\r\n\r\n${parts.join("\r\n")}\r\n--${b}--\r\n`;
}

/* ---------- The sample inbox ---------- */

const verify = (code: string, to: string, at: number, read = true, id = ""): Draft => ({
  id,
  at,
  to,
  subject: `Verify your email for ${APP}`,
  text: `Your ${APP} verification code is ${code}\n\nIt expires in 15 minutes.\n\nIf you didn't create an account, you can ignore this email.`,
  html: htmlDocument(`<p>Your ${APP} verification code is</p><div class="code">${code}</div><p>It expires in 15 minutes.</p><p>If you didn't create an account, you can ignore this email.</p>`, `Verify your email for ${APP}`),
  category: "auth_verification",
  read,
});

const drafts: Draft[] = [
  { ...verify("483920", "ada@acme.dev", NOW - 2 * MIN, false), toName: "Ada Lovelace" },
  {
    id: "",
    at: NOW - 9 * MIN,
    to: "grace@northwind.dev",
    toName: "Grace Hopper",
    subject: `Reset your ${APP} password`,
    text: `Someone asked to reset the password for grace@northwind.dev.\n\nYour reset code is 715063\n\nOr open ${APP_URL}/v1/auth/password/reset?code=715063&email=grace%40northwind.dev\n\nIt expires in 15 minutes. If you didn't ask, ignore this email; the password stays as it is.`,
    html: htmlDocument(`<p>Someone asked to reset the password for grace@northwind.dev.</p><div class="code">715063</div><p><a href="${APP_URL}/v1/auth/password/reset?code=715063&amp;email=grace%40northwind.dev">Reset the password</a></p><p>It expires in 15 minutes. If you didn't ask, ignore this email; the password stays as it is.</p>`, `Reset your ${APP} password`),
    category: "auth_password_reset",
    read: false,
  },
  {
    id: "",
    at: NOW - 22 * MIN,
    to: "you@localhost",
    subject: `You're invited to acme on ${APP}`,
    text: `Ada Lovelace invited you to the acme organisation.\n\nAccept the invitation: ${APP_URL}/v1/orgs/acme/invites/accept?token=example-invite-token\n\nThe link works for 7 days.`,
    category: "org_invite",
    read: false,
  },
  {
    id: "",
    at: NOW - 48 * MIN,
    to: "linus@acme.dev",
    subject: `New sign-in to your ${APP} account`,
    text: `A new sign-in to your account just happened.\n\nWhen: ${new Date(NOW - 48 * MIN).toUTCString()}\nWhere: 127.0.0.1 (this machine)\nBrowser: Chrome 140 on macOS\n\nIf this was you, there's nothing to do. If not, change your password: ${APP_URL}/v1/auth/password/forgot`,
    category: "auth_sign_in_notice",
  },
  {
    id: "",
    at: NOW - 1 * HOUR - 12 * MIN,
    to: "you@localhost",
    subject: `Your two-factor recovery codes for ${APP}`,
    text: `Two-factor authentication is on. Keep these recovery codes somewhere safe; each works once.\n\nAB7Q-K2M9\nXF3P-77TD\nQ9LC-2ZR4\nM4N8-HB6E\n\nThe codes are also attached as a text file.`,
    category: "auth_mfa_enabled",
    attachments: [{ name: "acme-api-recovery-codes.txt", content_type: "text/plain", size: 118 }],
  },
  { ...verify("902117", "linus@acme.dev", NOW - 2 * HOUR, true) },
  {
    id: "",
    at: NOW - 3 * HOUR - 5 * MIN,
    to: "ops@acme.dev",
    subject: `Test email from ${APP}`,
    text: `If you can read this, email delivery works.\n\nProvider: smtp\nDelivery: devmail\nSent by: dev console (orb dev)`,
    category: "test",
    textOnly: true,
  },
  {
    id: "",
    at: NOW - 5 * HOUR,
    to: "grace@northwind.dev",
    toName: "Grace Hopper",
    subject: `Your ${APP} password was changed`,
    text: `The password for grace@northwind.dev was just changed.\n\nIf you did this, there's nothing to do. If not, reset it now: ${APP_URL}/v1/auth/password/forgot and contact support@acme.dev.`,
    category: "auth_password_changed",
    replyTo: "support@acme.dev",
  },
  {
    id: "",
    at: NOW - 7 * HOUR - 30 * MIN,
    to: "billing@northwind.dev",
    cc: ["grace@northwind.dev"],
    subject: "Invoice INV-2026-0912 for September",
    text: `Hello Northwind,\n\nYour invoice INV-2026-0912 for September is attached: 3 seats × $12 = $36.00, due 30 September 2026.\n\nPay it at ${APP_URL}/v1/billing/invoices/INV-2026-0912/pay or reply to this email with questions.`,
    html: htmlDocument(`<p>Hello Northwind,</p><p>Your invoice <strong>INV-2026-0912</strong> for September is attached.</p><table style="border-collapse:collapse;width:100%;font-size:14px"><tr><td style="padding:6px 0">3 seats × $12</td><td style="text-align:right">$36.00</td></tr><tr><td style="padding:6px 0;border-top:1px solid #e5e7eb"><strong>Due 30 September 2026</strong></td><td style="text-align:right;border-top:1px solid #e5e7eb"><strong>$36.00</strong></td></tr></table><p style="margin-top:16px"><a href="${APP_URL}/v1/billing/invoices/INV-2026-0912/pay">Pay the invoice</a></p><p>Reply to this email with questions.</p>`, "Invoice INV-2026-0912 for September"),
    category: "billing_invoice",
    attachments: [
      { name: "INV-2026-0912.pdf", content_type: "application/pdf", size: 48_211 },
      { name: "line-items.csv", content_type: "text/csv", size: 402 },
    ],
  },
  {
    id: "",
    at: NOW - 1 * DAY - 2 * HOUR,
    to: "ada@acme.dev",
    toName: "Ada Lovelace",
    subject: "Google is now linked to your account",
    text: `You can now sign in to ${APP} with Google (ada@acme.dev).\n\nManage sign-in methods: ${APP_URL}/v1/auth/identities\n\nIf you didn't do this, remove it there and change your password.`,
    category: "auth_sign_in_method_added",
  },
  {
    id: "",
    at: NOW - 1 * DAY - 6 * HOUR,
    to: "ada@acme.dev",
    toName: "Ada Lovelace",
    subject: `A passkey was added to your ${APP} account`,
    text: `A passkey named "MacBook Pro" was added to your account.\n\nIf you didn't add it, remove it at ${APP_URL}/v1/auth/passkeys and change your password.`,
    category: "auth_passkey_added",
  },
  {
    id: "",
    at: NOW - 2 * DAY,
    to: "new@example.com",
    subject: `Verify your email for ${APP}`,
    text: `Your ${APP} verification code is 118204\n\nIt expires in 15 minutes.\n\nIf you didn't create an account, you can ignore this email.`,
    category: "auth_verification",
  },
];

let seq = 0;
const nextId = () => String(++seq).padStart(12, "0");

/** Newest last, like the store; the list endpoint reverses it. */
let store: MailDetail[] = [];
const subscribers = new Set<(m: MailSummary) => void>();

function summaryOf(d: MailDetail): MailSummary {
  const { reply_to: _r, cc: _c, headers: _h, text: _t, html: _m, links: _l, attachment_list: _a, message_id: _i, envelope: _e, source_bytes: _s, ...summary } = d;
  void _r;
  void _c;
  void _h;
  void _t;
  void _m;
  void _l;
  void _a;
  void _i;
  void _e;
  void _s;
  return summary;
}

/** Puts the inbox back to its dozen messages; tests call it between cases. */
export function resetMockMail() {
  seq = 0;
  store = [...drafts].sort((a, b) => a.at - b.at).map((d) => build({ ...d, id: nextId() }));
}
resetMockMail();

/** Delivers a message to the mock inbox (the test email, a sent preview) and tells the stream. */
export function deliverMockMail(draft: Omit<Draft, "id">): MailSummary {
  const d = build({ ...draft, id: nextId(), read: false });
  store = [...store, d].slice(-MAX);
  const s = summaryOf(d);
  for (const fn of subscribers) fn(s);
  return s;
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 404: "Not Found", 429: "Too Many Requests" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function matches(m: MailDetail, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [m.subject, m.snippet, m.from.email, m.from.name ?? "", ...m.to.flatMap((a) => [a.email, a.name ?? ""]), ...m.codes, m.category ?? ""].join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function stream(signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let listener: ((m: MailSummary) => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) return controller.close();
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      listener = (m) => {
        try {
          controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(m)}\n\n`));
        } catch {
          // Closed underneath us.
        }
      };
      subscribers.add(listener);
      signal?.addEventListener(
        "abort",
        () => {
          if (listener) subscribers.delete(listener);
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        },
        { once: true },
      );
    },
    cancel() {
      if (listener) subscribers.delete(listener);
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}

/** Answers `/_portal/api/mail`, `mail/stream`, `mail/{id}`, `mail/{id}/html`, `mail/{id}/source`, the two DELETEs. */
export function mockMailFetch(url: URL, method: string, init: RequestInit = {}): Response {
  const p = url.pathname;
  if (p === "/_portal/api/mail/stream") return stream(init.signal ?? undefined);
  if (p === "/_portal/api/mail") {
    if (method === "DELETE") {
      store = [];
      return new Response(null, { status: 204 });
    }
    const q = url.searchParams.get("q") ?? "";
    let limit = Number(url.searchParams.get("limit") ?? 0);
    if (!Number.isInteger(limit) || limit <= 0) limit = 100;
    const all = [...store].reverse().filter((m) => matches(m, q));
    return json({ messages: all.slice(0, limit).map(summaryOf), total: all.length, count: store.length, smtp_addr: MOCK_SMTP_ADDR, max: MAX });
  }
  const m = /^\/_portal\/api\/mail\/([^/]+)(\/html|\/source)?$/.exec(p);
  if (!m) return problem(404, "not_found", `no portal endpoint ${method} ${p}`);
  const id = decodeURIComponent(m[1]);
  const d = store.find((x) => x.id === id);
  if (!d) return problem(404, "message_not_found", "no message has this ID");
  if (m[2] === "/html") {
    const body = d.html || `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap">${esc(d.text)}</pre>`;
    return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "sandbox; default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; font-src data: https:", "Cache-Control": "no-store" } });
  }
  if (m[2] === "/source") return new Response(renderSource(d), { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (method === "DELETE") {
    store = store.filter((x) => x.id !== id);
    return new Response(null, { status: 204 });
  }
  if (!d.read) {
    d.read = true;
  }
  return json(d);
}

/* ---------- Previews (the dev console's) ---------- */

const previews: MailPreview[] = [
  { name: "auth.verification_code", description: "After registering, or when an address changes: the code that verifies it", category: "auth_verification" },
  { name: "auth.password_reset_code", description: "After POST /v1/auth/password/forgot: the code that resets the password", category: "auth_password_reset" },
  { name: "auth.account_exists", description: "When someone registers with an address that already has an account", category: "auth_account_exists" },
  { name: "auth.password_changed", description: "After a password change or reset", category: "auth_password_changed" },
  { name: "auth.two_factor_enabled", description: "When two-factor authentication is turned on", category: "auth_mfa_enabled" },
  { name: "auth.two_factor_disabled", description: "When two-factor authentication is turned off", category: "auth_mfa_disabled" },
  { name: "auth.sign_in_method_added", description: "When a provider such as Google is linked", category: "auth_sign_in_method_added" },
  { name: "auth.passkey_added", description: "When a passkey is added", category: "auth_passkey_added" },
  { name: "orgs.invite", description: "When someone is invited to an organisation", category: "org_invite" },
  { name: "billing.invoice", description: "On the first of the month, with the PDF attached", category: "billing_invoice" },
  { name: "test", description: "A plain message, to check delivery", category: "test" },
];

function renderPreview(name: string, to: string): Draft | undefined {
  const at = Date.now();
  switch (name) {
    case "auth.verification_code":
      return verify("483920", to, at);
    case "auth.password_reset_code":
      return { id: "", at, to, subject: `Reset your ${APP} password`, text: `Someone asked to reset the password for ${to}.\n\nYour reset code is 715063\n\nOr open ${APP_URL}/v1/auth/password/reset?code=715063&email=${encodeURIComponent(to)}\n\nIt expires in 15 minutes. If you didn't ask, ignore this email; the password stays as it is.`, category: "auth_password_reset" };
    case "auth.account_exists":
      return { id: "", at, to, subject: `You already have a ${APP} account`, text: `Someone tried to register ${to}, which already has an account.\n\nIf that was you, sign in instead, or reset your password: ${APP_URL}/v1/auth/password/forgot\n\nIf it wasn't, you can ignore this email.`, category: "auth_account_exists" };
    case "auth.password_changed":
      return { id: "", at, to, subject: `Your ${APP} password was changed`, text: `The password for ${to} was just changed.\n\nIf you did this, there's nothing to do. If not, reset it now: ${APP_URL}/v1/auth/password/forgot`, category: "auth_password_changed" };
    case "auth.two_factor_enabled":
      return { id: "", at, to, subject: `Two-factor authentication is on for ${APP}`, text: `Two-factor authentication was turned on for ${to}.\n\nKeep your recovery codes somewhere safe; each works once.\n\nIf you didn't do this, contact support.`, category: "auth_mfa_enabled" };
    case "auth.two_factor_disabled":
      return { id: "", at, to, subject: `Two-factor authentication is off for ${APP}`, text: `Two-factor authentication was turned off for ${to}.\n\nIf you didn't do this, turn it on again and change your password.`, category: "auth_mfa_disabled" };
    case "auth.sign_in_method_added":
      return { id: "", at, to, subject: "Google is now linked to your account", text: `You can now sign in to ${APP} with Google (${to}).\n\nManage sign-in methods: ${APP_URL}/v1/auth/identities`, category: "auth_sign_in_method_added" };
    case "auth.passkey_added":
      return { id: "", at, to, subject: `A passkey was added to your ${APP} account`, text: `A passkey named "Sample device" was added to your account.\n\nIf you didn't add it, remove it at ${APP_URL}/v1/auth/passkeys and change your password.`, category: "auth_passkey_added" };
    case "orgs.invite":
      return { id: "", at, to, subject: `You're invited to acme on ${APP}`, text: `Ada Lovelace invited you to the acme organisation.\n\nAccept the invitation: ${APP_URL}/v1/orgs/acme/invites/accept?token=inv_sample\n\nThe link works for 7 days.`, category: "org_invite" };
    case "billing.invoice":
      return { id: "", at, to, subject: "Invoice INV-2026-0001 for this month", text: `Hello,\n\nYour invoice INV-2026-0001 is attached: 1 seat × $12 = $12.00.\n\nPay it at ${APP_URL}/v1/billing/invoices/INV-2026-0001/pay`, category: "billing_invoice", attachments: [{ name: "INV-2026-0001.pdf", content_type: "application/pdf", size: 41_800 }] };
    case "test":
      return { id: "", at, to, subject: `Test email from ${APP}`, text: `If you can read this, email delivery works.\n\nProvider: smtp\nDelivery: devmail\nSent by: dev console (orb dev)`, category: "test", textOnly: true };
    default:
      return undefined;
  }
}

/** Answers `/_dev/mail/previews`, `/_dev/mail/preview?name=&to=` and `POST /_dev/mail/preview/send?name=&to=`; undefined for other paths. */
export function mockMailPreviewFetch(path: string, query: URLSearchParams, method: string): Response | undefined {
  if (path === "/_dev/mail/previews") return method === "GET" ? json({ previews }) : problem(405, "method_not_allowed", "GET only");
  if (path !== "/_dev/mail/preview" && path !== "/_dev/mail/preview/send") return undefined;
  const send = path.endsWith("/send");
  if (send && method !== "POST") return problem(405, "method_not_allowed", "POST only");
  if (!send && method !== "GET") return problem(405, "method_not_allowed", "GET only");
  const name = query.get("name") ?? "";
  const to = (query.get("to") ?? "").trim() || "preview@example.com";
  if (!/^[^\s@]+@[^\s@]+$/.test(to)) return problem(400, "invalid_address", "to isn't an email address");
  const meta = previews.find((p) => p.name === name);
  const draft = renderPreview(name, to);
  if (!meta || !draft) return problem(404, "preview_not_found", `no preview ${name}; see /_dev/mail/previews`);
  const built = build({ ...draft, id: "preview" });
  if (send) {
    deliverMockMail(draft);
    return json({ name, to, sent: true });
  }
  const out: MailPreviewMessage = { ...meta, subject: built.subject, text: built.text, html: built.html, to };
  return json(out);
}
