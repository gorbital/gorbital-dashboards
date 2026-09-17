"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { matchesQuery, mergeMessage } from "@/lib/mail/format";
import { ApiError, NotConnectedError, apiFetch, portalInit, subscribeSSE, transportFetch, type EventsStatus } from "./client";
import { errorMessage } from "./errors";
import { keys, queryString, retry } from "./queries";

/*
 * The development inbox (ADR-0074): orb dev's SMTP catcher keeps every
 * message the app sends under .orb/portal/mail and serves it at
 * /_portal/api/mail. The shapes match cli/internal/devmail/store.go field
 * for field; the previews match modules/devconsole/openapi.json.
 */

export type MailAddress = { name?: string; email: string };

/** One message as the list shows it (`devmail.Summary`). */
export type MailSummary = {
  id: string;
  time: string;
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  snippet: string;
  size: number;
  has_html: boolean;
  has_text: boolean;
  /** Verification codes found in the subject and text. */
  codes: string[];
  category?: string;
  /** How many; the detail lists them. */
  attachments: number;
  read: boolean;
};

export type MailLink = { url: string; text?: string };

export type MailAttachment = { name: string; content_type: string; size: number };

/** What SMTP said, as opposed to the headers. */
export type MailEnvelope = { from: string; to: string[] };

/** A message with its bodies (`devmail.Detail`). */
export type MailDetail = MailSummary & {
  reply_to?: MailAddress[];
  cc?: MailAddress[];
  headers: Record<string, string>;
  text: string;
  html: string;
  links: MailLink[];
  attachment_list: MailAttachment[];
  message_id?: string;
  envelope: MailEnvelope;
  source_bytes: number;
};

export type MailList = {
  /** Newest first, at most `limit` (100 by default). */
  messages: MailSummary[];
  /** How many match the search. */
  total: number;
  /** How many the store holds. */
  count: number;
  /** Where the catcher listens, such as 127.0.0.1:1025. */
  smtp_addr: string;
  /** How many the store keeps. */
  max: number;
};

/** An email the app can render with sample data (`/_dev/mail/previews`). */
export type MailPreview = { name: string; description: string; category: string };
export type MailPreviewList = { previews: MailPreview[] };

/** One preview rendered for `to` (`/_dev/mail/preview`). */
export type MailPreviewMessage = MailPreview & { subject: string; text: string; html: string; to: string };
export type MailPreviewSent = { name: string; to: string; sent: boolean };

export const DEFAULT_PREVIEW_TO = "preview@example.com";

export const mailKeys = {
  all: ["portal", "mail"] as const,
  list: (q: string) => ["portal", "mail", "list", q] as const,
  message: (id: string) => ["portal", "mail", "message", id] as const,
  source: (id: string) => ["portal", "mail", "source", id] as const,
  previews: ["dev", "mail", "previews"] as const,
  preview: (name: string, to: string) => ["dev", "mail", "preview", name, to] as const,
};

/** True when this orb dev runs no catcher (404 `no_mail_catcher`): the app sends to Mailpit or a provider. */
export function isNoMailCatcher(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "no_mail_catcher";
}

/** `GET /_portal/api/mail?q=&limit=`: the inbox, newest first. Polls every 15 s as the fallback behind the stream. */
export function useInbox(q: string, enabled = true, limit = 100) {
  return useQuery({
    queryKey: mailKeys.list(q),
    queryFn: () => apiFetch<MailList>(`/_portal/api/mail${queryString({ q, limit })}`),
    enabled,
    refetchInterval: (query) => (query.state.error ? false : 15_000),
    retry,
  });
}

/** `GET mail/{id}`: bodies, links, codes, headers, envelope. Reading marks the message read. */
export function useMailMessage(id: string | null) {
  return useQuery({
    queryKey: mailKeys.message(id ?? ""),
    queryFn: () => apiFetch<MailDetail>(`/_portal/api/mail/${encodeURIComponent(id ?? "")}`),
    enabled: Boolean(id),
    staleTime: 60_000,
    retry,
  });
}

/** `GET mail/{id}/source`: the message as received, as text. */
export function useMailSource(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.source(id ?? ""),
    queryFn: async () => {
      let res: Response;
      try {
        res = await transportFetch(`/_portal/api/mail/${encodeURIComponent(id ?? "")}/source`, portalInit({ headers: { Accept: "text/plain" }, cache: "no-store" }));
      } catch (err) {
        throw new NotConnectedError(err);
      }
      if (!res.ok) throw new ApiError({ status: res.status, code: res.status === 404 ? "message_not_found" : "mail_store_error", detail: (await res.text()).slice(0, 300) });
      return res.text();
    },
    enabled: enabled && Boolean(id),
    staleTime: 60_000,
    retry,
  });
}

/** The HTML view's URL: `mail/{id}/html`, which the portal answers with a CSP that allows images and inline styles only. */
export function mailHtmlUrl(id: string): string {
  return `/_portal/api/mail/${encodeURIComponent(id)}/html`;
}

/** The policy the portal sends with the HTML view, repeated as a `<meta>` so a `srcdoc` frame keeps it. */
export const MAIL_HTML_CSP = "default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; font-src data: https:";

/**
 * `GET mail/{id}/html`: the HTML body (or the text in a `<pre>`), fetched
 * as text for a sandboxed `srcdoc` iframe. Fetching rather than pointing
 * the frame at the URL keeps one code path in live and mock mode, and
 * survives browsers that refuse frame navigations to API paths.
 */
