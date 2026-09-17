"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileText, Moon, Paperclip, Sun, Trash2, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { MAIL_HTML_CSP, useDeleteMail, useMailHtml, useMailMessage, useMailSource, type MailDetail, type MailSummary } from "@/lib/api/mail";
import { copyText } from "@/lib/copy";
import { displayAddress, displayAddresses, formatCode, formatSize, linkHost, subjectOf } from "@/lib/mail/format";
import { when } from "@/lib/time";
import { ProblemPanel } from "@/components/shared/problem-panel";

type View = "html" | "text" | "source" | "headers";
type Scheme = "light" | "dark";

type Props = {
  id: string;
  /** The list's summary, so the header shows before the detail answers. */
  summary?: MailSummary;
  onDeleted: () => void;
  onClose: () => void;
};

/** One caught message: HTML (sandboxed), text, source and headers; its codes and links with copy buttons; attachments and the envelope; Delete. */
export function MessageDetail({ id, summary, onDeleted, onClose }: Props) {
  const detail = useMailMessage(id);
  const [view, setView] = useState<View>("html");
  const [scheme, setScheme] = useState<Scheme>("light");
  const source = useMailSource(id, view === "source");
  const remove = useDeleteMail();
  const [deleting, setDeleting] = useState(false);
  const d = detail.data;
  const head: MailSummary | MailDetail | undefined = d ?? summary;

  return (
    <Panel
      flush
      title={<span className="truncate">{head ? subjectOf(head) : "Message"}</span>}
      meta={head ? `${when(head.time)} · ${formatSize(head.size)}` : id}
      actions={
        <>
          <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setDeleting(true)} loading={remove.isPending}>
            Delete
          </Button>
          <Button size="sm" kind="ghost" onClick={onClose} aria-label="Close the message">
            <X size={12} />
          </Button>
        </>
      }
    >
      {detail.error && !d ? (
        <div className="p-3">
          <ProblemPanel error={detail.error} scope="portal" meta={`GET /_portal/api/mail/${id}`} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        </div>
      ) : !d ? (
        <SkeletonLines lines={10} className="p-4" />
      ) : (
        <div className="grid gap-3 px-4 pb-4">
          <KeyList
            rows={[
              { k: "From", v: displayAddress(d.from) },
              { k: "To", v: displayAddresses(d.to, 6) },
              ...(d.cc?.length ? [{ k: "Cc", v: displayAddresses(d.cc, 6) }] : []),
              ...(d.reply_to?.length ? [{ k: "Reply to", v: displayAddresses(d.reply_to, 6) }] : []),
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {d.category && <Badge tone="muted">{d.category}</Badge>}
            {d.has_html && <Badge tone="info">html</Badge>}
            {d.has_text && <Badge tone="info">text</Badge>}
            {d.attachments > 0 && (
              <Badge tone="muted">
                <Paperclip size={9} /> {d.attachments}
              </Badge>
            )}
            {d.message_id && (
              <Tooltip content={d.message_id}>
                <span className="truncate font-mono text-[11px] text-faint">{d.message_id}</span>
              </Tooltip>
            )}
          </div>
          {d.codes.length > 0 && <CodesBar codes={d.codes} />}
          <Tabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { value: "html", label: "HTML", disabled: !d.has_html && !d.has_text },
              { value: "text", label: "Text", badge: d.has_text ? undefined : "none" },
              { value: "source", label: "Source", badge: formatSize(d.source_bytes) },
              { value: "headers", label: "Headers", badge: Object.keys(d.headers).length },
            ]}
            actions={
              view === "html" ? (
                <Segmented<Scheme>
                  value={scheme}
                  onChange={setScheme}
                  options={[
                    { value: "light", label: <Sun size={12} aria-label="Light background" /> },
                    { value: "dark", label: <Moon size={12} aria-label="Dark background" /> },
                  ]}
                />
              ) : undefined
            }
          >
            <TabPanel value="html">
              <HtmlFrame d={d} scheme={scheme} />
            </TabPanel>
            <TabPanel value="text">
              {d.text ? (
                <div className="grid gap-2">
                  <div className="flex justify-end">
                    <Button size="sm" kind="ghost" icon={<Copy size={11} />} onClick={() => void copyText(d.text, "Copied the text")}>
                      Copy text
                    </Button>
                  </div>
                  <Code className="max-h-[520px] overflow-auto whitespace-pre-wrap text-text">{d.text}</Code>
                </div>
              ) : (
                <Empty title="No text part" hint="This message only has HTML." />
              )}
            </TabPanel>
            <TabPanel value="source">
              {source.error ? (
                <ProblemPanel error={source.error} scope="portal" meta={`GET /_portal/api/mail/${id}/source`} onRetry={() => void source.refetch()} retrying={source.isFetching} />
              ) : source.data === undefined ? (
                <SkeletonLines lines={8} />
              ) : (
                <div className="grid gap-2">
                  <div className="flex justify-end">
                    <Button size="sm" kind="ghost" icon={<Copy size={11} />} onClick={() => void copyText(source.data, "Copied the source")}>
                      Copy source
                    </Button>
                  </div>
                  <Code className="max-h-[520px] overflow-auto whitespace-pre-wrap">{source.data}</Code>
                </div>
              )}
            </TabPanel>
            <TabPanel value="headers">
              <div className="overflow-x-auto rounded-lg border border-hairline">
                <table className="w-full text-[12px]">
                  <tbody>
                    {Object.entries(d.headers)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <tr key={k} className="border-t border-hairline first:border-0">
                          <th scope="row" className="w-[180px] px-3 py-1.5 text-left align-top font-mono font-normal text-dim">
                            {k}
                          </th>
                          <td className="px-3 py-1.5 font-mono text-text break-all">{v}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>
          </Tabs>
          <div className="grid grid-cols-2 gap-3">
            <Panel title="Links" meta={`${d.links.length}`} flush>
              {d.links.length === 0 ? (
                <p className="px-4 pb-3 text-[12px] text-dim">No links in this message.</p>
              ) : (
                <ul className="max-h-[220px] overflow-y-auto">
                  {d.links.map((l) => {
                    const { host, local } = linkHost(l.url);
                    return (
                      <li key={l.url} className="flex items-center gap-2 border-t border-hairline px-4 py-2 first:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-text">{l.text || host}</div>
                          <div className="truncate font-mono text-[11px] text-dim">{l.url}</div>
                        </div>
                        {local && <Badge tone="accent">bench</Badge>}
                        <Tooltip content="Copy the URL">
                          <Button size="sm" kind="ghost" onClick={() => void copyText(l.url, "Copied the link")} aria-label="Copy the link">
                            <Copy size={11} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Open in a new tab">
                          <a href={l.url} target="_blank" rel="noreferrer noopener" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-elevated hover:text-text" aria-label="Open the link">
                            <ExternalLink size={11} />
                          </a>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
            <div className="grid gap-3">
              <Panel title="Attachments" meta={`${d.attachment_list.length}`} flush>
                {d.attachment_list.length === 0 ? (
                  <p className="px-4 pb-3 text-[12px] text-dim">None.</p>
                ) : (
                  <ul>
                    {d.attachment_list.map((a, i) => (
                      <li key={`${a.name}-${i}`} className="flex items-center gap-2 border-t border-hairline px-4 py-2 first:border-0">
                        <FileText size={13} className="shrink-0 text-dim" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[12px] text-text">{a.name}</div>
                          <div className="truncate text-[11px] text-dim">{a.content_type}</div>
                        </div>
                        <span className="font-mono text-[11px] text-dim">{formatSize(a.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Envelope" meta="what SMTP said">
                <KeyList
                  rows={[
                    { k: "MAIL FROM", v: d.envelope.from || "—" },
                    { k: "RCPT TO", v: d.envelope.to.join(", ") || "—" },
                  ]}
                />
              </Panel>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this message?"
        description={head ? `“${subjectOf(head)}” to ${displayAddresses(head.to)} is removed from the inbox.` : "The message is removed from the inbox."}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => onDeleted(),
            onSettled: () => setDeleting(false),
          })
        }
      />
    </Panel>
  );
}

/** The codes the parser found, each with a copy button; the copied value is the code as written. */
function CodesBar({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">{codes.length === 1 ? "Code" : "Codes"}</span>
      {codes.map((c) => (
        <button key={c} type="button" onClick={() => void copyText(c, `Copied ${c}`)} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-surface px-2 py-1 font-mono text-[13px] font-semibold tracking-[0.08em] text-text hover:border-primary" aria-label={`Copy ${c}`}>
          {formatCode(c)}
          <Copy size={11} className="text-dim" />
        </button>
      ))}
    </div>
  );
}

/**
 * The HTML body in a sandboxed iframe: `mail/{id}/html` fetched as text
 * and rendered as `srcdoc` with `sandbox` (no scripts, an opaque origin)
 * and the portal's CSP repeated as a `<meta>` (images and inline styles
 * only). The toggle sets the frame's background, for messages that don't
 * set their own.
 */
function HtmlFrame({ d, scheme }: { d: MailDetail; scheme: Scheme }) {
  const html = useMailHtml(d.id, true);
  if (html.error) return <ProblemPanel error={html.error} scope="portal" meta={`GET /_portal/api/mail/${d.id}/html`} onRetry={() => void html.refetch()} retrying={html.isFetching} />;
  if (html.data === undefined) return <SkeletonLines lines={8} />;
  const doc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MAIL_HTML_CSP}">${html.data}`;
  return (
    <div className={`overflow-hidden rounded-lg border border-hairline ${scheme === "light" ? "bg-white" : "bg-[#141416]"}`}>
      <iframe key={d.id} title={`${subjectOf(d)} (HTML)`} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} className="h-[520px] w-full" style={{ colorScheme: scheme }} />
    </div>
  );
}
