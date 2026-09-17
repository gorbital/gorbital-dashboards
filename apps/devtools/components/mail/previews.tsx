"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Moon, Send, Sun } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { DEFAULT_PREVIEW_TO, useMailPreview, useMailPreviews, useSendPreview, waitForMessage } from "@/lib/api/mail";
import { useCapabilities } from "@/lib/api/queries";
import { copyText } from "@/lib/copy";
import { groupPreviews, previewTitle } from "@/lib/mail/format";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";

type View = "html" | "text";
type Scheme = "light" | "dark";

type Props = {
  selected: string | null;
  onSelect: (name: string | null) => void;
  /** Called with the caught message's ID once a sent preview reached the inbox. */
  onSent: (id: string | undefined) => void;
};

/** The app's email previews: the list by category, one rendered with sample data for a recipient, and Send to inbox. */
export function Previews({ selected, onSelect, onSent }: Props) {
  const caps = useCapabilities();
  const previews = useMailPreviews(caps.console);
  const [to, setTo] = useState(DEFAULT_PREVIEW_TO);
  const [renderTo, setRenderTo] = useState(DEFAULT_PREVIEW_TO);
  const [view, setView] = useState<View>("html");
  const [scheme, setScheme] = useState<Scheme>("light");
  const preview = useMailPreview(selected, renderTo, caps.console);
  const send = useSendPreview();
  const [waiting, setWaiting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const groups = groupPreviews(previews.data ?? []);
  const p = preview.data;

  const commitTo = () => setRenderTo(to.trim() || DEFAULT_PREVIEW_TO);
  const sendIt = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    commitTo();
    const since = Date.now();
    try {
      await send.mutateAsync({ name: selected, to: to.trim() || DEFAULT_PREVIEW_TO });
    } catch {
      return; // the hook toasted
    }
    setWaiting(true);
    abort.current?.abort();
    abort.current = new AbortController();
    const m = await waitForMessage(since, 8000, abort.current.signal);
    setWaiting(false);
    onSent(m?.id);
  };

  return (
    <Gate need="console" loading={<SkeletonLines lines={8} className="p-4" />}>
      <div className="grid min-h-[520px] grid-cols-[260px_minmax(0,1fr)] gap-3">
        <Panel title="Previews" meta={previews.data ? `${previews.data.length} · /_dev/mail/previews` : "/_dev/mail/previews"} flush>
          {previews.error && !previews.data ? (
            <div className="p-3">
              <ProblemPanel error={previews.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/mail/previews" onRetry={() => void previews.refetch()} retrying={previews.isFetching} />
            </div>
          ) : previews.isPending ? (
            <SkeletonLines lines={8} className="p-4" />
          ) : groups.length === 0 ? (
            <Empty title="No previews" hint="The app registers none; add them in internal/app/mail_previews.go." />
          ) : (
            <ul className="max-h-[calc(100vh-300px)] overflow-y-auto pb-2">
              {groups.map((g) => (
                <li key={g.category}>
                  <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{g.label}</div>
                  <ul>
                    {g.previews.map((pv) => (
                      <li key={pv.name}>
                        <button type="button" onClick={() => onSelect(pv.name)} aria-current={pv.name === selected || undefined} className={`block w-full px-4 py-1.5 text-left transition-colors hover:bg-elevated/40 ${pv.name === selected ? "bg-elevated/70" : ""}`}>
                          <div className={`text-[12px] ${pv.name === selected ? "font-medium text-text" : "text-muted"}`}>{previewTitle(pv.name)}</div>
                          <div className="truncate font-mono text-[10.5px] text-dim">{pv.name}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="min-w-0">
          {!selected ? (
            <Panel className="h-full">
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center">
                <div className="text-[13px] font-medium text-muted">Select a preview</div>
                <p className="max-w-sm text-[12px] text-dim">Each is the real message builder run with sample data, so what you see is what users get. Send it to the inbox to read it as the catcher does.</p>
              </div>
            </Panel>
          ) : (
            <Panel
              flush
              title={<span className="truncate">{p?.subject ?? previewTitle(selected)}</span>}
              meta={selected}
              actions={
                <>
                  {p && (
                    <Button size="sm" kind="ghost" icon={<Copy size={11} />} onClick={() => void copyText(p.subject, "Copied the subject")}>
                      Copy subject
                    </Button>
                  )}
                  {p?.text && (
                    <Button size="sm" kind="ghost" icon={<Copy size={11} />} onClick={() => void copyText(p.text, "Copied the text")}>
                      Copy text
                    </Button>
                  )}
                </>
              }
            >
              <div className="grid gap-3 px-4 pb-4">
                <form onSubmit={(e) => void sendIt(e)} className="flex flex-wrap items-end gap-2">
                  <Field label="To" htmlFor="preview-to" hint="Rendered for this address; Enter or blur re-renders." className="min-w-[260px] flex-1">
                    <Input id="preview-to" mono value={to} onChange={(e) => setTo(e.target.value)} onBlur={commitTo} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitTo())} placeholder={DEFAULT_PREVIEW_TO} />
                  </Field>
                  <Button type="submit" size="md" kind="primary" icon={<Send size={12} />} loading={send.isPending || waiting} disabled={!selected}>
                    {waiting ? "Waiting for the inbox…" : "Send to inbox"}
                  </Button>
                </form>
                {preview.error && !p ? (
                  <ProblemPanel error={preview.error} scope="dev" console={caps.consoleDeclared} meta={`GET /_dev/mail/preview?name=${selected}`} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />
                ) : !p ? (
                  <SkeletonLines lines={8} />
                ) : (
                  <>
                    <KeyList
                      rows={[
                        { k: "Subject", v: p.subject },
                        { k: "To", v: p.to },
                        { k: "About", v: <span className="font-sans text-muted">{p.description}</span> },
                      ]}
                    />
                    <div className="flex items-center gap-1.5">
                      <Badge tone="muted">{p.category}</Badge>
                      {p.html ? <Badge tone="info">html</Badge> : <Badge tone="muted">text only</Badge>}
                    </div>
                    <Tabs<View>
                      value={view}
                      onChange={setView}
                      tabs={[
                        { value: "html", label: "HTML" },
                        { value: "text", label: "Text" },
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
                        <div className={`overflow-hidden rounded-lg border border-hairline ${scheme === "light" ? "bg-white" : "bg-[#141416]"}`}>
                          <iframe key={`${p.name}-${p.to}`} title={`${p.subject} (HTML)`} sandbox="" referrerPolicy="no-referrer" srcDoc={p.html || `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap">${p.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`} className="h-[480px] w-full" style={{ colorScheme: scheme }} />
                        </div>
                      </TabPanel>
                      <TabPanel value="text">
                        <Code className="max-h-[480px] overflow-auto whitespace-pre-wrap text-text">{p.text || "(no text part)"}</Code>
                      </TabPanel>
                    </Tabs>
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </Gate>
  );
}