export function useMailHtml(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...mailKeys.message(id ?? ""), "html"] as const,
    queryFn: async () => {
      let res: Response;
      try {
        res = await transportFetch(mailHtmlUrl(id ?? ""), portalInit({ headers: { Accept: "text/html" }, cache: "no-store" }));
      } catch (err) {
        throw new NotConnectedError(err);
      }
      if (!res.ok) throw new ApiError({ status: res.status, code: res.status === 404 ? "message_not_found" : "mail_store_error", detail: (await res.text()).slice(0, 300) });
      return res.text();
    },
    enabled: enabled && Boolean(id),
    staleTime: 60_000,
    retry,
  });
}

function invalidateInbox(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: mailKeys.all });
  void qc.invalidateQueries({ queryKey: keys.devMail });
}

/** `DELETE mail/{id}`. */
export function useDeleteMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/_portal/api/mail/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.setQueriesData<MailList>({ queryKey: [...mailKeys.all, "list"] }, (old) => (old ? { ...old, messages: old.messages.filter((m) => m.id !== id), total: Math.max(0, old.total - 1), count: Math.max(0, old.count - 1) } : old));
      toast.success("Message deleted");
    },
    onError: (err) => toast.error("Couldn't delete the message", { description: errorMessage(err) }),
    onSettled: () => invalidateInbox(qc),
  });
}

/** `DELETE mail`: empties the inbox. */
export function useClearMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/_portal/api/mail", { method: "DELETE" }),
    onSuccess: () => {
      qc.setQueriesData<MailList>({ queryKey: [...mailKeys.all, "list"] }, (old) => (old ? { ...old, messages: [], total: 0, count: 0 } : old));
      toast.success("Inbox cleared");
    },
    onError: (err) => toast.error("Couldn't clear the inbox", { description: errorMessage(err) }),
    onSettled: () => invalidateInbox(qc),
  });
}

export type MailStream = {
  connection: EventsStatus;
  /** Messages that arrived on the stream since the page opened. */
  arrived: number;
};

const idle: EventsStatus = { state: "connecting", attempt: 0 };

/**
 * Follows `mail/stream`: every `message` event lands at the front of each
 * cached inbox it matches (a search only sees what fits it) and bumps the
 * counts, so the list moves without a refetch. `onMessage` gets each one too.
 */
export function useMailStream(enabled: boolean, onMessage?: (m: MailSummary) => void): MailStream {
  const qc = useQueryClient();
  const [connection, setConnection] = useState<EventsStatus>(idle);
  const [arrived, setArrived] = useState(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      setConnection(idle);
      return;
    }
    const stop = subscribeSSE(
      "/_portal/api/mail/stream",
      (m) => {
        if (m.event !== "message") return;
        let summary: MailSummary;
        try {
          summary = JSON.parse(m.data) as MailSummary;
        } catch {
          return;
        }
        if (!summary || typeof summary.id !== "string") return;
        for (const query of qc.getQueryCache().findAll({ queryKey: [...mailKeys.all, "list"] })) {
          const q = String(query.queryKey[3] ?? "");
          qc.setQueryData<MailList>(query.queryKey, (old) => {
            if (!old) return old;
            const already = old.messages.some((x) => x.id === summary.id);
            const count = already ? old.count : old.count + 1;
            if (!matchesQuery(summary, q)) return { ...old, count };
            return { ...old, messages: mergeMessage(old.messages, summary, old.max), total: already ? old.total : old.total + 1, count };
          });
        }
        setArrived((n) => n + 1);
        onMessageRef.current?.(summary);
      },
      setConnection,
    );
    return stop;
  }, [enabled, qc]);

  return { connection, arrived };
}

/* ---------- Previews, through the dev console ---------- */

/** `GET /_dev/mail/previews`: what the app can render with sample data. Needs the console. */
export function useMailPreviews(enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.previews,
    queryFn: async () => (await apiFetch<MailPreviewList>("/_portal/app/_dev/mail/previews")).previews ?? [],
    enabled,
    staleTime: 60_000,
    retry,
  });
}

/** `GET /_dev/mail/preview?name=&to=`: one preview rendered; 404 `preview_not_found`. */
export function useMailPreview(name: string | null, to: string, enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.preview(name ?? "", to),
    queryFn: () => apiFetch<MailPreviewMessage>(`/_portal/app/_dev/mail/preview${queryString({ name: name ?? "", to: to || undefined })}`),
    enabled: enabled && Boolean(name),
    staleTime: 60_000,
    retry,
  });
}

/** `POST /_dev/mail/preview/send?name=&to=`: through the app's mailer, so it lands in the inbox like a real message. */
export function useSendPreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, to }: { name: string; to: string }) => apiFetch<MailPreviewSent>(`/_portal/app/_dev/mail/preview/send${queryString({ name, to: to || undefined })}`, { method: "POST" }),
    onSuccess: (r) => toast.success(`Sent ${r.name}`, { description: `to ${r.to} · it lands in the inbox in a moment` }),
    onError: (err) => {
      if (err instanceof ApiError && err.code === "invalid_address") toast.warning("That isn't an email address", { description: err.detail });
      else toast.error("Couldn't send the preview", { description: errorMessage(err) });
    },
    onSettled: () => setTimeout(() => invalidateInbox(qc), 1500),
  });
}

/**
 * Asks the inbox every 500 ms until a message newer than `since` is there
 * (up to `timeoutMs`), and answers it. For "Send to inbox": the sent
 * preview is selected as soon as the catcher has it.
 */
export async function waitForMessage(since: number, timeoutMs = 8000, signal?: AbortSignal): Promise<MailSummary | undefined> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && !signal?.aborted) {
    try {
      const list = await apiFetch<MailList>("/_portal/api/mail?limit=5");
      const fresh = list.messages.find((m) => Date.parse(m.time) >= since - 2000);
      if (fresh) return fresh;
    } catch {
      // The store may be busy; try again.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}
